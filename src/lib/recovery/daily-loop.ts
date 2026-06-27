import type { AuditEventRow } from "@/lib/audit-events";
import { normalizePhone } from "@/lib/messaging/phone";
import type { QuoteRow, ReminderRow } from "@/lib/quotes/repo";
import {
  getExpectedRecoveryValue,
  getRecommendedMessage,
  getRecoveryWindow,
  getRecoveryWindowLabel,
  getSequenceFamily,
  type MessageFamily,
} from "./recovery-logic";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TodayMove = {
  quoteId: string;
  reminderId: string;
  clientName: string;
  phone: string | null;
  amount: number;
  windowLabel: string;
  family: MessageFamily;
  step: number;
  message: string;
  sendAt: string;
  overdue: boolean;
  expectedRecoveryValue: number;
};

export function buildSmsDeepLink(
  phone: string | null | undefined,
  message: string,
): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `sms:${normalized}?body=${encodeURIComponent(message)}`;
}

export function selectTodaysMoves(input: {
  quotes: QuoteRow[];
  reminders: ReminderRow[];
  now?: Date;
}): TodayMove[] {
  const now = input.now ?? new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const quoteById = new Map(input.quotes.map((quote) => [quote.id, quote]));
  const firstDueByQuote = new Map<string, ReminderRow>();

  for (const reminder of input.reminders) {
    if (reminder.sent || reminder.paused_at) continue;
    const quote = quoteById.get(reminder.quote_id);
    if (!quote || quote.outcome !== "pending") continue;
    const sendAt = Date.parse(reminder.send_at);
    if (Number.isNaN(sendAt) || sendAt > endOfToday.getTime()) continue;
    const current = firstDueByQuote.get(reminder.quote_id);
    if (!current || sendAt < Date.parse(current.send_at)) {
      firstDueByQuote.set(reminder.quote_id, reminder);
    }
  }

  return Array.from(firstDueByQuote.values())
    .map((reminder) => {
      const quote = quoteById.get(reminder.quote_id)!;
      const step = Math.min(5, Math.max(1, reminder.followup_number)) as
        | 1
        | 2
        | 3
        | 4
        | 5;
      const family = getSequenceFamily(step);
      const daysQuiet = Math.max(0, quote.days_silent);
      return {
        quoteId: quote.id,
        reminderId: reminder.id,
        clientName: quote.client_name,
        phone: quote.client_phone,
        amount: Number(quote.estimate_amount),
        windowLabel: getRecoveryWindowLabel(getRecoveryWindow(daysQuiet)),
        family,
        step,
        message: getRecommendedMessage(family, {
          firstName: quote.client_name,
          trade: quote.trade,
        }),
        sendAt: reminder.send_at,
        overdue: Date.parse(reminder.send_at) < startOfUtcDay(now).getTime(),
        expectedRecoveryValue: getExpectedRecoveryValue(
          Number(quote.estimate_amount),
          daysQuiet,
        ),
      };
    })
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        b.expectedRecoveryValue - a.expectedRecoveryValue ||
        Date.parse(a.sendAt) - Date.parse(b.sendAt),
    );
}

export type RecoveryStreak = {
  count: number;
  resetYesterday: boolean;
};

export function calculateRecoveryStreak(
  events: AuditEventRow[],
  now = new Date(),
): RecoveryStreak {
  const workedDays = new Set(
    events
      .filter((event) => event.event_type === "sms_opened")
      .map((event) => utcDateKey(new Date(event.created_at))),
  );
  const today = startOfUtcDay(now);
  const yesterday = new Date(today.getTime() - DAY_MS);
  const cursor = workedDays.has(utcDateKey(today)) ? today : yesterday;
  let count = 0;
  for (let day = cursor; workedDays.has(utcDateKey(day)); ) {
    count += 1;
    day = new Date(day.getTime() - DAY_MS);
  }
  const hadOlderWork = events.some(
    (event) =>
      event.event_type === "sms_opened" &&
      Date.parse(event.created_at) < yesterday.getTime(),
  );
  return {
    count,
    resetYesterday: !workedDays.has(utcDateKey(yesterday)) && hadOlderWork,
  };
}

export type ReplyCheck = {
  quoteId: string;
  openedAt: string;
  daysAgo: number;
  reaskCount: number;
};

export function selectReplyChecks(
  events: AuditEventRow[],
  now = new Date(),
): ReplyCheck[] {
  const byQuote = new Map<string, AuditEventRow[]>();
  for (const event of events) {
    if (!event.quote_id) continue;
    const rows = byQuote.get(event.quote_id) ?? [];
    rows.push(event);
    byQuote.set(event.quote_id, rows);
  }

  const checks: ReplyCheck[] = [];
  for (const [quoteId, rows] of Array.from(byQuote.entries())) {
    const opened = rows
      .filter((event) => event.event_type === "sms_opened")
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!opened) continue;
    if (
      rows.some(
        (event) =>
          event.event_type === "reply_received" &&
          Date.parse(event.created_at) > Date.parse(opened.created_at),
      )
    ) {
      continue;
    }
    const noReplies = rows
      .filter(
        (event) =>
          event.event_type === "no_reply_yet" &&
          (event.meta.answer === "no" || event.meta.answer === "not_yet") &&
          Date.parse(event.created_at) > Date.parse(opened.created_at),
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    if (noReplies.length >= 3) continue;
    const anchor = noReplies[0]?.created_at ?? opened.created_at;
    const ageMs = now.getTime() - Date.parse(anchor);
    if (ageMs < DAY_MS || ageMs > 2 * DAY_MS) continue;
    checks.push({
      quoteId,
      openedAt: opened.created_at,
      daysAgo: Math.max(1, Math.floor(ageMs / DAY_MS)),
      reaskCount: noReplies.length,
    });
  }
  return checks;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
