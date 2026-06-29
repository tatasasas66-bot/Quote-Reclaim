import { describe, expect, it } from "vitest";
import type { AuditEventRow } from "@/lib/audit-events";
import type { QuoteRow, ReminderRow } from "@/lib/quotes/repo";
import {
  buildSmsDeepLink,
  calculateRecoveryStreak,
  selectReplyChecks,
  selectTodaysMoves,
} from "@/lib/recovery/daily-loop";

const NOW = new Date("2026-06-28T15:00:00.000Z");

function quote(overrides: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: "quote-1",
    user_id: "user-1",
    trade: "Concrete",
    city: "Phoenix",
    state: "AZ",
    estimate_amount: 9000,
    job_description: null,
    days_silent: 14,
    quote_sent_at: "2026-06-14T12:00:00.000Z",
    client_name: "Jane",
    client_email: null,
    client_phone: "+15551234567",
    client_opted_out: false,
    outcome: "pending",
    won_at: null,
    closed_at: null,
    created_at: "2026-06-14T12:00:00.000Z",
    updated_at: "2026-06-14T12:00:00.000Z",
    ...overrides,
  };
}

function reminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "reminder-1",
    user_id: "user-1",
    quote_id: "quote-1",
    followup_number: 2,
    message_type: "sms",
    message_text: "stale stored copy",
    framework_used: null,
    cta_type: null,
    send_at: "2026-06-28T10:00:00.000Z",
    sent: false,
    sent_at: null,
    paused_at: null,
    created_at: "2026-06-14T12:00:00.000Z",
    ...overrides,
  };
}

function event(
  type: AuditEventRow["event_type"],
  createdAt: string,
  overrides: Partial<AuditEventRow> = {},
): AuditEventRow {
  return {
    id: `${type}-${createdAt}`,
    user_id: "user-1",
    quote_id: "quote-1",
    event_type: type,
    meta: {},
    created_at: createdAt,
    ...overrides,
  };
}

describe("daily recovery loop", () => {
  it("builds a native SMS deep link and returns null without a valid phone", () => {
    expect(buildSmsDeepLink("(555) 123-4567", "Price & scope?")).toBe(
      "sms:+15551234567?body=Price%20%26%20scope%3F",
    );
    expect(buildSmsDeepLink(null, "Hello")).toBeNull();
  });

  it("selects due reminders, puts overdue first, then sorts by expected value", () => {
    const moves = selectTodaysMoves({
      now: NOW,
      quotes: [
        quote({ id: "overdue", estimate_amount: 2000 }),
        quote({ id: "high", estimate_amount: 12000 }),
        quote({ id: "low", estimate_amount: 4000 }),
      ],
      reminders: [
        reminder({
          id: "r-overdue",
          quote_id: "overdue",
          send_at: "2026-06-27T10:00:00.000Z",
        }),
        reminder({ id: "r-high", quote_id: "high" }),
        reminder({ id: "r-low", quote_id: "low" }),
      ],
    });
    expect(moves.map((move) => move.quoteId)).toEqual([
      "overdue",
      "high",
      "low",
    ]);
    expect(moves[0]?.message).toBe("stale stored copy");
    expect(moves[0]?.family).toBe("Scope Rescue");
  });

  it("returns an empty queue when no reminder is due", () => {
    expect(
      selectTodaysMoves({
        now: NOW,
        quotes: [quote()],
        reminders: [
          reminder({ send_at: "2026-06-29T10:00:00.000Z" }),
        ],
      }),
    ).toEqual([]);
  });

  it("counts consecutive worked days and detects a reset", () => {
    const active = [
      event("sms_opened", "2026-06-28T10:00:00.000Z"),
      event("sms_opened", "2026-06-27T10:00:00.000Z"),
      event("sms_opened", "2026-06-26T10:00:00.000Z"),
    ];
    expect(calculateRecoveryStreak(active, NOW)).toEqual({
      count: 3,
      resetYesterday: false,
    });
    expect(
      calculateRecoveryStreak(
        [event("sms_opened", "2026-06-25T10:00:00.000Z")],
        NOW,
      ),
    ).toEqual({ count: 0, resetYesterday: true });
  });

  it("asks for a reply after 24 hours, stops after a reply or three re-asks", () => {
    const opened = event("sms_opened", "2026-06-27T10:00:00.000Z");
    expect(selectReplyChecks([opened], NOW)).toHaveLength(1);
    expect(
      selectReplyChecks(
        [opened, event("reply_received", "2026-06-27T11:00:00.000Z")],
        NOW,
      ),
    ).toEqual([]);
    const reasks = [1, 2, 3].map((attempt) =>
      event(
        "no_reply_yet",
        `2026-06-${27 + attempt}T01:00:00.000Z`,
        { meta: { answer: "not_yet" } },
      ),
    );
    expect(selectReplyChecks([opened, ...reasks], NOW)).toEqual([]);
  });
});
