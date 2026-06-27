import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { sendRecoveryEmail } from "@/lib/messaging/email-provider";
import { appBaseUrl } from "@/lib/quotes/one-tap-reply";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";
import {
  pickSundayResetQuote,
  sundayResetEmail,
  type SundayResetCandidate,
} from "@/lib/recovery/sunday-reset";
import { requireCronAuth } from "@/lib/security/require-cron";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { recordAuditEvent } from "@/lib/audit-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_NAME = "weekly_briefing";

type QuoteRow = {
  id: string;
  user_id: string;
  client_name: string;
  estimate_amount: number;
  days_silent: number;
  quote_sent_at: string | null;
  created_at: string;
  outcome: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleBriefing(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleBriefing(request);
}

async function handleBriefing(request: NextRequest): Promise<NextResponse> {
  const auth = requireCronAuth(request);
  if (!auth.ok) {
    return new NextResponse(auth.error, { status: auth.status });
  }

  const supabase = createServiceSupabaseClient();
  const cronRunId = randomUUID();
  const now = new Date();

  await supabase.from("cron_runs").insert({
    id: cronRunId,
    cron_name: CRON_NAME,
    status: "running",
  });

  const [profilesResult, quotesResult, remindersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, briefing_enabled")
      .eq("briefing_enabled", true),
    supabase
      .from("quotes")
      .select(
        "id, user_id, client_name, estimate_amount, days_silent, quote_sent_at, created_at, outcome",
      )
      .eq("outcome", "pending"),
    supabase
      .from("reminders")
      .select("quote_id, user_id, sent, sent_at, paused_at"),
  ]);

  const loadError =
    profilesResult.error ?? quotesResult.error ?? remindersResult.error;
  if (loadError) {
    await finalize(cronRunId, "failed", {
      errors: [{ stage: "load", code: loadError.code ?? "unknown" }],
    });
    return NextResponse.json(
      { error: "Sunday Reset data load failed", cron_run_id: cronRunId },
      { status: 500 },
    );
  }

  const remindersByQuote = new Map<
    string,
    Array<{ sent: boolean; sent_at: string | null; paused_at: string | null }>
  >();
  for (const reminder of remindersResult.data ?? []) {
    const quoteId = String(reminder.quote_id);
    const rows = remindersByQuote.get(quoteId) ?? [];
    rows.push({
      sent: Boolean(reminder.sent),
      sent_at: reminder.sent_at,
      paused_at: reminder.paused_at,
    });
    remindersByQuote.set(quoteId, rows);
  }

  const quotesByUser = new Map<string, SundayResetCandidate[]>();
  for (const rawQuote of quotesResult.data ?? []) {
    const quote = rawQuote as QuoteRow;
    const reminders = remindersByQuote.get(quote.id) ?? [];
    const unsent = reminders.filter((reminder) => !reminder.sent);
    const paused =
      unsent.length > 0 &&
      unsent.every((reminder) => reminder.paused_at !== null);
    const lastContactAt =
      reminders
        .filter((reminder) => reminder.sent && reminder.sent_at)
        .map((reminder) => String(reminder.sent_at))
        .sort()
        .at(-1) ?? null;
    const rows = quotesByUser.get(quote.user_id) ?? [];
    rows.push({
      id: quote.id,
      clientLabel: quote.client_name || "Quiet estimate",
      amount: Number(quote.estimate_amount ?? 0),
      daysQuiet: effectiveDaysSilent(quote, now.getTime()),
      outcome: quote.outcome,
      paused,
      lastContactAt,
    });
    quotesByUser.set(quote.user_id, rows);
  }

  let sent = 0;
  let noEligibleQuote = 0;
  const errors: Array<{ user_id: string; code: string }> = [];

  for (const profile of profilesResult.data ?? []) {
    const userId = String(profile.id);
    const email = String(profile.email ?? "").trim();
    if (!email) continue;

    const pick = pickSundayResetQuote(
      quotesByUser.get(userId) ?? [],
      now.getTime(),
    );
    if (!pick) {
      noEligibleQuote += 1;
      continue;
    }

    const recoveryPlanUrl = `${appBaseUrl()}/quotes/${pick.id}?source=sunday-reset`;
    const message = sundayResetEmail({ quote: pick, recoveryPlanUrl });
    const result = await sendRecoveryEmail({
      to: email,
      subject: message.subject,
      body: message.body,
    });
    if (result.ok) {
      sent += 1;
      await recordAuditEvent(supabase, {
        userId,
        quoteId: pick.id,
        type: "sunday_reset_sent",
        meta: { expectedRecoveryValue: pick.expectedRecoveryValue },
      });
    } else {
      errors.push({ user_id: userId, code: "email_send_failed" });
    }
  }

  const status = errors.length > 0 ? "partial" : "success";
  await finalize(cronRunId, status, {
    reminders_sent: sent,
    errors,
    metadata: {
      event: "sunday_reset_sent",
      enabled_contractors: profilesResult.data?.length ?? 0,
      sent,
      no_eligible_quote: noEligibleQuote,
      schedule_timezone: "UTC",
    },
  });

  return NextResponse.json({
    cron_run_id: cronRunId,
    sent,
    no_eligible_quote: noEligibleQuote,
    errors: errors.length,
  });

  async function finalize(
    id: string,
    status: "success" | "partial" | "failed",
    values: {
      reminders_sent?: number;
      errors?: unknown[];
      metadata?: Record<string, unknown>;
    },
  ) {
    await supabase
      .from("cron_runs")
      .update({
        status,
        reminders_sent: values.reminders_sent ?? 0,
        errors: values.errors ?? [],
        metadata: values.metadata ?? {},
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
  }
}
