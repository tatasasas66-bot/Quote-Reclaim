import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/security/require-cron";
import { sendRecoveryEmail } from "@/lib/messaging/email-provider";
import { recoveryEmailSubject } from "@/lib/messaging/select-channel";
import { getMessagingService } from "@/lib/messaging/service";
import { normalizePhone } from "@/lib/messaging/phone";
import type { SmsProvider, SmsResult } from "@/lib/messaging/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_NAME = "send_reminders";

/**
 * Reminders left in a "claimed but not yet sent" state for longer than this
 * window are considered abandoned (process crash, deploy mid-run, provider
 * exception that skipped both branches of release). The next cron tick
 * releases them so the schedule self-heals. 30 minutes is far longer than
 * a healthy cron run, so live claims are never disturbed.
 */
const STALE_CLAIM_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Maximum reminders a single contractor can attempt to send in one cron
 * tick. Bounds per-tenant SMS burst regardless of how many quotes are
 * simultaneously due. Excess rows are released so the next tick picks
 * them up. The same cap applies to email so cost stays bounded too.
 */
const PER_USER_SEND_CAP_PER_RUN = 5;

const SMS_ENABLED = process.env.SMS_ENABLED === "true";

type ClaimedReminder = {
  reminder_id: string;
  user_id: string;
  quote_id: string;
  followup_number: number;
  message_type: string;
  message_text: string;
  framework_used: string | null;
  cta_type: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  client_opted_out: boolean;
  trade: string | null;
  city: string | null;
  state: string | null;
  estimate_amount: number | null;
  sequence_id: string;
  client_name: string | null;
};

type CronSupabase = ReturnType<typeof createServiceSupabaseClient>;

async function releaseStaleClaims(
  supabase: CronSupabase,
  maxAgeMs: number,
): Promise<{ released: number; error?: string }> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const { data, error } = await supabase
    .from("reminders")
    .update({ claimed_by: null, claimed_at: null })
    .lt("claimed_at", cutoff)
    .eq("sent", false)
    .not("claimed_by", "is", null)
    .select("id");
  if (error) return { released: 0, error: error.message };
  return { released: data?.length ?? 0 };
}

async function finalizeCronRun(
  supabase: CronSupabase,
  cronRunId: string,
  patch: {
    status: "success" | "partial" | "failed";
    reminders_sent?: number;
    errors?: unknown[];
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase
    .from("cron_runs")
    .update({
      status: patch.status,
      reminders_sent: patch.reminders_sent ?? 0,
      errors: patch.errors ?? [],
      metadata: patch.metadata ?? {},
      completed_at: new Date().toISOString(),
    })
    .eq("id", cronRunId);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleSend(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleSend(request);
}

async function handleSend(request: NextRequest): Promise<NextResponse> {
  const auth = requireCronAuth(request);
  if (!auth.ok) {
    return new NextResponse(auth.error, { status: auth.status });
  }

  const supabase = createServiceSupabaseClient();
  const cronRunId = randomUUID();

  await supabase.from("cron_runs").insert({
    id: cronRunId,
    cron_name: CRON_NAME,
    status: "running",
  });

  // SMS provider is resolved up front only when SMS_ENABLED. With SMS off
  // (the default), an email-only deploy must not require Twilio. When SMS
  // is on and Twilio isn't configured, fail closed — never silently simulate.
  let smsProvider: SmsProvider | null = null;
  if (SMS_ENABLED) {
    try {
      smsProvider = getMessagingService();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Messaging unavailable";
      await finalizeCronRun(supabase, cronRunId, {
        status: "failed",
        errors: [{ stage: "provider", error: message }],
      });
      return NextResponse.json(
        { error: "Messaging unavailable", cron_run_id: cronRunId },
        { status: 503 },
      );
    }
  }

  // Self-heal: free any reminders that were claimed by a prior run that
  // died mid-flight. Live runs are bounded well under STALE_CLAIM_MAX_AGE_MS
  // so this never disturbs in-flight work.
  const staleRelease = await releaseStaleClaims(
    supabase,
    STALE_CLAIM_MAX_AGE_MS,
  );

  const { data: claimedRows, error: claimError } = await supabase.rpc(
    "claim_due_reminders",
    { p_cron_run_id: cronRunId },
  );

  if (claimError) {
    await finalizeCronRun(supabase, cronRunId, {
      status: "failed",
      errors: [{ stage: "claim", error: claimError.message }],
    });
    return NextResponse.json(
      { error: "Claim failed", cron_run_id: cronRunId },
      { status: 500 },
    );
  }

  const claimed = (claimedRows ?? []) as ClaimedReminder[];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let capDeferred = 0;
  const errors: Array<{ reminder_id: string; error: string }> = [];
  // Per-user attempt counter. We count anything that reaches the provider,
  // not only successes, so the per-user cap bounds outbound load even when
  // sends fail. Skipped rows (opt-out / wrong channel / bad recipient) do
  // not consume the cap.
  const perUserAttempts = new Map<string, number>();

  for (const r of claimed) {
    // Defence in depth: the RPC already filters opted-out quotes, but if
    // the column flipped between claim and send, honor it.
    if (r.client_opted_out) {
      await releaseClaim(supabase, r.reminder_id);
      skipped++;
      continue;
    }

    // Route by message_type. Email is the primary path. SMS only runs when
    // SMS_ENABLED is on AND the row was generated as an sms reminder.
    if (r.message_type === "email") {
      const to = r.recipient_email?.trim();
      if (!to) {
        await releaseClaim(supabase, r.reminder_id);
        skipped++;
        continue;
      }

      const attempts = perUserAttempts.get(r.user_id) ?? 0;
      if (attempts >= PER_USER_SEND_CAP_PER_RUN) {
        await releaseClaim(supabase, r.reminder_id);
        capDeferred++;
        continue;
      }
      perUserAttempts.set(r.user_id, attempts + 1);

      const emailResult = await sendRecoveryEmail({
        to,
        subject: recoveryEmailSubject(r.trade ?? "your"),
        body: r.message_text,
      });

      const now = new Date().toISOString();

      await supabase.from("outbound_messages").insert({
        user_id: r.user_id,
        quote_id: r.quote_id,
        reminder_id: r.reminder_id,
        channel: "email",
        recipient: to,
        message_text: r.message_text,
        status: emailResult.ok ? "sent" : "failed",
        provider_msg_id: emailResult.ok ? emailResult.providerMessageId : null,
        failure_reason: emailResult.ok ? null : emailResult.error,
        sent_at: emailResult.ok ? now : null,
        idempotency_key: `cron:${r.reminder_id}:${cronRunId}`,
      });

      if (!emailResult.ok) {
        await releaseClaim(supabase, r.reminder_id);
        failed++;
        errors.push({ reminder_id: r.reminder_id, error: emailResult.error });
        continue;
      }

      await supabase
        .from("reminders")
        .update({ sent: true, sent_at: now })
        .eq("id", r.reminder_id);

      const { error: evtError } = await supabase.from("recovery_events").insert({
        user_id: r.user_id,
        sequence_id: r.sequence_id,
        quote_id: r.quote_id,
        event_type: "message_sent",
        source_event_id: emailResult.providerMessageId,
        trade: r.trade,
        city: r.city,
        state: r.state,
        estimate_amount: r.estimate_amount,
        channel: "email",
        message_text: r.message_text,
        framework_used: r.framework_used,
        cta_type: r.cta_type,
        followup_number: r.followup_number,
        message_type: r.message_type,
      });
      if (evtError && evtError.code !== "23505") {
        console.error(
          "[cron:send] message_sent event insert failed",
          evtError.message,
        );
      }

      if (r.followup_number === 5) {
        const { error: closedErr } = await supabase
          .from("recovery_events")
          .insert({
            user_id: r.user_id,
            sequence_id: r.sequence_id,
            quote_id: r.quote_id,
            event_type: "sequence_closed",
            source_event_id: `${r.sequence_id}:closed`,
            trade: r.trade,
            city: r.city,
            state: r.state,
            estimate_amount: r.estimate_amount,
            channel: "email",
          });
        if (closedErr && closedErr.code !== "23505") {
          console.error(
            "[cron:send] sequence_closed event insert failed",
            closedErr.message,
          );
        }
      }

      sent++;
      continue;
    }

    // SMS branch — kept dormant behind SMS_ENABLED so the Twilio code path
    // stays exercised but doesn't run by default.
    if (r.message_type !== "sms" || !SMS_ENABLED || !smsProvider) {
      await releaseClaim(supabase, r.reminder_id);
      skipped++;
      continue;
    }

    const phone = normalizePhone(r.recipient_phone);
    if (!phone) {
      await releaseClaim(supabase, r.reminder_id);
      skipped++;
      continue;
    }

    // Per-user send cap: release excess so the next tick picks them up.
    const attempts = perUserAttempts.get(r.user_id) ?? 0;
    if (attempts >= PER_USER_SEND_CAP_PER_RUN) {
      await releaseClaim(supabase, r.reminder_id);
      capDeferred++;
      continue;
    }
    perUserAttempts.set(r.user_id, attempts + 1);

    let smsResult: SmsResult;
    try {
      smsResult = await smsProvider.send({
        to: phone,
        body: r.message_text,
      });
    } catch (err) {
      smsResult = {
        ok: false,
        error: err instanceof Error ? err.message : "Provider exception",
      };
    }

    const now = new Date().toISOString();

    await supabase.from("outbound_messages").insert({
      user_id: r.user_id,
      quote_id: r.quote_id,
      reminder_id: r.reminder_id,
      channel: "sms",
      recipient: phone,
      message_text: r.message_text,
      status: smsResult.ok ? "sent" : "failed",
      provider_msg_id: smsResult.ok ? smsResult.providerMessageId : null,
      failure_reason: smsResult.ok ? null : smsResult.error,
      sent_at: smsResult.ok ? now : null,
      idempotency_key: `cron:${r.reminder_id}:${cronRunId}`,
    });

    if (!smsResult.ok) {
      // Release the claim so a future cron run can retry. Twilio returns an
      // error only when the message was not queued, so retry is safe.
      await releaseClaim(supabase, r.reminder_id);
      failed++;
      errors.push({ reminder_id: r.reminder_id, error: smsResult.error });
      continue;
    }

    await supabase
      .from("reminders")
      .update({ sent: true, sent_at: now })
      .eq("id", r.reminder_id);

    const { error: evtError } = await supabase.from("recovery_events").insert({
      user_id: r.user_id,
      sequence_id: r.sequence_id,
      quote_id: r.quote_id,
      event_type: "message_sent",
      source_event_id: smsResult.providerMessageId,
      trade: r.trade,
      city: r.city,
      state: r.state,
      estimate_amount: r.estimate_amount,
      channel: "sms",
      message_text: r.message_text,
      framework_used: r.framework_used,
      cta_type: r.cta_type,
      followup_number: r.followup_number,
      message_type: r.message_type,
    });
    if (evtError && evtError.code !== "23505") {
      console.error(
        "[cron:send] message_sent event insert failed",
        evtError.message,
      );
    }

    if (r.followup_number === 3) {
      const { error: closedErr } = await supabase.from("recovery_events").insert({
        user_id: r.user_id,
        sequence_id: r.sequence_id,
        quote_id: r.quote_id,
        event_type: "sequence_closed",
        source_event_id: `${r.sequence_id}:closed`,
        trade: r.trade,
        city: r.city,
        state: r.state,
        estimate_amount: r.estimate_amount,
        channel: "sms",
      });
      if (closedErr && closedErr.code !== "23505") {
        console.error(
          "[cron:send] sequence_closed event insert failed",
          closedErr.message,
        );
      }
    }

    sent++;
  }

  const finalStatus: "success" | "partial" | "failed" =
    failed === 0
      ? "success"
      : sent > 0
        ? "partial"
        : claimed.length === 0
          ? "success"
          : "failed";

  await finalizeCronRun(supabase, cronRunId, {
    status: finalStatus,
    reminders_sent: sent,
    errors,
    metadata: {
      claimed: claimed.length,
      skipped,
      failed,
      cap_deferred: capDeferred,
      stale_claims_released: staleRelease.released,
      stale_release_error: staleRelease.error ?? null,
      per_user_cap: PER_USER_SEND_CAP_PER_RUN,
      stale_claim_max_age_ms: STALE_CLAIM_MAX_AGE_MS,
      sms_enabled: SMS_ENABLED,
    },
  });

  return NextResponse.json({
    cron_run_id: cronRunId,
    claimed: claimed.length,
    sent,
    failed,
    skipped,
    cap_deferred: capDeferred,
    stale_claims_released: staleRelease.released,
  });
}

async function releaseClaim(
  supabase: CronSupabase,
  reminderId: string,
): Promise<void> {
  await supabase
    .from("reminders")
    .update({ claimed_by: null, claimed_at: null })
    .eq("id", reminderId);
}
