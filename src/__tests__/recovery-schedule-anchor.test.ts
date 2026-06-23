/**
 * @vitest-environment node
 *
 * REGRESSION: recovery schedule must start from plan-creation time (now),
 * never from the original estimate date.
 *
 * The launch-blocking bug: persistRecoveryPlan (and reconcileReminders)
 * anchored the 1/3/7/14/30-day cadence to the estimate date. An OLD quote
 * — e.g. 28 days quiet, estimate dated May 15 with "today" = June 12 —
 * produced a recovery schedule entirely in the PAST:
 *   FU1 May 16, FU2 May 18, FU3 May 22, FU4 May 29, FU5 Jun 14.
 * The detail page then read "Estimate Check is due now / sends by email today"
 * while displaying May dates, and the cron saw all five reminders as overdue
 * at once.
 *
 * Two concepts had been conflated and are now separated:
 *   - Quote age / Days Quiet  -> driven by quote_sent_at (the estimate date).
 *   - Recovery schedule       -> driven by plan-creation time (server now).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  scheduleSendAt,
  persistRecoveryPlan,
  CADENCE_DAYS,
} from "@/lib/quotes/recovery-plan-write";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";
import {
  formatScheduleDateTime,
  DEFAULT_TIMEZONE,
} from "@/lib/quotes/business-hours";
import {
  canManualSendToday,
  computeNextMove,
  nextMoveInstruction,
  type NextMove,
} from "@/lib/quotes/next-move";
import type { ReminderRow } from "@/lib/quotes/repo";

// Frozen "today" for the whole bug scenario: June 12, 2026, 14:00 UTC.
const NOW_ISO = "2026-06-12T14:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);
// The quote was sent May 15 — 28 days before "today".
const ESTIMATE_SENT_ISO = "2026-05-15T14:00:00.000Z";

afterEach(() => {
  vi.useRealTimers();
});

/** What calendar month does an ISO instant fall in, in the contractor TZ? */
function monthInTz(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: DEFAULT_TIMEZONE,
    month: "short",
  });
}

// ───────────────────────────────────────────────────────────────────────
// scheduleSendAt — pure cadence math anchored to the plan-start instant
// ───────────────────────────────────────────────────────────────────────

describe("scheduleSendAt anchors the cadence to the plan-start time, not the estimate date", () => {
  it("every follow-up lands strictly after the start instant (no past dates)", () => {
    for (const fu of [1, 2, 3, 4, 5] as const) {
      const at = scheduleSendAt(NOW_MS, CADENCE_DAYS[fu]);
      expect(Date.parse(at)).toBeGreaterThan(NOW_MS);
    }
  });

  it("produces the 1/3/7/14/30 ladder in ascending order", () => {
    const ladder = ([1, 2, 3, 4, 5] as const).map((fu) =>
      Date.parse(scheduleSendAt(NOW_MS, CADENCE_DAYS[fu])),
    );
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]).toBeGreaterThan(ladder[i - 1]);
    }
  });

  it("for a June 12 start, Follow-up 1 displays in June — never May", () => {
    const fu1 = scheduleSendAt(NOW_MS, CADENCE_DAYS[1]);
    expect(monthInTz(fu1)).toBe("Jun");
    expect(formatScheduleDateTime(fu1)).not.toMatch(/May/);
  });

  it("floors a non-positive offset to the next business day (never at/before start)", () => {
    // Defensive: a 0-day offset must still land in the future, not on the
    // start instant. Real cadence never uses 0, but the guarantee is structural.
    const at = scheduleSendAt(NOW_MS, 0);
    expect(Date.parse(at)).toBeGreaterThan(NOW_MS);
  });
});

// ───────────────────────────────────────────────────────────────────────
// persistRecoveryPlan — the end-to-end writer contract with a frozen clock
// ───────────────────────────────────────────────────────────────────────

type CapturedInsert = { table: string; rows: Record<string, unknown>[] };

/** Minimal Supabase stub that captures the reminders insert and succeeds. */
function makeCapturingClient(captured: CapturedInsert[]) {
  return {
    from(table: string) {
      return {
        insert(rows: Record<string, unknown>[]) {
          captured.push({ table, rows });
          return Promise.resolve({ error: null });
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const BASE_CONTEXT = {
  firstName: "Martin",
  contractorFirstName: "Mike",
  trade: "Roofing",
  estimateAmount: 12_000,
  jobDescription: null,
  city: null,
  state: null,
  quoteId: "q-old-1",
  daysSilent: 28,
};

async function writeOldQuotePlan() {
  const captured: CapturedInsert[] = [];
  const result = await persistRecoveryPlan({
    serviceClient: makeCapturingClient(captured),
    userId: "u-1",
    quoteId: "q-old-1",
    channel: "email",
    // The fix: schedule starts NOW (June 12), even though the estimate is old.
    scheduleStartAt: NOW_ISO,
    context: BASE_CONTEXT,
  });
  const rows = captured.find((c) => c.table === "reminders")?.rows ?? [];
  return { result, rows };
}

describe("old imported quotes start recovery schedule from plan creation, not estimate date", () => {
  it("writes a complete 5-step plan", async () => {
    const { result, rows } = await writeOldQuotePlan();
    expect(result.inserted).toBe(5);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.followup_number).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("EVERY generated send_at is June 12 or later — never a past May date", async () => {
    const { rows } = await writeOldQuotePlan();
    for (const r of rows) {
      const sendAtMs = Date.parse(String(r.send_at));
      expect(sendAtMs).toBeGreaterThanOrEqual(NOW_MS);
      expect(monthInTz(String(r.send_at))).not.toBe("May");
      expect(formatScheduleDateTime(String(r.send_at))).not.toMatch(/May/);
    }
  });

  it("Follow-up 1 is the soonest and does not display in May", async () => {
    const { rows } = await writeOldQuotePlan();
    const fu1 = rows.find((r) => r.followup_number === 1)!;
    expect(Date.parse(String(fu1.send_at))).toBeGreaterThanOrEqual(NOW_MS);
    expect(monthInTz(String(fu1.send_at))).toBe("Jun");
  });

  it("Follow-ups 2–5 are each scheduled after Follow-up 1", async () => {
    const { rows } = await writeOldQuotePlan();
    const byFu = new Map(
      rows.map((r) => [r.followup_number as number, Date.parse(String(r.send_at))]),
    );
    const fu1 = byFu.get(1)!;
    for (const fu of [2, 3, 4, 5]) {
      expect(byFu.get(fu)!).toBeGreaterThan(fu1);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// Days Quiet still tracks the estimate date — the two concepts stay separate
// ───────────────────────────────────────────────────────────────────────

describe("Days Quiet remains anchored to the estimate date (unchanged by the fix)", () => {
  it("a quote sent May 15 reads ~28 days quiet on June 12", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
    const days = effectiveDaysSilent({
      days_silent: 28,
      quote_sent_at: ESTIMATE_SENT_ISO,
    });
    expect(days).toBeGreaterThanOrEqual(27);
    expect(days).toBeLessThanOrEqual(28);
  });

  it("Days Quiet (estimate date) and the recovery schedule (now) are independent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
    const days = effectiveDaysSilent({
      days_silent: 28,
      quote_sent_at: ESTIMATE_SENT_ISO,
    });
    const { rows } = await writeOldQuotePlan();
    // 28 days quiet, but the first send_at is in the FUTURE — exactly the
    // separation the bug violated.
    expect(days).toBeGreaterThanOrEqual(27);
    const fu1 = rows.find((r) => r.followup_number === 1)!;
    expect(Date.parse(String(fu1.send_at))).toBeGreaterThan(NOW_MS);
  });
});

// ───────────────────────────────────────────────────────────────────────
// UI honesty — the detail page must never say "sends today" with a past date
// ───────────────────────────────────────────────────────────────────────

describe("UI never claims 'sends today' beside a past scheduled date", () => {
  async function reminderRowsFromPlan(): Promise<ReminderRow[]> {
    const { rows } = await writeOldQuotePlan();
    return rows.map((r, i) => ({
      id: `r-${r.followup_number}`,
      quote_id: "q-old-1",
      user_id: "u-1",
      followup_number: r.followup_number as number,
      message_type: "email",
      message_text: String(r.message_text ?? ""),
      framework_used: String(r.framework_used ?? ""),
      cta_type: String(r.cta_type ?? ""),
      send_at: String(r.send_at),
      sent: false,
      sent_at: null,
      paused_at: null,
      claimed_by: null,
      claimed_at: null,
      created_at: NOW_ISO,
      // index only used to keep the shape stable
      _i: i,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any;
  }

  it("computeNextMove classifies Follow-up 1 as email-QUEUED (future), not email-due/'sends today'", async () => {
    const reminders = await reminderRowsFromPlan();
    const move = computeNextMove({
      status: "running",
      reminders,
      hasEmail: true,
      hasReply: false,
      now: NOW_MS,
    });
    expect(move.kind).toBe("email-queued");
    if (move.kind === "none") throw new Error("unreachable");
    expect(move.followupNumber).toBe(1);
    expect(move.dueNow).toBe(false);
    // The queued instruction must point at a future date, never "today".
    expect(move.sendAtLabel).not.toMatch(/May/);
  });

  it("the 'Next follow-up sends …' label points at a future date", async () => {
    const reminders = await reminderRowsFromPlan();
    const soonest = reminders
      .filter((r) => !r.sent && !r.paused_at)
      .sort((a, b) => Date.parse(a.send_at) - Date.parse(b.send_at))[0];
    expect(Date.parse(soonest.send_at)).toBeGreaterThan(NOW_MS);
    expect(formatScheduleDateTime(soonest.send_at)).not.toMatch(/May/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Manual "Send today" override — the commercial command for old quiet quotes.
// Automatic schedule stays future; the contractor can still send by hand now.
// ───────────────────────────────────────────────────────────────────────

/**
 * Replicates the quote-detail page's per-card showSendToday gate so the test
 * proves the exact rule the page renders: the next actionable email reminder
 * gets the button (due OR queued), every other card does not.
 */
function showSendTodayFor(
  reminder: ReminderRow,
  move: NextMove,
  opts: { hasEmail: boolean; hasPhone: boolean; status: string },
): boolean {
  const messageType: "email" | "sms" =
    reminder.message_type === "email" ? "email" : "sms";
  const hasRecipientForChannel =
    messageType === "email" ? opts.hasEmail : opts.hasPhone;
  const sendEarlyDisabled =
    reminder.sent ||
    reminder.paused_at !== null ||
    opts.status !== "running" ||
    !hasRecipientForChannel;
  const isNextActionable = move.kind !== "none" && move.reminderId === reminder.id;
  return (
    isNextActionable &&
    !sendEarlyDisabled &&
    (messageType === "email" ? canManualSendToday(move) : true)
  );
}

describe("manual Send today override for an old quiet quote (June 12, sent May 15)", () => {
  async function emailReminders(): Promise<ReminderRow[]> {
    const { rows } = await writeOldQuotePlan();
    return rows.map((r) => ({
      id: `r-${r.followup_number}`,
      quote_id: "q-old-1",
      user_id: "u-1",
      followup_number: r.followup_number as number,
      message_type: "email",
      message_text: String(r.message_text ?? ""),
      framework_used: String(r.framework_used ?? ""),
      cta_type: String(r.cta_type ?? ""),
      send_at: String(r.send_at),
      sent: false,
      sent_at: null,
      paused_at: null,
      claimed_by: null,
      claimed_at: null,
      created_at: NOW_ISO,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any;
  }

  it("the next unsent email reminder shows Send today even though its send_at is a FUTURE window", async () => {
    const reminders = await emailReminders();
    const move = computeNextMove({
      status: "running",
      reminders,
      hasEmail: true,
      hasReply: false,
      now: NOW_MS,
    });
    expect(move.kind).toBe("email-queued");
    if (move.kind === "none") throw new Error("unreachable");
    // Automatic state is NOT today...
    expect(move.dueNow).toBe(false);
    expect(Date.parse(reminders[0].send_at)).toBeGreaterThan(NOW_MS);
    // ...but the manual override is available on Follow-up 1.
    const fu1 = reminders.find((r) => r.followup_number === 1)!;
    expect(showSendTodayFor(fu1, move, { hasEmail: true, hasPhone: false, status: "running" })).toBe(true);
  });

  it("the UI copy offers the override without claiming the system sends today / is due now", async () => {
    const reminders = await emailReminders();
    const move = computeNextMove({
      status: "running",
      reminders,
      hasEmail: true,
      hasReply: false,
      now: NOW_MS,
    });
    const line = nextMoveInstruction(move)!;
    expect(line).toContain("queued for");
    expect(line).toContain("Want to move now? Send it today.");
    expect(line).not.toMatch(/Due now/i);
    expect(line).not.toMatch(/sends today/i);
    expect(line).not.toContain("Nothing to send by hand");
  });

  it("Follow-ups 2–5 do NOT show Send today while Follow-up 1 is unsent", async () => {
    const reminders = await emailReminders();
    const move = computeNextMove({
      status: "running",
      reminders,
      hasEmail: true,
      hasReply: false,
      now: NOW_MS,
    });
    for (const fu of [2, 3, 4, 5]) {
      const r = reminders.find((x) => x.followup_number === fu)!;
      expect(showSendTodayFor(r, move, { hasEmail: true, hasPhone: false, status: "running" })).toBe(false);
    }
  });

  it("after Follow-up 1 is sent, Follow-up 2 (still future) does NOT show Send today — no rapid-fire", async () => {
    // This is the rapid-fire bug. FU1 is the next actionable and future-queued,
    // so it has the first-touch override. The moment FU1 is sent, FU2 becomes
    // the next move but it is still days away (Jun 15) — the override is gone,
    // FU2 shows Copy only and the banner states the window with no "send today".
    const reminders = await emailReminders();
    const afterFu1 = reminders.map((r) =>
      r.followup_number === 1
        ? { ...r, sent: true, sent_at: NOW_ISO }
        : r,
    );
    const move = computeNextMove({
      status: "running",
      reminders: afterFu1,
      hasEmail: true,
      hasReply: false,
      now: NOW_MS,
    });
    if (move.kind === "none") throw new Error("expected a move");
    expect(move.followupNumber).toBe(2);
    expect(move.kind).toBe("email-queued");
    expect(move.dueNow).toBe(false);
    expect(move.canSendEarly).toBe(false);
    // The banner states the window, never invites a send.
    const line = nextMoveInstruction(move)!;
    expect(line).toContain("queued for the next send window");
    expect(line).not.toContain("Send it today");
    expect(line).not.toContain("Want to move now");
    // FU2 + FU3 show NO Send today.
    const fu2 = afterFu1.find((r) => r.followup_number === 2)!;
    const fu3 = afterFu1.find((r) => r.followup_number === 3)!;
    expect(showSendTodayFor(fu2, move, { hasEmail: true, hasPhone: false, status: "running" })).toBe(false);
    expect(showSendTodayFor(fu3, move, { hasEmail: true, hasPhone: false, status: "running" })).toBe(false);
  });

  it("Follow-up 2 CAN be sent once it is actually due by send_at <= now", async () => {
    // Advance time to after FU2's send window (FU2 = Jun 15). Now FU2 is
    // genuinely due — email-due — and the normal send action is allowed even
    // though an earlier email already went out.
    const reminders = await emailReminders();
    const afterFu1 = reminders.map((r) =>
      r.followup_number === 1 ? { ...r, sent: true, sent_at: NOW_ISO } : r,
    );
    const fu2SendAt = Date.parse(
      afterFu1.find((r) => r.followup_number === 2)!.send_at,
    );
    const laterNow = fu2SendAt + 60_000; // one minute after FU2's window
    const move = computeNextMove({
      status: "running",
      reminders: afterFu1,
      hasEmail: true,
      hasReply: false,
      now: laterNow,
    });
    expect(move.followupNumber).toBe(2);
    expect(move.kind).toBe("email-due");
    expect(canManualSendToday(move)).toBe(true);
    const fu2 = afterFu1.find((r) => r.followup_number === 2)!;
    // The page gate would render the send button (status running, has email).
    const messageType = fu2.message_type === "email" ? "email" : "sms";
    const sendEarlyDisabled = fu2.sent || fu2.paused_at !== null;
    const isNextActionable = move.reminderId === fu2.id;
    expect(isNextActionable && !sendEarlyDisabled && (messageType === "email" ? canManualSendToday(move) : true)).toBe(true);
  });

  it("no-email / copy-mode quotes do NOT show an email Send today (stay copy/manual)", async () => {
    // A no-email import is written as message_type "sms" (copy mode). With no
    // phone either, the next move is manual-ready and the email send button is
    // not eligible — canManualSendToday is false for copy mode.
    const { rows } = await writeOldQuotePlan();
    const smsReminders = rows.map((r) => ({
      id: `r-${r.followup_number}`,
      quote_id: "q-old-1",
      user_id: "u-1",
      followup_number: r.followup_number as number,
      message_type: "sms",
      message_text: String(r.message_text ?? ""),
      framework_used: String(r.framework_used ?? ""),
      cta_type: String(r.cta_type ?? ""),
      send_at: String(r.send_at),
      sent: false,
      sent_at: null,
      paused_at: null,
      claimed_by: null,
      claimed_at: null,
      created_at: NOW_ISO,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any as ReminderRow[];
    const move = computeNextMove({
      status: "running",
      reminders: smsReminders,
      hasEmail: false,
      hasReply: false,
      now: NOW_MS,
    });
    expect(move.kind).toBe("manual-ready");
    expect(canManualSendToday(move)).toBe(false);
    const fu1 = smsReminders.find((r) => r.followup_number === 1)!;
    // No email and no phone → the email Send today never renders.
    expect(showSendTodayFor(fu1, move, { hasEmail: false, hasPhone: false, status: "running" })).toBe(false);
  });

  it("won/closed/paused quotes show no Send today at all", async () => {
    const reminders = await emailReminders();
    for (const status of ["won", "closed", "paused"] as const) {
      const move = computeNextMove({
        status,
        reminders,
        hasEmail: true,
        hasReply: false,
        now: NOW_MS,
      });
      expect(move.kind).toBe("none");
      const fu1 = reminders.find((r) => r.followup_number === 1)!;
      expect(showSendTodayFor(fu1, move, { hasEmail: true, hasPhone: false, status })).toBe(false);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// Server action keeps the same eligibility rules (no send_at gate, in-order)
// ───────────────────────────────────────────────────────────────────────

describe("server send action validates manual override the same way the UI gates it", () => {
  const actionsSrc = readFileSync(
    join(process.cwd(), "src/lib/quotes/actions.ts"),
    "utf8",
  );
  // Slice the full sendReminderManualEmailAction body (start → next export).
  const emailFnStart = actionsSrc.indexOf(
    "export async function sendReminderManualEmailAction",
  );
  const nextExport = actionsSrc.indexOf("\nexport ", emailFnStart + 10);
  const emailFn = actionsSrc.slice(
    emailFnStart,
    nextExport > emailFnStart ? nextExport : actionsSrc.length,
  );

  it("sendReminderManualEmailAction has NO send_at/due gate — a future-queued reminder is hand-sendable", () => {
    // The action must never refuse to send a reminder just because its
    // automatic send_at is in the future — that would break the manual
    // override. It gates on sent/paused/outcome/opt-out/order only.
    expect(emailFn).not.toMatch(/\.send_at\b/);
    expect(emailFn).not.toMatch(/\bdue\b/i);
  });

  it("it still enforces sent/paused/outcome/opt-out and the out-of-order guard", () => {
    expect(emailFn).toMatch(/if \(reminder\.sent\) return/);
    expect(emailFn).toMatch(/if \(reminder\.paused_at\) return/);
    expect(emailFn).toMatch(/quote\.outcome !== "pending"/);
    expect(emailFn).toMatch(/quote\.client_opted_out/);
    expect(emailFn).toMatch(/rejectOutOfOrderSend\(/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Cron does not see a backlog — only one reminder is ever due at a time
// ───────────────────────────────────────────────────────────────────────

describe("cron never sends a backlog of old follow-ups (no past send_at to claim)", () => {
  it("at most one reminder for the quote is due at the frozen now (the rest are future)", async () => {
    const { rows } = await writeOldQuotePlan();
    const dueNow = rows.filter(
      (r) => Date.parse(String(r.send_at)) <= NOW_MS,
    );
    // With the fix, NOTHING is overdue for a freshly written plan — the first
    // touch is tomorrow. The old bug had all five overdue at once.
    expect(dueNow.length).toBe(0);
  });

  it("the cron route still keeps the one-message-per-quote-per-run safety cap", () => {
    const cronSrc = readFileSync(
      join(process.cwd(), "src/app/api/cron/send/route.ts"),
      "utf8",
    );
    expect(cronSrc).toContain("earliestPerQuote");
    expect(cronSrc).toMatch(/r\.followup_number < held\.followup_number/);
    expect(cronSrc).toMatch(/sequence_deferred: sequenceDeferred/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Source contract — the writer no longer accepts an estimate-date schedule base
// ───────────────────────────────────────────────────────────────────────

describe("the writer's scheduling base is plan-start, not the estimate date", () => {
  const writerSrc = readFileSync(
    join(process.cwd(), "src/lib/quotes/recovery-plan-write.ts"),
    "utf8",
  );
  const actionsSrc = readFileSync(
    join(process.cwd(), "src/lib/quotes/actions.ts"),
    "utf8",
  );
  const onboardingSrc = readFileSync(
    join(process.cwd(), "src/lib/onboarding/actions.ts"),
    "utf8",
  );

  it("persistRecoveryPlan takes scheduleStartAt (default now), not quoteSentAt", () => {
    expect(writerSrc).toMatch(/scheduleStartAt\?: string/);
    expect(writerSrc).not.toMatch(/quoteSentAt: string/);
    expect(writerSrc).toMatch(/Date\.parse\(params\.scheduleStartAt\)\s*:\s*Date\.now\(\)/);
    expect(writerSrc).toMatch(/scheduleSendAt\(startMs, CADENCE_DAYS/);
  });

  it("createQuoteAction no longer passes the estimate date into the scheduler", () => {
    // The persistRecoveryPlan call must not pass quoteSentAt/scheduleStartAt
    // (it defaults to now). The quote_sent_at COLUMN still carries the estimate.
    const callBlock =
      actionsSrc.slice(
        actionsSrc.indexOf("await persistRecoveryPlan({"),
        actionsSrc.indexOf("await persistRecoveryPlan({") + 400,
      );
    expect(callBlock).not.toMatch(/quoteSentAt/);
    expect(callBlock).not.toMatch(/scheduleStartAt/);
    expect(actionsSrc).toMatch(/quote_sent_at: quoteSentAtFromDaysSilent/);
  });

  it("importSilentQuotesAction no longer passes the estimate date into the scheduler", () => {
    const callBlock = onboardingSrc.slice(
      onboardingSrc.indexOf("await persistRecoveryPlan({"),
      onboardingSrc.indexOf("await persistRecoveryPlan({") + 400,
    );
    expect(callBlock).not.toMatch(/quoteSentAt/);
    // quote_sent_at column still carries the estimate date for Days Quiet.
    expect(onboardingSrc).toMatch(/quote_sent_at: quoteSentAtFromDaysSilent/);
  });

  it("reconcileReminders re-anchors unsent reminders from now, not the estimate date", () => {
    expect(actionsSrc).toMatch(/const scheduleStartMs = Date\.now\(\)/);
    expect(actionsSrc).toMatch(/scheduleSendAt\(scheduleStartMs, CADENCE_DAYS/);
    expect(actionsSrc).not.toMatch(/sendAtFromBase\(newQuoteSentAt/);
  });
});
