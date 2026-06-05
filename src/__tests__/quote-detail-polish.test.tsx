/**
 * @vitest-environment happy-dom
 *
 * Quote Detail / Recovery Plan polish-pass guarantees:
 *   - send_at is anchored to 09:00 America/Chicago (no 3 AM displays)
 *   - detail page formats send dates in Central, not Vercel UTC default
 *   - Quiet Signal honestly says "No engagement signal yet" + actionable next
 *     move when long-quiet with no engagement (no "Normal silence / Early /
 *     Keep the default schedule" for a CRITICAL 20-day quote)
 *   - Next Best Action labels are short enough to render without truncation
 *   - IntelligenceField wraps long values instead of clipping
 *   - Recovery Priority shows the band label only, not the raw numeric score
 *   - Action button order leads with the green "Got the Job"
 *   - WHY_THIS_WORKS carries no academic psychology jargon
 *   - Day 3 v0 / Day 14 v3 / Day 30 v1 carry the polished wording
 *   - One-Tap Reply / pricing / schema untouched
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  normalizeToBusinessHour,
  DEFAULT_TIMEZONE,
  DEFAULT_SEND_HOUR,
} from "@/lib/quotes/business-hours";
import {
  computeQuietSignal,
  type SilenceSignals,
} from "@/lib/quotes/quiet-signal";
import { nextBestAction } from "@/lib/quotes/next-best-action";
import { SEQUENCE_VARIANTS, projectLabel, tradeWord } from "@/lib/ai/fallback-messages";
import type { QuoteRow } from "@/lib/quotes/repo";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const quoteActions = readSource("../components/quotes/QuoteActions.tsx");
const quietCard = readSource("../components/quotes/QuietSignalCard.tsx");

// ---------------------------------------------------------------------------
// 1 + 2. Send time: business-hour anchor, no 3 AM in the UI
// ---------------------------------------------------------------------------

function ctClockHour(date: Date): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TIMEZONE,
    hour: "numeric",
    hour12: false,
  }).format(date);
  return Number(hourStr) % 24;
}

describe("send_at is anchored to 09:00 America/Chicago", () => {
  it("DEFAULT_TIMEZONE and DEFAULT_SEND_HOUR are the documented constants", () => {
    expect(DEFAULT_TIMEZONE).toBe("America/Chicago");
    expect(DEFAULT_SEND_HOUR).toBe(9);
  });

  it("normalizeToBusinessHour shifts a 3 AM UTC click-time to 09:00 Central", () => {
    // 03:00 UTC on a summer day (CDT) is 22:00 the previous day in Central.
    // normalize must walk us forward to 09:00 Central on the calendar day
    // that the input falls in (in Central) — i.e., the previous day at 9 AM.
    const raw = new Date("2026-06-10T03:00:00Z");
    const normalized = normalizeToBusinessHour(raw);
    expect(ctClockHour(normalized)).toBe(9);
  });

  it("normalizeToBusinessHour shifts a 10 PM Central click-time to 09:00 same calendar day", () => {
    // 03:00 UTC = 22:00 CDT (previous day). Should normalize to 09:00 CDT
    // on the previous calendar day (Central perspective).
    const raw = new Date("2026-06-10T03:00:00Z");
    const normalized = normalizeToBusinessHour(raw);
    const dayInCt = new Intl.DateTimeFormat("en-US", {
      timeZone: DEFAULT_TIMEZONE,
      day: "2-digit",
    }).format(normalized);
    expect(dayInCt).toBe("09");
  });

  it("normalizeToBusinessHour is idempotent (already-09:00 stays 09:00)", () => {
    const at9 = normalizeToBusinessHour(new Date("2026-06-10T14:00:00Z"));
    const reapplied = normalizeToBusinessHour(at9);
    expect(reapplied.getTime()).toBe(at9.getTime());
  });

  it("a chain of generated send_ats from a 3 AM UTC baseline never displays at 3 AM", () => {
    // Simulate the production chain: quoteSentAt comes from a click at the
    // off-hour moment, sendAtFromBase adds N days, then normalizeToBusinessHour
    // rounds. Day 1/3/7/14/30 outputs must all land at 09:00 Central.
    const base = new Date("2026-06-10T03:00:00Z");
    for (const days of [1, 3, 7, 14, 30]) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + days);
      const normalized = normalizeToBusinessHour(d);
      expect(ctClockHour(normalized)).toBe(9);
    }
  });
});

describe("detail page formats send dates in Central, not UTC", () => {
  it("formatSendDate passes timeZone: America/Chicago to toLocaleString", () => {
    expect(detailPage).toMatch(/timeZone:\s*DISPLAY_TIMEZONE/);
    expect(detailPage).toMatch(/DISPLAY_TIMEZONE\s*=\s*"America\/Chicago"/);
  });
});

// ---------------------------------------------------------------------------
// 3 + 4 + 5. Quiet Signal: no_signal_yet branch for long-quiet-no-engagement
// ---------------------------------------------------------------------------

function baseSignals(over: Partial<SilenceSignals> = {}): SilenceSignals {
  return {
    outcome: "pending",
    optedOut: false,
    trade: "HVAC",
    estimateAmount: 12_000,
    valueBand: "5k_15k",
    daysSilent: 0,
    followupsSent: 0,
    hasReply: false,
    replyIntent: null,
    openCount: 0,
    clickCount: 0,
    ...over,
  };
}

describe("Quiet Signal: long-quiet + no-engagement uses 'no_signal_yet' (not 'Normal silence / Early')", () => {
  it("20 days quiet, no engagement, no replies → 'No engagement signal yet'", () => {
    const s = computeQuietSignal(baseSignals({ daysSilent: 20 }));
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.reason).toBe("no_signal_yet");
    expect(s.reasonLabel).toBe("No engagement signal yet");
  });

  it("the move is action-oriented (not 'Keep the default follow-up schedule')", () => {
    const s = computeQuietSignal(baseSignals({ daysSilent: 20 }));
    expect(s?.recommendedMove).toMatch(/close-the-loop/i);
    expect(s?.recommendedMove).not.toMatch(/keep the default follow-up schedule/i);
    expect(s?.recommendedFollowupNumber).toBe(3);
  });

  it("evidence names the missing data honestly (no faked diagnosis)", () => {
    const s = computeQuietSignal(baseSignals({ daysSilent: 20 }));
    const blob = (s?.evidence ?? []).join(" ");
    expect(blob).toMatch(/quiet for 20 days/);
    expect(blob).toMatch(/No open, click, or reply signal/);
  });

  it("a 5-day-quiet quote with no signal stays on the calm fallback (Normal silence)", () => {
    const s = computeQuietSignal(baseSignals({ daysSilent: 5 }));
    expect(s?.reason).toBe("normal_silence");
  });

  it("2+ follow-ups sent with zero opens/clicks also triggers no_signal_yet (worked-without-signal)", () => {
    const s = computeQuietSignal(
      baseSignals({ daysSilent: 9, followupsSent: 3 }),
    );
    expect(s?.reason).toBe("no_signal_yet");
  });

  it("QuietSignalCard renders 'Not enough data' as the strength label for no_signal_yet", () => {
    expect(quietCard).toContain("Not enough data");
    expect(quietCard).toMatch(/signal\.reason === "no_signal_yet"/);
  });
});

// ---------------------------------------------------------------------------
// 6. Next Best Action: short labels that fit the IntelligenceField cell
// ---------------------------------------------------------------------------

function fakeQuote(over: Partial<QuoteRow> = {}): QuoteRow {
  // effectiveDaysSilent computes from quote_sent_at, not days_silent. Keep
  // both in sync via the override so band assertions land where intended.
  const daysSilent = over.days_silent ?? 20;
  return {
    id: "q-1",
    user_id: "u-1",
    client_name: "Jane Doe",
    client_email: null,
    client_phone: null,
    trade: "HVAC",
    estimate_amount: 12_000,
    days_silent: daysSilent,
    quote_sent_at: new Date(
      Date.now() - daysSilent * 86_400_000,
    ).toISOString(),
    city: null,
    state: null,
    job_description: null,
    outcome: "pending",
    won_at: null,
    closed_at: null,
    client_opted_out: false,
    sequence_id: "s-1",
    created_at: new Date().toISOString(),
    ...over,
  } as QuoteRow;
}

const MAX_NBA_LABEL_LEN = 30; // safe ceiling for the IntelligenceField cell

describe("Next Best Action labels fit the card", () => {
  it("Critical band uses a short close-the-loop label (no truncation)", () => {
    const nba = nextBestAction(fakeQuote({ days_silent: 30 }), false);
    expect(nba?.label).toBe("Send close-the-loop today");
    expect((nba?.label ?? "").length).toBeLessThanOrEqual(MAX_NBA_LABEL_LEN);
    // The pre-polish 41-char string is gone.
    expect(nba?.label).not.toMatch(/Send the close-the-loop message today/);
  });

  it("At Risk band uses a clear 'next follow-up' label, not the old 'Send early'", () => {
    const nba = nextBestAction(fakeQuote({ days_silent: 12 }), false);
    expect(nba?.label).toBe("Send next follow-up");
    expect((nba?.label ?? "").length).toBeLessThanOrEqual(MAX_NBA_LABEL_LEN);
  });

  it("Reply-received still suggests Mark as won", () => {
    const nba = nextBestAction(fakeQuote(), true);
    expect(nba?.label).toBe("Mark as won");
  });

  it("Won and Closed return null (no card action)", () => {
    expect(nextBestAction(fakeQuote({ outcome: "won" }), false)).toBeNull();
    expect(nextBestAction(fakeQuote({ outcome: "closed" }), false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Recovery Priority: label only, no raw score in the visible field
// ---------------------------------------------------------------------------

describe("Recovery Priority IntelligenceField shows the band label only", () => {
  it("value is score.label, NOT '${score.score} · ${score.label}'", () => {
    expect(detailPage).toMatch(/value=\{score\.label\}/);
    expect(detailPage).not.toMatch(/\$\{score\.score\}\s*·\s*\$\{score\.label\}/);
  });
});

describe("IntelligenceField uses break-words, not truncate", () => {
  it("the value <dd> wraps long strings instead of clipping mid-word", () => {
    expect(detailPage).toMatch(
      /<dd\s+className="mt-1 break-words text-sm font-bold text-ink-strong">/,
    );
    expect(detailPage).not.toMatch(
      /<dd\s+className="mt-1 truncate text-sm font-bold/,
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Action button order — Got the Job first
// ---------------------------------------------------------------------------

describe("Quote action buttons lead with Got the Job", () => {
  it("Got the Job appears before Pause and Close in source order", () => {
    const wonIdx = quoteActions.indexOf("Got the Job");
    const pauseIdx = quoteActions.indexOf("Pause sequence");
    const closeIdx = quoteActions.indexOf("Close quote");
    expect(wonIdx).toBeGreaterThan(0);
    expect(pauseIdx).toBeGreaterThan(wonIdx);
    expect(closeIdx).toBeGreaterThan(pauseIdx);
  });

  it("Got the Job keeps the success variant + green shadow", () => {
    expect(quoteActions).toMatch(
      /variant="success"[\s\S]*?shadow-\[0_0_30px_rgba\(31,169,113/,
    );
  });

  it("Close stays on the quietest variant (ghost)", () => {
    expect(quoteActions).toMatch(
      /variant="ghost"[\s\S]*?Close quote/,
    );
  });
});

// ---------------------------------------------------------------------------
// 9 + 10. Message polishes + Why This Works has no academic jargon
// ---------------------------------------------------------------------------

describe("polished message wordings", () => {
  const sample = {
    firstName: "Jane",
    contractorFirstName: "Mike",
    project: projectLabel("Roofing"),
    projectDetail: projectLabel("Roofing"),
    tradeWord: tradeWord("Roofing"),
  };

  it("Day 3 v0 — 'keep your estimate active' (was vague 'this on the active list')", () => {
    const msg = SEQUENCE_VARIANTS[3][0](sample);
    expect(msg).toContain("Should I keep your estimate active");
    expect(msg).not.toContain("Should I keep this on the active list");
  });

  it("Day 14 v3 — 'what you're looking at' (was 'where it stands')", () => {
    const msg = SEQUENCE_VARIANTS[14][3](sample);
    expect(msg).toContain("what you're looking at");
    expect(msg).not.toContain("where it stands");
  });

  it("Day 30 v1 — 'If you want me to keep it open, just let me know.'", () => {
    const msg = SEQUENCE_VARIANTS[30][1](sample);
    expect(msg).toContain(
      "If you want me to keep it open, just let me know.",
    );
    expect(msg).not.toMatch(/If you decide to revisit it later/);
  });

  it("every polished variant still validates with no banned phrases", () => {
    // Banned vocabulary the message engine has always forbidden.
    const BANNED = [
      /just checking in/i,
      /touching base/i,
      /circling back/i,
      /\bAI\b/,
      /\bCRM\b/,
      /discount/i,
      /urgent/i,
      /last chance/i,
    ];
    for (const day of [1, 3, 7, 14, 30] as const) {
      for (const builder of SEQUENCE_VARIANTS[day]) {
        const msg = builder(sample);
        for (const pat of BANNED) expect(msg).not.toMatch(pat);
        expect(msg).not.toMatch(/!/);
      }
    }
  });
});

describe("Why This Works carries no academic psychology jargon", () => {
  it("WHY_THIS_WORKS block (only) contains no 'loss aversion' / 'reactance' / 'scarcity makes you the prize'", () => {
    const start = detailPage.indexOf("const WHY_THIS_WORKS");
    const end = detailPage.indexOf("};", start);
    const block = detailPage.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(block).not.toMatch(/loss aversion/i);
    expect(block).not.toMatch(/reactance/i);
    expect(block).not.toMatch(/scarcity makes you the prize/i);
    expect(block).not.toMatch(/psychological trigger/i);
  });
});

// ---------------------------------------------------------------------------
// Lock rails: One-Tap Reply / pricing / schema unchanged
// ---------------------------------------------------------------------------

describe("Lock rails — pricing / One-Tap / schema untouched by this pass", () => {
  it("One-Tap Reply card is still mounted on the detail page", () => {
    expect(detailPage).toContain("<OneTapReplyCard");
    expect(detailPage).toContain("latestReply={latestOneTapReply}");
  });

  it("/api/lemonsqueezy/checkout import is not pulled into the detail page", () => {
    expect(detailPage).not.toMatch(/from\s+["']@\/lib\/billing/);
    expect(detailPage).not.toMatch(/stripe/i);
    expect(detailPage).not.toMatch(/lemonsqueezy/i);
  });

  it("CADENCE_DAYS pinned at 1 / 3 / 7 / 14 / 30 (no cadence change in this pass)", () => {
    expect(detailPage).toMatch(
      /CADENCE_DAYS[^=]*=\s*\{\s*1:\s*1,\s*2:\s*3,\s*3:\s*7,\s*4:\s*14,\s*5:\s*30/,
    );
  });
});
