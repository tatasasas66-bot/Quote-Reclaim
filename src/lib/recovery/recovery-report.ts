import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isAuditEventsUnavailable,
  type AuditEventRow,
} from "@/lib/audit-events";
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
  monthLabel: string;
  followupsSentThisMonth: number;
  repliesReceivedThisMonth: number;
  jobsBookedThisMonth: number;
  estimatedRecoveredThisMonth: number;
  allTimeRecoveredRevenue: number;
  quotesStillAtRisk: number;
  nextPriority: SundayResetPick | null;
  topRecoveredTrade: string | null;
  messagePerformance: Array<{
    family: string;
    opened: number;
    replies: number;
    replyRate: number;
  }>;
  atRiskQuotes: Array<{
    id: string;
    clientName: string;
    amount: number;
    daysQuiet: number;
  }>;
  messagePerformanceReady: boolean;
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

  const [quotesResult, remindersResult, repliesResult, auditResult] = await Promise.all([
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
    supabase
      .from("audit_events")
      .select("id,user_id,quote_id,event_type,meta,created_at")
      .eq("user_id", userId)
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
  if (auditResult.error && !isAuditEventsUnavailable(auditResult.error)) {
    throw new Error(`Recovery report audit events failed: ${auditResult.error.message}`);
  }

  return buildRecoveryReportData({
    quotes: (quotesResult.data ?? []) as ReportQuote[],
    reminders: (remindersResult.data ?? []) as ReportReminder[],
    repliesReceivedThisMonth: repliesResult.data?.length ?? 0,
    auditEvents: (auditResult.error ? [] : auditResult.data ?? []) as AuditEventRow[],
    monthStartMs: monthStart.getTime(),
    nextMonthStartMs: nextMonthStart.getTime(),
    nowMs: now.getTime(),
    monthLabel: now.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  });
}

export function buildRecoveryReportData(input: {
  quotes: ReportQuote[];
  reminders: ReportReminder[];
  repliesReceivedThisMonth: number;
  auditEvents?: AuditEventRow[];
  monthStartMs: number;
  nextMonthStartMs: number;
  nowMs: number;
  monthLabel?: string;
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
  const recoveredTradeTotals = [...recoveredThisMonth].reduce(
    (totals, quote) => {
        totals.set(
          quote.trade,
          (totals.get(quote.trade) ?? 0) + Number(quote.estimate_amount),
        );
        return totals;
      },
      new Map<string, number>(),
    );
  const topRecoveredTrade =
    Array.from(recoveredTradeTotals.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] ?? null;

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
  const auditEvents = input.auditEvents ?? [];
  const openedThisMonth = auditEvents.filter(
    (event) => event.event_type === "sms_opened" && event.quote_id,
  );
  const familyStats = new Map<string, { opened: number; replies: number }>();
  for (const opened of openedThisMonth) {
    const family = String(opened.meta.messageFamily ?? "Unknown");
    const stats = familyStats.get(family) ?? { opened: 0, replies: 0 };
    stats.opened += 1;
    const repliedAfter = auditEvents.some(
      (event) =>
        event.quote_id === opened.quote_id &&
        event.event_type === "reply_received" &&
        Date.parse(event.created_at) > Date.parse(opened.created_at),
    );
    if (repliedAfter) stats.replies += 1;
    familyStats.set(family, stats);
  }
  const messagePerformance = Array.from(familyStats.entries()).map(([family, stats]) => ({
    family,
    opened: stats.opened,
    replies: stats.replies,
    replyRate: stats.opened > 0 ? stats.replies / stats.opened : 0,
  })).sort((a, b) => b.replyRate - a.replyRate || b.opened - a.opened);
  const workedQuoteIds = new Set(openedThisMonth.map((event) => event.quote_id));
  const atRiskQuotes = pendingQuotes
    .map((quote) => ({
      quote,
      daysQuiet: effectiveDaysSilent(quote, input.nowMs),
    }))
    .filter(
      ({ quote, daysQuiet }) =>
        daysQuiet >= 8 && daysQuiet < 45 && !workedQuoteIds.has(quote.id),
    )
    .sort(
      (a, b) =>
        Number(b.quote.estimate_amount) - Number(a.quote.estimate_amount),
    )
    .map(({ quote, daysQuiet }) => ({
      id: quote.id,
      clientName: quote.client_name,
      amount: Number(quote.estimate_amount),
      daysQuiet,
    }));

  return {
    monthLabel: input.monthLabel ?? "Monthly",
    followupsSentThisMonth: sentThisMonth.length,
    repliesReceivedThisMonth: input.repliesReceivedThisMonth,
    jobsBookedThisMonth: wonThisMonth.length,
    estimatedRecoveredThisMonth: sumAmounts(recoveredThisMonth),
    allTimeRecoveredRevenue: sumAmounts(recoveredQuotes),
    quotesStillAtRisk,
    nextPriority,
    topRecoveredTrade,
    messagePerformance,
    atRiskQuotes,
    messagePerformanceReady: messagePerformance.length > 0,
  };
}

function sumAmounts(quotes: ReportQuote[]): number {
  return quotes.reduce(
    (total, quote) => total + Number(quote.estimate_amount ?? 0),
    0,
  );
}
