/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import {
  computeQuietSignal,
  valueBandFor,
  type SilenceSignals,
} from "@/lib/quotes/quiet-signal";
import { QuietSignalCard } from "@/components/quotes/QuietSignalCard";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const cardSrc = readSource("../components/quotes/QuietSignalCard.tsx");
const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");

afterEach(() => cleanup());

function baseSignals(over: Partial<SilenceSignals> = {}): SilenceSignals {
  return {
    outcome: "pending",
    optedOut: false,
    trade: "Plumbing",
    estimateAmount: 2_400,
    valueBand: "1k_5k",
    daysSilent: 6,
    followupsSent: 2,
    hasReply: false,
    replyIntent: null,
    openCount: 0,
    clickCount: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// R0 — suppress
// ---------------------------------------------------------------------------

describe("R0 — suppress (card does not render)", () => {
  it("returns null when the quote is already won", () => {
    expect(computeQuietSignal(baseSignals({ outcome: "won" }))).toBeNull();
  });
  it("returns null when the customer opted out", () => {
    expect(computeQuietSignal(baseSignals({ optedOut: true }))).toBeNull();
  });
  it("returns null when the customer's reply was positive (Reply Radar covers it)", () => {
    expect(
      computeQuietSignal(
        baseSignals({ hasReply: true, replyIntent: "positive" }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reply-backed diagnoses (R1-R4) — the strongest possible signal
// ---------------------------------------------------------------------------

describe("R1-R4 — reply-backed diagnoses (the customer told us)", () => {
  it("R1: price_objection -> price_uncertainty, strong, recommends Day 14", () => {
    const s = computeQuietSignal(
      baseSignals({ hasReply: true, replyIntent: "price_objection" }),
    );
    expect(s).not.toBeNull();
    expect(s!.reason).toBe("price_uncertainty");
    expect(s!.reasonLabel).toBe("Price uncertainty");
    expect(s!.strength).toBe("strong");
    expect(s!.recommendedFollowupNumber).toBe(4);
  });

  it("R2: needs_time -> decision_pending, strong, recommends Day 3", () => {
    const s = computeQuietSignal(
      baseSignals({ hasReply: true, replyIntent: "needs_time" }),
    );
    expect(s!.reason).toBe("decision_pending");
    expect(s!.strength).toBe("strong");
    expect(s!.recommendedFollowupNumber).toBe(2);
  });

  it("R3: question -> open_question, strong, points to Reply Radar (no follow-up)", () => {
    const s = computeQuietSignal(
      baseSignals({ hasReply: true, replyIntent: "question" }),
    );
    expect(s!.reason).toBe("open_question");
    expect(s!.strength).toBe("strong");
    expect(s!.recommendedFollowupNumber).toBeNull();
  });

  it("R4: not_interested -> lost_interest, strong, recommends Day 30", () => {
    const s = computeQuietSignal(
      baseSignals({ hasReply: true, replyIntent: "not_interested" }),
    );
    expect(s!.reason).toBe("lost_interest");
    expect(s!.strength).toBe("strong");
    expect(s!.recommendedFollowupNumber).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// R5 — behavioral price_uncertainty (every prerequisite enforced)
// ---------------------------------------------------------------------------

describe("R5 — behavioral diagnosis requires reliable engagement (click)", () => {
  it("medium when the click prerequisite is met at the baseline (1 click, 0 opens)", () => {
    const s = computeQuietSignal(
      baseSignals({
        clickCount: 1,
        openCount: 0,
        daysSilent: 9,
        valueBand: "5k_15k",
        estimateAmount: 8_500,
      }),
    );
    expect(s!.reason).toBe("price_uncertainty");
    expect(s!.strength).toBe("medium");
    expect(s!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(s!.confidence).toBeLessThan(0.9);
  });

  it("strong when corroborated (multi-click pushes >= 0.90)", () => {
    const s = computeQuietSignal(
      baseSignals({
        clickCount: 2,
        openCount: 5,
        daysSilent: 9,
        valueBand: "5k_15k",
      }),
    );
    expect(s!.strength).toBe("strong");
    expect(s!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("OPENS ALONE never trigger a behavioral diagnosis (Apple MPP guard)", () => {
    const s = computeQuietSignal(
      baseSignals({ openCount: 20, clickCount: 0, daysSilent: 9 }),
    );
    expect(s!.reason).toBe("normal_silence");
    expect(s!.strength).toBe("early");
  });

  it("falls back when the value band is too small (under $1k)", () => {
    const s = computeQuietSignal(
      baseSignals({
        clickCount: 2,
        openCount: 5,
        daysSilent: 9,
        valueBand: "under_1k",
        estimateAmount: 600,
      }),
    );
    expect(s!.reason).toBe("normal_silence");
  });

  it("falls back when the quote is too fresh (< 3 days)", () => {
    const s = computeQuietSignal(
      baseSignals({
        clickCount: 2,
        openCount: 5,
        daysSilent: 1,
        valueBand: "5k_15k",
      }),
    );
    expect(s!.reason).toBe("normal_silence");
  });

  it("falls back when the quote is too stale (> 21 days)", () => {
    const s = computeQuietSignal(
      baseSignals({
        clickCount: 2,
        openCount: 5,
        daysSilent: 28,
        valueBand: "5k_15k",
      }),
    );
    expect(s!.reason).toBe("normal_silence");
  });
});

// ---------------------------------------------------------------------------
// R6 — safe fallback
// ---------------------------------------------------------------------------

describe("R6 — safe fallback (calm, no claim)", () => {
  it("returns normal_silence + Early when there is no engagement and no reply", () => {
    const s = computeQuietSignal(
      baseSignals({ daysSilent: 4, openCount: 0, clickCount: 0 }),
    );
    expect(s!.reason).toBe("normal_silence");
    expect(s!.strength).toBe("early");
    expect(s!.recommendedMove).toContain("default follow-up schedule");
    expect(s!.recommendedFollowupNumber).toBeNull();
  });

  it("the early-window evidence sentence is used for fresh quotes", () => {
    const s = computeQuietSignal(baseSignals({ daysSilent: 2 }));
    expect(s!.evidence.join(" ")).toContain(
      "still early in the follow-up window",
    );
  });
});

// ---------------------------------------------------------------------------
// Banned vocabulary — engine output must use ONLY the locked phrases
// ---------------------------------------------------------------------------

describe("Quiet Signal engine output uses only the approved vocabulary", () => {
  const cases: SilenceSignals[] = [
    baseSignals(),
    baseSignals({ hasReply: true, replyIntent: "price_objection" }),
    baseSignals({ hasReply: true, replyIntent: "needs_time" }),
    baseSignals({ hasReply: true, replyIntent: "question" }),
    baseSignals({ hasReply: true, replyIntent: "not_interested" }),
    baseSignals({ clickCount: 2, openCount: 5, daysSilent: 9, valueBand: "5k_15k" }),
  ];
  const FORBIDDEN = [
    "silent because",
    "% confident",
    "we know why",
    "psychological trigger",
    "loss aversion",
    "reactance",
    "decoder",
    "ai diagnosis",
  ];

  for (const s of cases) {
    it(`no forbidden vocabulary for ${s.replyIntent ?? "behavioral/silent"}`, () => {
      const out = computeQuietSignal(s);
      if (!out) return;
      const blob = [out.reasonLabel, out.recommendedMove, ...out.evidence]
        .join(" ")
        .toLowerCase();
      for (const phrase of FORBIDDEN) {
        expect(blob.includes(phrase), `"${phrase}" found in: ${blob}`).toBe(
          false,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// valueBandFor — sanity (mirrors event-emitter)
// ---------------------------------------------------------------------------

describe("valueBandFor", () => {
  it("matches event-emitter thresholds", () => {
    expect(valueBandFor(0)).toBe("under_1k");
    expect(valueBandFor(999)).toBe("under_1k");
    expect(valueBandFor(1_000)).toBe("1k_5k");
    expect(valueBandFor(4_999)).toBe("1k_5k");
    expect(valueBandFor(5_000)).toBe("5k_15k");
    expect(valueBandFor(14_999)).toBe("5k_15k");
    expect(valueBandFor(15_000)).toBe("15k_50k");
    expect(valueBandFor(50_000)).toBe("over_50k");
  });
});

// ---------------------------------------------------------------------------
// QuietSignalCard — UI contract (no numeric confidence ever)
// ---------------------------------------------------------------------------

describe("QuietSignalCard — UI contract", () => {
  it("renders nothing when the signal is null", () => {
    const { container } = render(
      React.createElement(QuietSignalCard, { signal: null }),
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the strong reply-backed case correctly", () => {
    const signal = computeQuietSignal(
      baseSignals({ hasReply: true, replyIntent: "price_objection" }),
    );
    render(React.createElement(QuietSignalCard, { signal }));
    expect(screen.getByText(/Possible stall reason/i)).toBeTruthy();
    expect(screen.getByText(/^Signal$/i)).toBeTruthy();
    expect(screen.getByText(/What we can see/i)).toBeTruthy();
    expect(screen.getByText(/Best next move/i)).toBeTruthy();
    expect(screen.getByText("Price uncertainty")).toBeTruthy();
    expect(screen.getByText("Strong")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Open recommended follow-up/i }),
    ).toBeTruthy();
  });

  it("renders the calm fallback correctly", () => {
    const signal = computeQuietSignal(baseSignals({ daysSilent: 2 }));
    render(React.createElement(QuietSignalCard, { signal }));
    expect(screen.getByText("Normal silence")).toBeTruthy();
    expect(screen.getByText("Early")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /recommended follow-up/i })).toBeNull();
  });

  it("the rendered DOM NEVER contains a numeric confidence (%, 0.8, etc.)", () => {
    for (const s of [
      computeQuietSignal(baseSignals({ hasReply: true, replyIntent: "price_objection" })),
      computeQuietSignal(baseSignals({ clickCount: 2, openCount: 5, daysSilent: 9, valueBand: "5k_15k" })),
      computeQuietSignal(baseSignals()),
    ]) {
      const { container } = render(
        React.createElement(QuietSignalCard, { signal: s }),
      );
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/%/);
      expect(text).not.toMatch(/\bconfident\b/i);
      expect(text).not.toMatch(/\b0\.\d/);
      expect(text).not.toMatch(/Silent because/i);
      expect(text).not.toMatch(/Decoder/i);
      cleanup();
    }
  });

  it("the recommended-follow-up link targets the anchor on the same page", () => {
    const signal = computeQuietSignal(
      baseSignals({ hasReply: true, replyIntent: "price_objection" }),
    );
    render(React.createElement(QuietSignalCard, { signal }));
    expect(
      screen
        .getByRole("link", { name: /Open recommended follow-up/i })
        .getAttribute("href"),
    ).toBe("#followup-4");
  });
});

// ---------------------------------------------------------------------------
// Source-level guarantees on the card + the detail page integration
// ---------------------------------------------------------------------------

describe("QuietSignalCard source — locked vocabulary", () => {
  it("uses 'Possible stall reason' / 'Signal' / 'What we can see' / 'Best next move'", () => {
    expect(cardSrc).toContain("Possible stall reason");
    expect(cardSrc).toContain("Signal");
    expect(cardSrc).toContain("What we can see");
    expect(cardSrc).toContain("Best next move");
    expect(cardSrc).not.toContain("Likely stall reason");
  });

  it("does NOT use any forbidden vocabulary", () => {
    expect(cardSrc).not.toMatch(/Silent because/i);
    expect(cardSrc).not.toMatch(/% confident/i);
    expect(cardSrc).not.toMatch(/We know why/i);
    expect(cardSrc).not.toMatch(/Silence Decoder/i);
    expect(cardSrc).not.toMatch(/\bDecoder\b/i);
    expect(cardSrc).not.toMatch(/loss aversion/i);
    expect(cardSrc).not.toMatch(/reactance/i);
    expect(cardSrc).not.toMatch(/psychological trigger/i);
    expect(cardSrc).not.toMatch(/AI diagnosis/i);
  });

  it("renders Early / Medium / Strong as the ONLY strength tokens", () => {
    expect(cardSrc).toContain('"Early"');
    expect(cardSrc).toContain('"Medium"');
    expect(cardSrc).toContain('"Strong"');
  });

  it("does not render confidence as a number anywhere in the card source", () => {
    // No "{signal.confidence" interpolation; no "%" suffix; no "0.8" literal.
    expect(cardSrc).not.toMatch(/\{\s*signal\.confidence/);
    expect(cardSrc).not.toMatch(/confidence.*%/);
  });
});

describe("detail page integration — Quiet Signal mounted, anchors in place", () => {
  it("imports computeQuietSignal and the card", () => {
    expect(detailPage).toContain("computeQuietSignal");
    expect(detailPage).toContain("QuietSignalCard");
  });

  it("mounts <QuietSignalCard /> on the detail page", () => {
    expect(detailPage).toMatch(/<QuietSignalCard signal=\{quietSignal\}/);
  });

  it("aggregates open_count and click_count from outbound_messages", () => {
    expect(detailPage).toMatch(/open_count, click_count/);
    expect(detailPage).toContain("totalOpenCount");
    expect(detailPage).toContain("totalClickCount");
  });

  it("adds id=\"followup-{n}\" anchors on each reminder card (so the button can scroll)", () => {
    expect(detailPage).toMatch(/id=\{`followup-\$\{r\.followup_number\}`\}/);
  });

  it("does NOT introduce automatic plan swap / message regeneration", () => {
    // We surface a recommendation; we never mutate reminders from the card.
    expect(detailPage).not.toMatch(/swapFollowup|replacePlan|regeneratePlan/);
  });

  it("WHY_THIS_WORKS source block matches the no-overclaim rewrite", () => {
    expect(detailPage).toContain(
      `const WHY_THIS_WORKS: Record<FollowupStep, string> = {
  1: "Asking which part to break down is easier to answer than 'any update?' — it gives them a specific, low-effort way back into the conversation.",
  2: "A schedule question has a real answer. Keep it active or set it aside is a choice they can make in five seconds without committing to the job.",
  3: "It gives them a smaller way back in than approving the whole estimate. If scope, timing, or total is the blocker, they can answer without starting over.",
  4: "A simple active / pause / close choice turns silence into a decision without forcing a yes.",
  5: "A respectful close-out takes the pressure off both sides. The door stays open, so replying later is easy — nothing ended badly.",
};`,
    );
  });
});

// ---------------------------------------------------------------------------
// Locked surfaces — recovery messages + cron untouched
// ---------------------------------------------------------------------------

describe("locked surfaces untouched by Quiet Signal", () => {
  const fallbackMsgs = readSource("../lib/ai/fallback-messages.ts");
  const cron = readSource("../app/api/cron/send/route.ts");

  it("fallback-messages.ts has no Quiet Signal imports or hooks", () => {
    expect(fallbackMsgs).not.toContain("computeQuietSignal");
    expect(fallbackMsgs).not.toContain("QuietSignalCard");
    expect(fallbackMsgs).not.toContain("quiet-signal");
  });

  it("cron/send has no Quiet Signal imports or hooks", () => {
    expect(cron).not.toContain("computeQuietSignal");
    expect(cron).not.toContain("QuietSignalCard");
    expect(cron).not.toContain("quiet-signal");
  });
});
