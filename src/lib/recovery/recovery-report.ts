import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveDaysSilent } from "./effective-days";
import {
  pickSundayResetQuote,
  type SundayResetPick,
} from "./sunday-reset";

type ReportQuote = {
  id: string;
  client_name: string;
  trade: string;
  estimate_amount: number;
  days_silent: number;
  quote_sent_at: string | null;
  created_at: string;
  outcome: string;
  won_at: string | null;
};

type ReportReminder = {
  quote_id: string;
  sent: boolean;
  sent_at: string | null;
  paused_at: string | null;
};

export type RecoveryReportData = {
  followupsSentThisMonth: number;
  repliesReceivedThisMonth: number;
  jobsBookedThisMonth: number;
  estimatedRecoveredThisMonth: number;
  allTimeRecoveredRevenue: number;
  quotesStillAtRisk: number;
  nextPriority: SundayResetPick | null;
  messagePerformanceReady: false;
};

export async function getRecoveryReportData(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<RecoveryReportData> {
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const [quotesResult, remindersResult, repliesResult] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, client_name, trade, estimate_amount, days_silent, quote_sent_at, created_at, outcome, won_at",
      )
      .eq("user_id", userId),
    supabase
      .from("reminders")
      .select("quote_id, sent, sent_at, paused_at")
      .eq("user_id", userId),
    supabase
      .from("recovery_events")
      .select("created_at")
      .eq("user_id", userId)
      .eq("event_type", "reply_received")
      .gte("created_at", monthStart.toISOString())
      .lt("created_at", nextMonthStart.toISOString()),
  ]);

  if (quotesResult.error) {
    throw new Error(`Recovery report quotes failed: ${quotesResult.error.message}`);
  }
  if (remindersResult.error) {
    throw new Error(
      `Recovery report reminders failed: ${remindersResult.error.message}`,
    );
  }
  if (repliesResult.error) {
    throw new Error(
      `Recovery report replies failed: ${repliesResult.error.message}`,
    );
  }

  return buildRecoveryReportData({
    quotes: (quotesResult.data ?? []) as ReportQuote[],
    reminders: (remindersResult.data ?? []) as ReportReminder[],
    repliesReceivedThisMonth: repliesResult.data?.length ?? 0,
    monthStartMs: monthStart.getTime(),
    nextMonthStartMs: nextMonthStart.getTime(),
    nowMs: now.getTime(),
  });
}

export function buildRecoveryReportData(input: {
  quotes: ReportQuote[];
  reminders: ReportReminder[];
  repliesReceivedThisMonth: number;
  monthStartMs: number;
  nextMonthStartMs: number;
  nowMs: number;
}): RecoveryReportData {
  const remindersByQuote = new Map<string, ReportReminder[]>();
  for (const reminder of input.reminders) {
    const rows = remindersByQuote.get(reminder.quote_id) ?? [];
    rows.push(reminder);
    remindersByQuote.set(reminder.quote_id, rows);
  }

  const sentThisMonth = input.reminders.filter((reminder) => {
    if (!reminder.sent || !reminder.sent_at) return false;
    const sentAt = Date.parse(reminder.sent_at);
    return sentAt >= input.monthStartMs && sentAt < input.nextMonthStartMs;
  });

  const wonQuotes = input.quotes.filter(
    (quote) => quote.outcome === "won" && quote.won_at,
  );
  const wonThisMonth = wonQuotes.filter((quote) => {
    const wonAt = Date.parse(String(quote.won_at));
    return wonAt >= input.monthStartMs && wonAt < input.nextMonthStartMs;
  });
  const recoveredQuotes = wonQuotes.filter((quote) => {
    const wonAt = Date.parse(String(quote.won_at));
    return (remindersByQuote.get(quote.id) ?? []).some((reminder) => {
      if (!reminder.sent || !reminder.sent_at) return false;
      const sentAt = Date.parse(reminder.sent_at);
      return !Number.isNaN(sentAt) && sentAt <= wonAt;
    });
  });
  const recoveredThisMonth = recoveredQuotes.filter((quote) => {
    const wonAt = Date.parse(String(quote.won_at));
    return wonAt >= input.monthStartMs && wonAt < input.nextMonthStartMs;
  });

  const pendingQuotes = input.quotes.filter(
    (quote) => quote.outcome === "pending",
  );
  const quotesStillAtRisk = pendingQuotes.filter(
    (quote) => effectiveDaysSilent(quote, input.nowMs) >= 7,
  ).length;
  const nextPriority = pickSundayResetQuote(
    pendingQuotes.map((quote) => {
      const reminders = remindersByQuote.get(quote.id) ?? [];
      const unsent = reminders.filter((reminder) => !reminder.sent);
      return {
        id: quote.id,
        clientLabel: quote.client_name || "Quiet estimate",
        amount: Number(quote.estimate_amount ?? 0),
        daysQuiet: effectiveDaysSilent(quote, input.nowMs),
        outcome: quote.outcome,
        paused:
          unsent.length > 0 &&
          unsent.every((reminder) => reminder.paused_at !== null),
        lastContactAt:
          reminders
            .filter((reminder) => reminder.sent && reminder.sent_at)
            .map((reminder) => String(reminder.sent_at))
            .sort()
            .at(-1) ?? null,
      };
    }),
    input.nowMs,
  );

  return {
    followupsSentThisMonth: sentThisMonth.length,
    repliesReceivedThisMonth: input.repliesReceivedThisMonth,
    jobsBookedThisMonth: wonThisMonth.length,
    estimatedRecoveredThisMonth: sumAmounts(recoveredThisMonth),
    allTimeRecoveredRevenue: sumAmounts(recoveredQuotes),
    quotesStillAtRisk,
    nextPriority,
    messagePerformanceReady: false,
  };
}

function sumAmounts(quotes: ReportQuote[]): number {
  return quotes.reduce(
    (total, quote) => total + Number(quote.estimate_amount ?? 0),
    0,
  );
}
