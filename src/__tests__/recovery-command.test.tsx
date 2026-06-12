/**
 * Recovery Command overhaul — acceptance contract.
 *
 * Covers the four pillars of the quote-detail / recovery-message rebuild:
 *   A. Message sequence upgrades (no "Contractor here", no "No rush on my
 *      end", reply-here closeout, no-overclaim "Why this works")
 *   B. Action safety — exactly ONE follow-up is ever sendable: the next
 *      actionable one. Future/queued cards carry no send button; cron and
 *      manual send both advance one message at a time.
 *   C. One source of truth — computeNextMove drives the summary's Next Best
 *      Action, Quiet Signal's Best next move, the NEXT MOVE banner, the
 *      highlighted card, and the send button. They cannot disagree.
 *   D. Page polish — trade line never dangles a comma, emails truncate
 *      instead of ugly-wrapping, green stays reserved for actual wins.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  canManualSendToday,
  computeNextMove,
  nextMoveInstruction,
  nextMoveSummaryLabel,
} from "@/lib/quotes/next-move";
import { tradeLocationLine } from "@/lib/quotes/quote-display";
import { computeStepDisplay } from "@/lib/quotes/step-status";
import type { ReminderRow } from "@/lib/quotes/repo";
import {
  SEQUENCE_VARIANTS,
  researchSequenceMessages,
  projectLabel,
  tradeWord,
  type VariantVars,
} from "@/lib/ai/fallback-messages";
import { containsBannedPhrase } from "@/lib/ai/validate-message";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const sendButton = readSource("../components/quotes/SendEarlyButton.tsx");
const quoteActions = readSource("../components/quotes/QuoteActions.tsx");
const actionsSrc = readSource("../lib/quotes/actions.ts");
const cronSend = readSource("../app/api/cron/send/route.ts");
const fallbacksSrc = readSource("../lib/ai/fallback-messages.ts");
const nextMoveSrc = readSource("../lib/quotes/next-move.ts");

// ───────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────

const NOW = Date.UTC(2026, 5, 10, 15, 0, 0); // 2026-06-10 15:00 UTC
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type MoveReminder = Pick<
  ReminderRow,
  "id" | "followup_number" | "send_at" | "sent" | "paused_at" | "message_type"
>;

function reminder(over: Partial<MoveReminder> & { id: string }): MoveReminder {
  return {
    followup_number: 1,
    send_at: new Date(NOW + DAY).toISOString(),
    sent: false,
    paused_at: null,
    message_type: "email",
    ...over,
  };
}

/** A standard imported 5-step plan: #1 due 2 days ago … #5 in 27 days. */
function importedPlan(messageType: "email" | "sms" = "email"): MoveReminder[] {
  return [
    reminder({ id: "r1", followup_number: 1, send_at: new Date(NOW - 2 * DAY).toISOString(), message_type: messageType }),
    reminder({ id: "r2", followup_number: 2, send_at: new Date(NOW - 1 * DAY).toISOString(), message_type: messageType }),
    reminder({ id: "r3", followup_number: 3, send_at: new Date(NOW + 3 * DAY).toISOString(), message_type: messageType }),
    reminder({ id: "r4", followup_number: 4, send_at: new Date(NOW + 10 * DAY).toISOString(), message_type: messageType }),
    reminder({ id: "r5", followup_number: 5, send_at: new Date(NOW + 27 * DAY).toISOString(), message_type: messageType }),
  ];
}

// ───────────────────────────────────────────────────────────────────────
// C. computeNextMove — the single source of truth
// ───────────────────────────────────────────────────────────────────────

describe("computeNextMove — one answer for the whole page", () => {
  it("multiple overdue: picks the EARLIEST unsent follow-up only (one at a time)", () => {
    const move = computeNextMove({
      status: "running",
      reminders: importedPlan(),
      hasEmail: true,
      hasReply: false,
      now: NOW,
    });
    expect(move.kind).toBe("email-due");
    if (move.kind === "none") throw new Error("unreachable");
    expect(move.reminderId).toBe("r1");
    expect(move.followupNumber).toBe(1);
    expect(move.dueNow).toBe(true);
  });

  it("after #1 is sent, the next overdue (#2) becomes the one actionable move", () => {
    const plan = importedPlan();
    plan[0] = { ...plan[0], sent: true };
    const move = computeNextMove({
      status: "running",
      reminders: plan,
      hasEmail: true,
      hasReply: false,
      now: NOW,
    });
    if (move.kind === "none") throw new Error("expected a move");
    expect(move.reminderId).toBe("r2");
    expect(move.followupNumber).toBe(2);
  });

  it("future-dated email next step → email-queued (the system sends; no hand-send)", () => {
    const plan = importedPlan().map((r) =>
      r.followup_number <= 2 ? { ...r, sent: true } : r,
    );
    const move = computeNextMove({
      status: "running",
      reminders: plan,
      hasEmail: true,
      hasReply: false,
      now: NOW,
    });
    expect(move.kind).toBe("email-queued");
    if (move.kind === "none") throw new Error("unreachable");
    expect(move.followupNumber).toBe(3);
    expect(move.dueNow).toBe(false);
  });

  it("no email on file → manual-ready regardless of due date", () => {
    const move = computeNextMove({
      status: "running",
      reminders: importedPlan("sms"),
      hasEmail: false,
      hasReply: false,
      now: NOW,
    });
    expect(move.kind).toBe("manual-ready");
  });

  it("a customer reply suspends the cadence — no next send is claimed", () => {
    const move = computeNextMove({
      status: "running",
      reminders: importedPlan(),
      hasEmail: true,
      hasReply: true,
      now: NOW,
    });
    expect(move.kind).toBe("none");
  });

  it("paused / won / closed → none", () => {
    for (const status of ["paused", "won", "closed"] as const) {
      expect(
        computeNextMove({
          status,
          reminders: importedPlan(),
          hasEmail: true,
          hasReply: false,
          now: NOW,
        }).kind,
      ).toBe("none");
    }
  });

  it("ties on send_at break by followup_number (strict sequence order)", () => {
    const same = new Date(NOW - DAY).toISOString();
    const move = computeNextMove({
      status: "running",
      reminders: [
        reminder({ id: "rB", followup_number: 2, send_at: same }),
        reminder({ id: "rA", followup_number: 1, send_at: same }),
      ],
      hasEmail: true,
      hasReply: false,
      now: NOW,
    });
    if (move.kind === "none") throw new Error("expected a move");
    expect(move.followupNumber).toBe(1);
  });
});

describe("next-move wording contract", () => {
  const base = importedPlan();

  it("email-queued: keeps the future date AND offers the manual override — never claims the system sends today", () => {
    const plan = base.map((r) => (r.followup_number <= 2 ? { ...r, sent: true } : r));
    const move = computeNextMove({ status: "running", reminders: plan, hasEmail: true, hasReply: false, now: NOW });
    expect(move.kind).toBe("email-queued");
    if (move.kind === "none") throw new Error("unreachable");
    // dueNow stays false — the automatic schedule is NOT today.
    expect(move.dueNow).toBe(false);
    const line = nextMoveInstruction(move)!;
    expect(line).toMatch(/^Follow-up 3 is queued for /);
    expect(line).toContain("Want to move now? Send it today.");
    // No contradiction: it never says the system already sends today, and the
    // old "nothing to send by hand" copy is gone now that a manual override
    // is offered.
    expect(line).not.toContain("Nothing to send by hand");
    // The summary cell stays accurate about the AUTOMATIC date (not "today").
    const label = nextMoveSummaryLabel(move)!;
    expect(label).toMatch(/^Follow-up 3 queued — sends /);
    expect(label.toLowerCase()).not.toContain("today");
  });

  it("canManualSendToday is true for the next actionable EMAIL reminder whether due or queued, false otherwise", () => {
    const dueMove = computeNextMove({ status: "running", reminders: base, hasEmail: true, hasReply: false, now: NOW });
    expect(canManualSendToday(dueMove)).toBe(true); // email-due

    const queuedPlan = base.map((r) => (r.followup_number <= 2 ? { ...r, sent: true } : r));
    const queuedMove = computeNextMove({ status: "running", reminders: queuedPlan, hasEmail: true, hasReply: false, now: NOW });
    expect(queuedMove.kind).toBe("email-queued");
    expect(canManualSendToday(queuedMove)).toBe(true); // queued email still hand-sendable

    const copyMove = computeNextMove({ status: "running", reminders: importedPlan("sms"), hasEmail: false, hasReply: false, now: NOW });
    expect(canManualSendToday(copyMove)).toBe(false); // manual-ready (copy mode)

    const noneMove = computeNextMove({ status: "won", reminders: base, hasEmail: true, hasReply: false, now: NOW });
    expect(canManualSendToday(noneMove)).toBe(false); // no actionable move
  });

  it("email-due: offers both paths — let it send, or send today to move now", () => {
    const move = computeNextMove({ status: "running", reminders: base, hasEmail: true, hasReply: false, now: NOW });
    const line = nextMoveInstruction(move)!;
    expect(line).toBe(
      "Follow-up 1 is due now and queued for email. You can let it send, or send it today if you want to move now.",
    );
    expect(nextMoveSummaryLabel(move)).toBe("Follow-up 1 due — sends by email today");
  });

  it("manual-ready: copy/manual send named explicitly — never 'nothing to send by hand'", () => {
    const move = computeNextMove({ status: "running", reminders: importedPlan("sms"), hasEmail: false, hasReply: false, now: NOW });
    const line = nextMoveInstruction(move)!;
    expect(line).toBe(
      "Follow-up 1 is ready to copy. Send it from your phone or email today.",
    );
    expect(line).not.toContain("Nothing to send by hand");
    expect(nextMoveSummaryLabel(move)).toBe("Copy & send follow-up 1");
  });
});

// ───────────────────────────────────────────────────────────────────────
// B. Action safety — page, button, server action, cron
// ───────────────────────────────────────────────────────────────────────

describe("send-button safety on the quote detail page", () => {
  it("only the next actionable card can render the send button", () => {
    expect(detailPage).toMatch(
      /const isNextActionable = move\.kind !== "none" && move\.reminderId === r\.id/,
    );
    expect(detailPage).toMatch(/const showSendToday =\s*isNextActionable &&/);
    expect(detailPage).toMatch(/\{showSendToday \?\s*\(?\s*<SendEarlyButton/);
  });

  it("the next actionable email step shows the manual send button whether due OR future-queued", () => {
    // Manual-override eligibility is separated from the automatic due state:
    // the gate uses canManualSendToday(move), which is true for both
    // email-due and email-queued — so an old quiet quote can be sent by hand
    // now even though its automatic send_at is a future window.
    expect(detailPage).toMatch(
      /messageType === "email" \? canManualSendToday\(move\) : true/,
    );
    expect(detailPage).not.toMatch(/messageType === "email" \? move\.kind === "email-due" : true/);
  });

  it("sent and queued-behind cards keep Copy but carry no send button", () => {
    // The render gate folds r.sent / paused / status into sendEarlyDisabled
    // AND requires isNextActionable, so a sent or later-sequence card cannot
    // render the button at all (not merely disabled — absent).
    expect(detailPage).toMatch(/!sendEarlyDisabled &&/);
    expect(detailPage).toMatch(/<CopyButton text=\{r\.message_text\} \/>/);
  });

  it("the next actionable card is visually highlighted for thumb/scan targeting", () => {
    expect(detailPage).toMatch(/data-next-actionable=\{isNextActionable \? "true" : undefined\}/);
    expect(detailPage).toMatch(/isNextActionable \? "border-brand\/50" : "border-line-subtle"/);
  });
});

describe("SendEarlyButton requires confirmation", () => {
  it("first click arms, second click sends (two-step confirm)", () => {
    expect(sendButton).toMatch(/"idle" \| "confirm" \| "pending" \| "sent" \| "error"/);
    expect(sendButton).toMatch(/if \(state === "idle"\) \{\s*setState\("confirm"\);\s*return;/);
    expect(sendButton).toMatch(/Confirm — send follow-up/);
  });

  it("offers a cancel path out of the armed state", () => {
    expect(sendButton).toMatch(/onClick=\{\(\) => setState\("idle"\)\}/);
    expect(sendButton).toContain("Cancel");
  });
});

describe("server action enforces sequence order (defence in depth)", () => {
  it("both manual send paths run the out-of-order guard", () => {
    const hits = actionsSrc.match(/rejectOutOfOrderSend\(/g) ?? [];
    // 1 definition + 2 call sites (SMS + email).
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  it("the guard names the follow-up that must go first", () => {
    expect(actionsSrc).toContain(
      "is next in the sequence — send that one first.",
    );
    expect(actionsSrc).toMatch(
      /Date\.parse\(a\.send_at\) - Date\.parse\(b\.send_at\) \|\|\s*a\.followup_number - b\.followup_number/,
    );
  });
});

describe("cron sends at most ONE follow-up per quote per run", () => {
  it("keeps only the earliest step per quote and releases the rest", () => {
    expect(cronSend).toMatch(/earliestPerQuote/);
    expect(cronSend).toMatch(/r\.followup_number < held\.followup_number/);
    expect(cronSend).toMatch(/sequenceDeferred\+\+/);
  });

  it("reports the deferral count in the run summary", () => {
    expect(cronSend).toMatch(/sequence_deferred: sequenceDeferred/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// C2. The four surfaces share the one source of truth
// ───────────────────────────────────────────────────────────────────────

describe("all surfaces derive from computeNextMove", () => {
  it("summary Next Best Action uses nextMoveSummaryLabel(move) first", () => {
    expect(detailPage).toMatch(
      /nextMoveSummaryLabel\(move\) \?\? nba\?\.label \?\? "Review plan"/,
    );
    expect(detailPage).toMatch(/label="Next Best Action" value=\{nextActionLabel\}/);
  });

  it("Quiet Signal's Best next move is overridden with the unified instruction", () => {
    expect(detailPage).toMatch(/recommendedMove: unifiedInstruction/);
    expect(detailPage).toMatch(
      /recommendedFollowupNumber:\s*move\.followupNumber as 1 \| 2 \| 3 \| 4 \| 5/,
    );
  });

  it("the NEXT MOVE banner renders from the same move object", () => {
    expect(detailPage).toMatch(/move\.kind === "email-queued" \?/);
    expect(detailPage).toMatch(/move\.kind === "email-due" \?/);
    expect(detailPage).toMatch(/move\.kind === "manual-ready" \?/);
  });

  it("the schedule chip never claims a send while a reply holds the sequence", () => {
    expect(detailPage).toMatch(/nextDate && !hasReplyForQuote/);
  });

  it("the chip says 'sends' only for email mode; copy mode says 'scheduled'", () => {
    expect(detailPage).toContain("`Next follow-up sends ${formatSendDate(nextDate)}`");
    expect(detailPage).toContain("`Next follow-up scheduled ${formatSendDate(nextDate)}`");
  });
});

describe("queued-behind state names the real blocker", () => {
  const all: ReminderRow[] = importedPlan() as ReminderRow[];

  it("an overdue NOT-next step renders 'Queued behind follow-up 1', not a stale date", () => {
    const second = all.find((r) => r.followup_number === 2)!;
    const display = computeStepDisplay(second, all, false);
    expect(display.status).toBe("scheduled");
    expect(display.label).toBe("Queued behind follow-up 1");
  });

  it("the earliest overdue step still reads Due now", () => {
    const first = all.find((r) => r.followup_number === 1)!;
    expect(computeStepDisplay(first, all, false).label).toBe("Due now");
  });

  it("a future-dated step keeps its Scheduled <date> label", () => {
    const third = all.find((r) => r.followup_number === 3)!;
    const display = computeStepDisplay(third, all, false);
    expect(display.label).toMatch(/^Scheduled /);
  });
});

// ───────────────────────────────────────────────────────────────────────
// A. Message sequence — banned identities/phrases, closeout language
// ───────────────────────────────────────────────────────────────────────

const ALL_TRADES = [
  "Roofing",
  "Plumbing",
  "HVAC",
  "Electrical",
  "Remodeling",
  "General Contracting",
  "Painting",
  "Landscaping",
  "Concrete",
];

function varsFor(trade: string, contractor: string): VariantVars {
  const project = projectLabel(trade);
  return {
    firstName: "Chris",
    contractorFirstName: contractor,
    project,
    projectDetail: project,
    tradeWord: tradeWord(trade),
  };
}

describe("follow-up copy bans", () => {
  it("no variant on any day ever renders 'Contractor here' — identity is omitted when unknown", () => {
    for (const day of [1, 3, 7, 14, 30] as const) {
      for (const build of SEQUENCE_VARIANTS[day]) {
        for (const trade of ALL_TRADES) {
          // Unknown contractor name → empty string, the placeholder path.
          const msg = build(varsFor(trade, ""));
          expect(msg, `day ${day} / ${trade}`).not.toContain("Contractor here");
          expect(msg).not.toMatch(/\bContractor\b/);
        }
      }
    }
  });

  it("the unknown-sender Day 1 opener still reads naturally (any variant)", () => {
    // The composite seed picks a deterministic variant; whichever it is,
    // the message opens like a real text and carries no placeholder identity.
    const seq = researchSequenceMessages({
      firstName: "Chris",
      contractorFirstName: null,
      trade: "Roofing",
      estimateAmount: 12_000,
    });
    expect(seq.day1).toMatch(/^Hey Chris\b/);
    expect(seq.day1).not.toContain("Contractor here");
    // The canonical v0 path (empty seed) omits the identity clause cleanly.
    const v0 = researchSequenceMessages({
      firstName: "",
      contractorFirstName: "",
      trade: "",
      estimateAmount: 0,
    });
    expect(v0.day1).toBe(
      "Hey there — I looked back over the estimate. Was there a number, timing question, or detail you wanted me to break down?",
    );
  });

  it("Day 7 no longer weakens the ask with 'No rush on my end'", () => {
    for (const build of SEQUENCE_VARIANTS[7]) {
      const msg = build(varsFor("Roofing", "Mike"));
      expect(msg).not.toMatch(/no rush/i);
    }
    expect(fallbacksSrc).not.toContain("No rush on my end");
  });

  it("Day 30 closes respectfully with the lowest-effort reopen: 'just reply here'", () => {
    const v0 = SEQUENCE_VARIANTS[30][0](varsFor("Roofing", "Mike"));
    expect(v0).toContain("I'll close out the roofing estimate after this.");
    expect(v0).toContain("just reply here and I'll pick it back up");
  });

  it("every variant on every day passes the banned-phrase scan", () => {
    for (const day of [1, 3, 7, 14, 30] as const) {
      for (const build of SEQUENCE_VARIANTS[day]) {
        const msg = build(varsFor("Plumbing", "Luis"));
        expect(containsBannedPhrase(msg), msg).toBeNull();
        expect(msg).not.toMatch(/just checking in|have you given up/i);
        expect(msg).not.toMatch(/guarante/i);
        expect(msg).not.toMatch(/!/);
      }
    }
  });

  it("no variant claims price is the reason the homeowner went quiet", () => {
    // Conditional offers ("if it's the number…") are allowed; assertions of
    // cause ("price is what's stopping you") are not.
    for (const day of [1, 3, 7, 14, 30] as const) {
      for (const build of SEQUENCE_VARIANTS[day]) {
        const msg = build(varsFor("Concrete", "Pat"));
        expect(msg).not.toMatch(/price is (the|what|why)/i);
        expect(msg).not.toMatch(/stall on price/i);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// D. Page polish — trade line, email display, green discipline
// ───────────────────────────────────────────────────────────────────────

describe("tradeLocationLine — no dangling separators", () => {
  it("city + state: 'Roofing · Tampa, FL'", () => {
    expect(tradeLocationLine("roofing", "tampa", "fl")).toBe("Roofing · Tampa, FL");
  });

  it("no location at all: bare trade, no comma", () => {
    expect(tradeLocationLine("Roofing", null, null)).toBe("Roofing");
    expect(tradeLocationLine("Roofing", "", "")).toBe("Roofing");
  });

  it("whitespace-only state can never produce 'Roofing,'", () => {
    expect(tradeLocationLine("Roofing", "", " ")).toBe("Roofing");
    expect(tradeLocationLine("Roofing", "  ", "  ")).toBe("Roofing");
  });

  it("state without city: 'Roofing · FL' (no leading comma)", () => {
    expect(tradeLocationLine("Roofing", null, "fl")).toBe("Roofing · FL");
  });

  it("city without state: 'Roofing · Tampa'", () => {
    expect(tradeLocationLine("Roofing", "Tampa", null)).toBe("Roofing · Tampa");
  });

  it("the page renders the helper instead of inline string-glue", () => {
    expect(detailPage).toMatch(/tradeLocationLine\(quote\.trade, quote\.city, quote\.state\)/);
    expect(detailPage).not.toMatch(/quote\.state\.toUpperCase\(\)/);
  });
});

describe("email display and button hierarchy", () => {
  it("the email field truncates with a full-value tooltip instead of mid-address wrapping", () => {
    expect(detailPage).toMatch(/label="Email" value=\{quote\.client_email\} truncate/);
    expect(detailPage).toMatch(/truncate\s*\?\s*"mt-1 truncate text-sm font-bold text-ink-strong"/);
    expect(detailPage).toMatch(/title=\{truncate \? value : undefined\}/);
  });

  it("Got the Job stays the only green (success) action — win confirmation only", () => {
    expect(quoteActions).toMatch(/variant="success"[\s\S]{0,600}Got the Job/);
    // Pause is secondary; Close is ghost + behind a confirm dialog.
    expect(quoteActions).toMatch(/variant="secondary"[\s\S]{0,600}Pause sequence/);
    expect(quoteActions).toMatch(/variant="ghost"[\s\S]{0,600}Close quote/);
    expect(quoteActions).toMatch(/Close this quote\?/);
  });

  it("the page never paints potential math green (success tokens only via status/win paths)", () => {
    // The amount-quiet hero uses the warning token, not success.
    expect(detailPage).toMatch(/text-warning[\s\S]{0,80}Amount still sitting quiet/);
    expect(detailPage).not.toMatch(/text-success[^"]*"\s*>\s*\{formatCurrency\(quote\.estimate_amount\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Regression sweep — banned vocabulary and dead integrations stay out
// ───────────────────────────────────────────────────────────────────────

describe("regression sweep", () => {
  const surfaces = [detailPage, sendButton, quoteActions, nextMoveSrc, fallbacksSrc];

  it("no banned compliance phrases on any changed surface", () => {
    for (const src of surfaces) {
      expect(src).not.toMatch(/guaranteed recovery|guaranteed revenue/i);
      expect(src).not.toMatch(/debt collection|financial recovery/i);
      expect(src).not.toMatch(/AI-powered/i);
      expect(src).not.toMatch(/\bworkflow\b|\bpipeline\b|\boptimize\b|\bengagement\b/i);
      expect(src).not.toMatch(/countdown|expires in|only \d+ left|last chance/i);
    }
  });

  it("no Lemon references return", () => {
    for (const src of surfaces) {
      expect(src.toLowerCase()).not.toContain("lemon");
    }
  });

  it("no CRM language on the changed surfaces", () => {
    for (const src of surfaces) {
      expect(src).not.toMatch(/\bCRM\b/);
    }
  });
});
