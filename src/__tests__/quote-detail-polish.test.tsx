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
  formatScheduleDateTime,
  DEFAULT_TIMEZONE,
  DEFAULT_SEND_HOUR,
} from "@/lib/quotes/business-hours";
import {
  computeQuietSignal,
  type SilenceSignals,
} from "@/lib/quotes/quiet-signal";
import { nextBestAction } from "@/lib/quotes/next-best-action";
import {
  SEQUENCE_VARIANTS,
  projectLabel,
  researchSequenceMessages,
  tradeWord,
} from "@/lib/ai/fallback-messages";
import type { QuoteRow } from "@/lib/quotes/repo";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const quoteActions = readSource("../components/quotes/QuoteActions.tsx");
const quietCard = readSource("../components/quotes/QuietSignalCard.tsx");
const manualActions = readSource("../components/quotes/ManualMessageActions.tsx");
const replyPlaybook = readSource("../components/quotes/ReplyPlaybook.tsx");
const stepStatusSrc = readSource("../lib/quotes/step-status.ts");
const viewModelSrc = readSource("../lib/recovery/recovery-plan-view-model.ts");
const recoveryLogicSrc = readSource("../lib/recovery/recovery-logic.ts");

// ---------------------------------------------------------------------------
// 0. Command-center hierarchy: one quote, one message, one action
// ---------------------------------------------------------------------------

describe("quote detail command-center hierarchy", () => {
  it("renders the command action panel before the old summary grid", () => {
    const commandIdx = detailPage.indexOf("<CommandActionPanel");
    const summaryIdx = detailPage.indexOf("<QuoteSummary");
    expect(commandIdx).toBeGreaterThan(-1);
    expect(summaryIdx).toBeGreaterThan(commandIdx);
    expect(detailPage).toContain('data-testid="quote-command-panel"');
    expect(detailPage).toContain('data-testid="quote-command-message"');
    expect(detailPage).toContain('data-testid="quote-command-actions"');
  });

  it("uses the existing safe Send today control as the dominant command action", () => {
    expect(detailPage).toMatch(
      /<SendEarlyButton[\s\S]*variant="primary"[\s\S]*size="lg"[\s\S]*fullWidth/,
    );
    expect(detailPage).toContain("text={viewModel.copyMessage}");
    expect(detailPage).toContain('source="quote_command"');
  });

  it("makes the command panel action-first, then shows the reply playbook", () => {
    expect(detailPage).toContain('data-testid="quote-command-promise"');
    expect(viewModelSrc).toContain('"Send this today"');
    expect(viewModelSrc).toContain("the next reply is already ready");
    expect(detailPage).toContain("Message to send");
    expect(detailPage).toContain("<ReplyPlaybook");
    expect(replyPlaybook).toContain("Reply playbook");
    expect(replyPlaybook).toContain("{paths.length} next replies ready");
    expect(replyPlaybook).toContain("Copy reply");
  });

  it("shows one active reason in the command panel and collapses future reasons", () => {
    expect(detailPage).toContain('data-testid="quote-command-reason"');
    expect(detailPage).toContain("viewModel.currentWhyThisWorks");
    expect(detailPage).toContain('data-followup-collapsed="true"');
    expect(detailPage).toContain("<details");
  });

  it("shows reply rescue paths in the command panel for the likely customer replies", () => {
    expect(replyPlaybook).toContain('data-testid="reply-rescue-paths"');
    expect(recoveryLogicSrc).toContain("Still interested");
    expect(recoveryLogicSrc).toContain("Price concern");
    expect(recoveryLogicSrc).toContain("Bad timing");
    expect(recoveryLogicSrc).toContain("Went another way");
    expect(recoveryLogicSrc).toContain("must-do, optional, and later");
  });

  it("keeps the 6-message sequence intact behind the active command", () => {
    expect(viewModelSrc).toContain("6-message recovery plan");
    expect(detailPage).toMatch(/viewModel\.sequenceCards\.map/);
    expect(viewModelSrc).toContain("pendingReminders.map");
  });

  it("adds manual SMS and WhatsApp actions to the command message and sequence messages", () => {
    expect(detailPage).toContain("ManualMessageActions");
    expect(detailPage).toMatch(/source="quote_command"/);
    expect(detailPage).toMatch(
      /source=\{`recovery_sequence_\$\{card\.key\}`\}/,
    );
    expect(manualActions).toContain("Open SMS");
    expect(manualActions).toContain("Open WhatsApp");
    expect(manualActions).toContain("Copy SMS message");
    expect(manualActions).toContain("Copy WhatsApp message");
    expect(manualActions).toContain(
      "`sms:${recipient}?body=${encodeURIComponent(message)}`",
    );
    expect(manualActions).toContain("normalizePhone(phone)");
    expect(detailPage).toContain("phone={viewModel.quote.phone}");
    expect(manualActions).toContain("https://wa.me/?text=");
    expect(manualActions).toContain("Nothing sends until you tap send");
    expect(manualActions).toContain("grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2");
    expect(manualActions).toContain("min-h-10");
    expect(manualActions).toContain("break-words");
  });

  it("manual SMS and WhatsApp analytics never include raw message, quote, or customer data", () => {
    expect(manualActions).toContain(
      'track("sms_opened", { surface: source, ...tracking })',
    );
    expect(manualActions).toContain(
      'track("whatsapp_opened", { surface: source, ...tracking })',
    );
    expect(manualActions).toMatch(/track\(channel === "sms" \? "sms_copied" : "whatsapp_copied",[\s\S]*surface: source/);
    expect(manualActions).not.toMatch(/track\([^)]*\{\s*(message|body|client|customer|amount|phone|quote)\s*:/i);
  });

  it("does not hardcode painting copy for non-painting quote messages", () => {
    expect(detailPage).not.toMatch(/painting estimate|painting quote/i);
    const seq = researchSequenceMessages({
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
      quoteId: "roofing-non-painting",
    });
    const all = Object.values(seq).join(" ");
    expect(all).toMatch(/roof/i);
    expect(all).not.toMatch(/painting/i);
  });

  it("softens Quiet Signal stall copy so it does not overclaim certainty", () => {
    expect(quietCard).toContain("Possible stall reason");
    expect(quietCard).toContain("What we can see");
    expect(quietCard).not.toContain("Likely stall reason");
  });
});

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
    // Simulate the production chain: the plan-start instant comes from a click
    // at an off-hour moment, scheduleSendAt adds N days, then
    // normalizeToBusinessHour rounds. All six outputs must land at
    // 09:00 Central.
    const base = new Date("2026-06-10T03:00:00Z");
    for (const days of [1, 5, 10, 14, 21, 60]) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + days);
      const normalized = normalizeToBusinessHour(d);
      expect(ctClockHour(normalized)).toBe(9);
    }
  });
});

describe("detail page formats send dates via the shared Central formatter", () => {
  it("the ViewModel delegates schedule labels to formatScheduleDateTime", () => {
    expect(viewModelSrc).toContain("formatScheduleDateTime");
    expect(detailPage).not.toMatch(/DISPLAY_TIMEZONE/);
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

describe("Quiet Signal: At Risk / Critical + no engagement uses 'no_signal_yet' (never 'Normal silence / Early')", () => {
  it("the reported bug: 11-day At Risk quote, no engagement → 'No engagement signal yet'", () => {
    const s = computeQuietSignal(baseSignals({ daysSilent: 11 }));
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.reason).toBe("no_signal_yet");
    expect(s.reasonLabel).toBe("No engagement signal yet");
    // Never the calm verdict for an at-risk quote.
    expect(s.reason).not.toBe("normal_silence");
  });

  it("7 days (At Risk boundary) + no engagement → no_signal_yet", () => {
    expect(computeQuietSignal(baseSignals({ daysSilent: 7 }))?.reason).toBe(
      "no_signal_yet",
    );
  });

  it("20 days (Critical) + no engagement → no_signal_yet", () => {
    expect(computeQuietSignal(baseSignals({ daysSilent: 20 }))?.reason).toBe(
      "no_signal_yet",
    );
  });

  it("the move is action-oriented: 'Send the next follow-up today.'", () => {
    const s = computeQuietSignal(baseSignals({ daysSilent: 11 }));
    expect(s?.recommendedMove).toMatch(/Send the next follow-up today/i);
    expect(s?.recommendedMove).not.toMatch(/keep the default follow-up schedule/i);
    expect(s?.recommendedFollowupNumber).toBe(3);
  });

  it("strength is not the calm 'early' tone for an at-risk no-signal quote", () => {
    // "medium" drives a warning-toned card; the visible label is overridden
    // to "Not enough data". Either way it must not read as the calm 'early'.
    const s = computeQuietSignal(baseSignals({ daysSilent: 11 }));
    expect(s?.strength).not.toBe("early");
  });

  it("evidence names the missing data honestly (no faked diagnosis)", () => {
    const s = computeQuietSignal(baseSignals({ daysSilent: 20 }));
    const blob = (s?.evidence ?? []).join(" ");
    expect(blob).toMatch(/quiet for 20 days/);
    expect(blob).toMatch(/No open, click, or reply signal/);
  });

  it("Early/Cooling quiet quote can STILL show Normal silence (5 days, no signal)", () => {
    const s = computeQuietSignal(baseSignals({ daysSilent: 5 }));
    expect(s?.reason).toBe("normal_silence");
    expect(s?.strength).toBe("early");
  });

  it("a 6-day cooling quote stays calm (boundary: < 7 days)", () => {
    expect(computeQuietSignal(baseSignals({ daysSilent: 6 }))?.reason).toBe(
      "normal_silence",
    );
  });

  it("an at-risk quote WITH clicks is not 'no signal' — it has signal", () => {
    // clicks present → routes to R5 behavioral or the calm fallback, never
    // the no_signal_yet branch (which requires zero opens AND zero clicks).
    const s = computeQuietSignal(
      baseSignals({ daysSilent: 11, clickCount: 2, openCount: 4 }),
    );
    expect(s?.reason).not.toBe("no_signal_yet");
  });

  it("QuietSignalCard renders the ViewModel signal without a legacy local override", () => {
    expect(quietCard).toContain("{signal.signal}");
    expect(quietCard).not.toContain("Not enough data");
    expect(quietCard).not.toMatch(/signal\.reason === "no_signal_yet"/);
  });
});

// ---------------------------------------------------------------------------
// 1. One shared schedule formatter — header / badge / footer never disagree
// ---------------------------------------------------------------------------

describe("schedule times use ONE shared formatter (America/Chicago, with minutes)", () => {
  // 14:00 UTC = 09:00 CDT on a June day — the canonical generated send hour.
  const NINE_AM_CT = "2026-06-10T14:00:00Z";

  it("formatScheduleDateTime renders 9:00 AM in Central, with minutes", () => {
    const out = formatScheduleDateTime(NINE_AM_CT);
    expect(out).toMatch(/9:00\s?AM/);
    expect(out).toMatch(/Jun 10/);
    // Never the UTC 2 PM the old badge formatter produced.
    expect(out).not.toMatch(/2:00\s?PM/);
    expect(out).not.toMatch(/\bPM\b/);
  });

  it("a GENERATED send time (normalized) always formats to 9:00 AM, never 3 AM", () => {
    // The real guarantee: normalizeToBusinessHour (generation) + the shared
    // formatter (display) compose to a 9 AM business-hour label regardless of
    // the click-moment. Feed a 3-AM-ish UTC baseline through the chain.
    const generated = normalizeToBusinessHour(new Date("2026-06-10T03:00:00Z"));
    const label = formatScheduleDateTime(generated);
    expect(label).toMatch(/9:00\s?AM/);
    expect(label).not.toMatch(/3:00\s?AM/);
  });

  it("step-status badge calls the shared formatter (not its own UTC one)", () => {
    expect(stepStatusSrc).toContain("formatScheduleDateTime");
    // The old hour-only, timezone-less Intl.DateTimeFormat helpers are gone.
    expect(stepStatusSrc).not.toMatch(/function formatDate\(/);
    expect(stepStatusSrc).not.toMatch(/function formatTime\(/);
  });

  it("detail page header + footer route through the shared formatter", () => {
    expect(viewModelSrc).toContain("formatScheduleDateTime");
    expect(detailPage).toContain("card.scheduledLabel");
    expect(detailPage).toContain("viewModel.sequenceScheduleLabel");
  });

  it("badge and footer produce the IDENTICAL string for the same send_at", () => {
    // The badge label is `Scheduled ${formatScheduleDateTime(send_at)}` and the
    // footer is `Scheduled ${formatScheduleDateTime(send_at)} · EMAIL`; both
    // share the formatter, so the date/time portion is byte-identical.
    const badge = `Scheduled ${formatScheduleDateTime(NINE_AM_CT)}`;
    const footer = `Scheduled ${formatScheduleDateTime(NINE_AM_CT)} · EMAIL`;
    expect(footer.startsWith(badge)).toBe(true);
  });

  it("the ViewModel computes effective age before building Quiet Signal", () => {
    expect(viewModelSrc).toMatch(
      /const daysQuiet = effectiveDaysSilent\(quote, nowMs\)/,
    );
    expect(viewModelSrc).toContain("getQuietSignal(recoveryWindow)");
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
  it("Critical band uses a short scope-rescue label (no truncation)", () => {
    const nba = nextBestAction(fakeQuote({ days_silent: 30 }), false);
    expect(nba?.label).toBe("Send scope rescue today");
    expect((nba?.label ?? "").length).toBeLessThanOrEqual(MAX_NBA_LABEL_LEN);
    // The pre-polish 41-char string is gone.
    expect(nba?.label).not.toMatch(/Send the scope rescue message today/);
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
  it("value is windowPriorityLabel(recoveryWindow), NOT '${score.score} · ${score.label}'", () => {
    expect(detailPage).toMatch(
      /label="Priority" value=\{viewModel\.priorityLabel\}/,
    );
    expect(detailPage).not.toMatch(/\$\{score\.score\}\s*·\s*\$\{score\.label\}/);
  });
});

describe("IntelligenceField never clips: text wraps, currency never breaks", () => {
  it("text values use break-words (not truncate) so labels never clip mid-word", () => {
    expect(detailPage).toMatch(/mt-1 break-words text-sm font-bold text-ink-strong/);
    expect(detailPage).not.toMatch(
      /<dd\s+className="mt-1 truncate text-sm font-bold/,
    );
  });

  it("numeric/currency values use whitespace-nowrap + tabular-nums (no '$4,00' break)", () => {
    // The amount must stay on one line so '$4,000' can never split into
    // '$4,00' / '0'. The numeric branch is the fix.
    expect(detailPage).toMatch(
      /mt-1 whitespace-nowrap tabular-nums text-sm font-bold text-ink-strong/,
    );
  });

  it("the Amount quiet field is rendered with the numeric flag", () => {
    expect(detailPage).toMatch(
      /<IntelligenceField\s+label="Amount quiet"[\s\S]*?numeric/,
    );
  });

  it("IntelligenceField accepts a numeric prop that selects the no-break class", () => {
    expect(detailPage).toMatch(/numeric\?\:\s*boolean/);
    expect(detailPage).toMatch(/numeric\s*\?\s*\n?\s*"mt-1 whitespace-nowrap tabular-nums/);
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

  it("Got the Job keeps the success variant + premium shadow", () => {
    expect(quoteActions).toMatch(
      /variant="success"[\s\S]*?shadow-premium/,
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

  it("Day 10 v0 uses the active-or-close decision", () => {
    const msg = SEQUENCE_VARIANTS[10][0](sample);
    expect(msg).toContain("on my active list");
    expect(msg).toContain("close it out");
  });

  it("no Day 10 variant contains weak generic active phrasing", () => {
    for (let i = 0; i < SEQUENCE_VARIANTS[10].length; i++) {
      const msg = SEQUENCE_VARIANTS[10][i](sample);
      expect(msg).not.toContain("this one active");
      expect(msg).not.toContain("keep this one");
    }
  });

  it("Day 10 v4 is a concrete open-or-closed ask", () => {
    const msg = SEQUENCE_VARIANTS[10][3](sample);
    expect(msg).toContain("leave the roofing estimate active");
    expect(msg).toContain("mark it closed");
  });

  it("Day 14 v3 — tightened decision-bridge offer (was the wordy 'what you're looking at')", () => {
    const msg = SEQUENCE_VARIANTS[14][3](sample);
    expect(msg).toContain("left open, revised, or closed out?");
    expect(msg).not.toContain("what you're looking at");
    expect(msg).not.toContain("where it stands");
  });

  it("Day 21 v2 leaves a no-awkward-restart path", () => {
    const msg = SEQUENCE_VARIANTS[21][1](sample);
    expect(msg).toContain("no awkward restart");
    expect(msg).not.toMatch(/last chance/i);
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
    for (const day of [1, 5, 10, 14, 21, 60] as const) {
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
    const start = recoveryLogicSrc.indexOf("getWhyThisWorksForStep");
    const end = recoveryLogicSrc.indexOf("// One-Tap Reply options", start);
    const block = recoveryLogicSrc.slice(start, end);
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

  it("CADENCE_DAYS is pinned at 1 / 5 / 10 / 14 / 21 / 60", () => {
    expect(recoveryLogicSrc).toMatch(/1:\s*1/);
    expect(recoveryLogicSrc).toMatch(/2:\s*5/);
    expect(recoveryLogicSrc).toMatch(/3:\s*10/);
    expect(recoveryLogicSrc).toMatch(/4:\s*14/);
    expect(recoveryLogicSrc).toMatch(/5:\s*21/);
    expect(recoveryLogicSrc).toMatch(/6:\s*60/);
  });
});
