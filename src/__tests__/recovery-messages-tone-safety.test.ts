/**
 * Final tone-safety pass: every visible recovery-message variant must read
 * like something a real contractor would send under his own name — calm,
 * direct, not accusatory, not copywriter-clever, not overly sharp.
 *
 * Scoped to message-body wording only; does not touch cadence, scheduling,
 * UI, or the engine architecture.
 */
import { describe, expect, it } from "vitest";
import {
  SEQUENCE_VARIANTS,
  projectLabel,
  tradeWord,
} from "@/lib/ai/fallback-messages";
import { MAX_MESSAGE_CHARS, validateMessage } from "@/lib/ai/validate-message";

const TRADES = [
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Remodeling",
  "General Contracting",
  "Landscaping",
  "Painting",
  "Concrete",
];
const NAMES = ["Jane", "Tom", "Sarah", "John", "Amanda", "Chris", "Karen"];

function varsFor(firstName: string, trade: string) {
  const project = projectLabel(trade);
  return {
    firstName,
    contractorFirstName: "Mike",
    project,
    projectDetail: project,
    tradeWord: tradeWord(trade),
  };
}

function everyMessage(): string[] {
  const out: string[] = [];
  for (const day of [1, 5, 10, 14, 21, 60] as const) {
    for (const builder of SEQUENCE_VARIANTS[day]) {
      for (const trade of TRADES) {
        for (const name of NAMES) {
          out.push(builder(varsFor(name, trade)));
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The 6-step arc + per-day variant count are locked.
// ---------------------------------------------------------------------------

describe("the 6-step arc + variant counts are locked", () => {
  it("the arc exposes exactly 6 steps", () => {
    expect(Object.keys(SEQUENCE_VARIANTS).map(Number).sort((a, b) => a - b)).toEqual([
      1, 5, 10, 14, 21, 60,
    ]);
  });

  it("each step exposes at least 4 variants", () => {
    for (const day of [1, 5, 10, 14, 21, 60] as const) {
      expect(SEQUENCE_VARIANTS[day].length).toBeGreaterThanOrEqual(4);
    }
  });
});

// ---------------------------------------------------------------------------
// Risky / accusatory / copywriter-clever wording is gone
// ---------------------------------------------------------------------------

describe("no variant carries risky tone (accusatory / sharp / copywriter-clever)", () => {
  const messages = everyMessage();

  it("'Have you given up on…' frame is gone from EVERY variant on EVERY day", () => {
    for (const msg of messages) {
      expect(msg).not.toMatch(/Have you given up on/i);
      expect(msg).not.toMatch(/\bgiven up on\b/i);
    }
  });

  it("the previous copywriter-conditional 'If a number or a detail is in the way' is gone", () => {
    for (const msg of messages) {
      expect(msg).not.toMatch(/If a number or a detail is in the way/i);
    }
  });

  it("no accusatory or guilt-trip phrasing slips through", () => {
    const ACCUSATORY = [
      /are you ignoring/i,
      /why haven'?t you/i,
      /you never replied/i,
      /you'?ve been silent/i,
      /are you blowing me off/i,
      /are you ghosting/i,
      /haven'?t heard back/i,
      /haven'?t responded/i,
      /still waiting/i,
    ];
    for (const msg of messages) {
      for (const pat of ACCUSATORY) {
        expect(msg).not.toMatch(pat);
      }
    }
  });

  it("no banned phrasing or psychology jargon leaks into a variant body", () => {
    // Mirrors the message-engine's own forbidden list at the variant layer
    // so a future addition can't reintroduce them.
    const BANNED = [
      /just checking in/i,
      /touching base/i,
      /circling back/i,
      /\bAI\b/,
      /\bCRM\b/,
      /discount/i,
      /urgent/i,
      /last chance/i,
      /loss aversion/i,
      /reactance/i,
      /scarcity makes you the prize/i,
    ];
    for (const msg of messages) {
      for (const pat of BANNED) {
        expect(msg).not.toMatch(pat);
      }
      // No exclamation marks; the message engine validator already forbids
      // them but pin it here at the variant layer too.
      expect(msg).not.toMatch(/!/);
    }
  });
});

// ---------------------------------------------------------------------------
// Length cap + per-followup validation remain intact for every variant
// ---------------------------------------------------------------------------

describe("every variant stays within length limits and still validates", () => {
  it("every rendered message is ≤ MAX_MESSAGE_CHARS", () => {
    for (const msg of everyMessage()) {
      expect(msg.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    }
  });

  it("every variant on every day still passes validateMessage for every trade", () => {
    const DAY_TO_FOLLOWUP: Record<
      1 | 5 | 10 | 14 | 21 | 60,
      1 | 2 | 3 | 4 | 5 | 6
    > = {
      1: 1,
      5: 2,
      10: 3,
      14: 4,
      21: 5,
      60: 6,
    };
    for (const day of [1, 5, 10, 14, 21, 60] as const) {
      const followupNumber = DAY_TO_FOLLOWUP[day];
      for (const trade of TRADES) {
        for (const name of NAMES) {
          for (const builder of SEQUENCE_VARIANTS[day]) {
            const msg = builder(varsFor(name, trade));
            const res = validateMessage(msg, {
              firstName: name,
              trade,
              followupNumber,
            });
            expect(res.reasons).toEqual([]);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Specific replacements stick
// ---------------------------------------------------------------------------

describe("the specific tone-pass replacements are present in the variant set", () => {
  const sampleVars = varsFor("Jane", "Roofing");

  it("Day 1 v4 reads as a plain contractor ask", () => {
    const msg = SEQUENCE_VARIANTS[1][3](sampleVars);
    expect(msg).toMatch(/Which part .*scope, timing, or price\?/);
    expect(msg).not.toMatch(/in the way/i);
  });

  it("Day 5 keeps the shame-free no option", () => {
    const msg = SEQUENCE_VARIANTS[5][0](sampleVars);
    expect(msg).toContain("If it's a pass, 'no' works too.");
    expect(msg).not.toMatch(/Have you given up on/i);
  });
});
