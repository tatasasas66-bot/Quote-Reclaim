import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/security/require-cron";
import { getMessagingService } from "@/lib/messaging/service";
import { normalizePhone } from "@/lib/messaging/phone";
import type { SmsProvider, SmsResult } from "@/lib/messaging/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_NAME = "send_reminders";

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

  // Resolve the messaging provider up front. In production with no Twilio
  // config this throws — record a failed run rather than silently simulate.
  let provider: SmsProvider;
  try {
    provider = getMessagingService();
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
  const errors: Array<{ reminder_id: string; error: string }> = [];

  for (const r of claimed) {
    // Defence in depth: the RPC already filters opted-out quotes, but if
    // the column flipped between claim and send, honor it.
    if (r.client_opted_out) {
      await releaseClaim(supabase, r.reminder_id);
      skipped++;
      continue;
    }

    // Phase 10 only sends SMS. Email channel is reserved for later.
    if (r.message_type !== "sms") {
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

    let smsResult: SmsResult;
    try {
      smsResult = await provider.send({ to: phone, body: r.message_text });
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

    // Emit message_sent event (idempotent via unique (source_event_id, event_type)).
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
      console.error("[cron:send] message_sent event insert failed", evtError.message);
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
    },
  });

  return NextResponse.json({
    cron_run_id: cronRunId,
    claimed: claimed.length,
    sent,
    failed,
    skipped,
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
