import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SEQUENCE_VARIANTS,
  pickVariant,
  projectLabel,
  tradeWord,
  researchSequenceMessages,
  variantSeed,
  type VariantVars,
} from "@/lib/ai/fallback-messages";
import { validateMessage, MAX_MESSAGE_CHARS } from "@/lib/ai/validate-message";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const generatePlan = readSource("../lib/ai/generate-recovery-plan.ts");

const TRADES = [
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

const NAMES: Array<{ firstName: string; contractor: string }> = [
  { firstName: "Jane", contractor: "Mike" },
  { firstName: "Tom", contractor: "Luis" },
  { firstName: "Amanda", contractor: "Pat" },
];

// followupNumber the validator expects for each calendar day.
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

function makeVars(firstName: string, contractor: string, trade: string): VariantVars {
  const project = projectLabel(trade);
  return {
    firstName,
    contractorFirstName: contractor,
    project,
    // No-detail path: projectDetail === project. The detail-injection path is
    // covered separately via researchSequenceMessages with a jobDescription.
    projectDetail: project,
    tradeWord: tradeWord(trade),
  };
}

// ---------------------------------------------------------------------------
// pickVariant — deterministic selection
// ---------------------------------------------------------------------------

describe("pickVariant", () => {
  it("is deterministic: same seed + day always yields the same index", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    for (const day of [1, 5, 10, 14, 21, 60] as const) {
      const a = pickVariant(id, day);
      const b = pickVariant(id, day);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(3);
    }
  });

  it("returns 0 (canonical template) for an empty/missing seed", () => {
    expect(pickVariant("", 1)).toBe(0);
    expect(pickVariant("", 5)).toBe(0);
    expect(pickVariant("", 10)).toBe(0);
    expect(pickVariant(null, 1)).toBe(0);
    expect(pickVariant(undefined, 60)).toBe(0);
  });

  it("spreads different seeds across more than one variant", () => {
    const day1 = new Set<number>();
    for (let i = 0; i < 60; i++) {
      day1.add(pickVariant(`quote-${i}-abc`, 1));
    }
    expect(day1.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// variantSeed — quoteId-first, then client/trade/amount/daysSilent composite
// ---------------------------------------------------------------------------

describe("variantSeed", () => {
  it("uses quoteId verbatim when present", () => {
    expect(
      variantSeed({
        firstName: "Jane",
        trade: "Roofing",
        estimateAmount: 8500,
        quoteId: "abc-123",
      }),
    ).toBe("abc-123");
  });

  it("falls back to clientName|trade|amount|daysSilent when quoteId is absent", () => {
    expect(
      variantSeed({
        firstName: "Jane",
        trade: "Roofing",
        estimateAmount: 8500,
        daysSilent: 3,
      }),
    ).toBe("Jane|Roofing|8500|3");
  });

  it("is stable: same composite inputs always produce the same seed", () => {
    const a = variantSeed({
      firstName: "Jane",
      trade: "Roofing",
      estimateAmount: 8500,
      daysSilent: 3,
    });
    const b = variantSeed({
      firstName: "Jane",
      trade: "Roofing",
      estimateAmount: 8500,
      daysSilent: 3,
    });
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// researchSequenceMessages — canonical when no seed, varied with one
// ---------------------------------------------------------------------------

describe("researchSequenceMessages variant selection", () => {
  it("renders the new canonical v0 sequence when called with an empty seed (no quoteId, no other fields)", () => {
    // Only when ALL seed inputs are empty does variantSeed fall back to "" → v0.
    // This is the path the dedicated "v0 of every day stays verbatim" block
    // exercises against SEQUENCE_VARIANTS[N][0] directly. Same expected output,
    // routed through the higher-level researchSequenceMessages function.
    const seq = researchSequenceMessages({
      firstName: "",
      contractorFirstName: "",
      trade: "",
      estimateAmount: 0,
    });
    expect(seq.day1).toBe(
      "Any question on the estimate I can clear up? Scope, timing, or price — reply with which one.",
    );
    expect(seq.day1).not.toContain("Contractor here");
    expect(seq.day5.startsWith("Hi there")).toBe(true);
    expect(seq.day10).toMatch(/^Should I keep /);
    expect(seq.day60).toContain("60 seconds");
  });

  it("is stable for a given quoteId across repeated calls", () => {
    const base = {
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
      quoteId: "abc-123-def-456",
    };
    expect(researchSequenceMessages(base)).toEqual(researchSequenceMessages(base));
  });

  it("different quoteIds preserve the single approved phrasing", () => {
    const a = researchSequenceMessages({
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
      quoteId: "quote-a-aaa",
    });
    // Use a handful of seeds to virtually guarantee at least one Day differs.
    const seeds = ["quote-b-bbb", "quote-c-ccc", "quote-d-ddd", "quote-e-eee"];
    let diverged = false;
    for (const seed of seeds) {
      const b = researchSequenceMessages({
        firstName: "Jane",
        contractorFirstName: "Mike",
        trade: "Roofing",
        estimateAmount: 8500,
        quoteId: seed,
      });
      if (
        a.day1 !== b.day1 ||
        a.day5 !== b.day5 ||
        a.day10 !== b.day10 ||
        a.day14 !== b.day14 ||
        a.day21 !== b.day21 ||
        a.day60 !== b.day60
      ) {
        diverged = true;
        break;
      }
    }
    expect(diverged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Every variant across the arc passes length / ban / emoji / structure checks.
// Every scheduled day exposes at least four contractor-native variants.
// ---------------------------------------------------------------------------

describe("all message variants pass validation", () => {
  for (const day of [1, 5, 10, 14, 21, 60] as const) {
    const builders = SEQUENCE_VARIANTS[day];

    it(`day ${day} exposes at least 4 variants`, () => {
      expect(builders.length).toBeGreaterThanOrEqual(4);
    });

    for (let index = 0; index < builders.length; index++) {
      for (const trade of TRADES) {
        for (const { firstName, contractor } of NAMES) {
          const vars = makeVars(firstName, contractor, trade);
          const message = builders[index](vars);

          it(`day ${day} v${index + 1} — ${trade} / ${firstName} is valid`, () => {
            const result = validateMessage(message, {
              firstName,
              trade,
              followupNumber: DAY_TO_FOLLOWUP[day],
            });
            expect(result.reasons).toEqual([]);
            expect(result.ok).toBe(true);

            expect(message.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
            expect(message).not.toMatch(/!/);
            expect(message).not.toMatch(
              /[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿]/,
            );
            const questionCount = (message.match(/\?/g) ?? []).length;
            if (day === 21 || day === 60) {
              expect(questionCount).toBe(0);
            } else {
              expect(questionCount).toBeLessThanOrEqual(1);
            }
            expect(message).not.toMatch(/\bbid\b/i);
          });
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Cadence: schedule is 1/5/10/14/21/60 days.
// ---------------------------------------------------------------------------

describe("schedule is the 6-touch cadence", () => {
  const actionsSrc = readSource("../lib/quotes/actions.ts");
  const recoveryLogicSrc = readSource("../lib/recovery/recovery-logic.ts");

  it("actions.ts uses the centralized cadence", () => {
    expect(actionsSrc).toMatch(
      /CADENCE_DAYS/,
    );
  });

  it("the shared recovery logic owns the quote-detail cadence", () => {
    expect(recoveryLogicSrc).toMatch(/CADENCE_DAYS/);
  });

  it("createQuoteAction inserts 6 reminders via the shared writer", () => {
    // The 6-step gate lives in the shared recovery-plan writer;
    // createQuoteAction delegates to it and the writer enforces a complete plan.
    expect(actionsSrc).toContain("persistRecoveryPlan");
    const writer = readSource("../lib/quotes/recovery-plan-write.ts");
    expect(writer).toMatch(/chosen\.length\s*!==\s*6/);
  });
});

// ---------------------------------------------------------------------------
// Day 14 — Open, Revise, or Close: active / paused / closed, never discounting
// Day 21 — Clean Closeout: respectful, declarative closeout signal
// ---------------------------------------------------------------------------

describe("Day 14 stays on open/revise/close decisions and Day 21 closes cleanly", () => {
  const day14 = SEQUENCE_VARIANTS[14];
  const day21 = SEQUENCE_VARIANTS[21];
  const sampleVars = makeVars("Jane", "Mike", "Roofing");

  it("Day 14 offers a clear decision without any discount language", () => {
    for (let i = 0; i < day14.length; i++) {
      const msg = day14[i](sampleVars).toLowerCase();
      // Every variant must explicitly give a decision path.
      expect(
        /active|pause|paused|close|closed|board|worth discussing|walk through/.test(
          msg,
        ),
      ).toBe(true);
      // No discount language whatsoever.
      expect(msg).not.toMatch(/\b(discount|sale|deal|coupon|promo|cheaper)\b/);
      expect(msg).not.toMatch(/\d+\s?%\s?off/);
      expect(msg).not.toMatch(/drop the price|lower the price|price drop/);
    }
  });

  it("Day 21 carries a clear closeout signal", () => {
    for (let i = 0; i < day21.length; i++) {
      const msg = day21[i](sampleVars).toLowerCase();
      expect(
        /close .*out|close out|mark .* closed|closing|leave .* closed/.test(msg),
      ).toBe(true);
    }
  });

  it("Day 21 is declarative (no question mark)", () => {
    for (let i = 0; i < day21.length; i++) {
      expect((day21[i](sampleVars).match(/\?/g) ?? []).length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// v0 of each day is verbatim — AI exact-match gate intact, fresh canonical
// ---------------------------------------------------------------------------

describe("v0 of every day stays verbatim — AI exact-match gate intact", () => {
  const vars = makeVars("Jane", "Mike", "Roofing");

  it("Day 1 v0 is the warm decision-friction check", () => {
    expect(SEQUENCE_VARIANTS[1][0](vars)).toBe(
      "Any question on the roofing estimate I can clear up? Scope, timing, or price — reply with which one.",
    );
  });

  it("Day 5 v0 gives a shame-free scope rescue", () => {
    expect(SEQUENCE_VARIANTS[5][0](vars)).toBe(
      "Hi Jane — no pressure on the roofing estimate. If it's timing, budget, or scope, reply with which one and I'll sharpen it. If it's a pass, 'no' works too.",
    );
  });

  it("Day 10 v0 is the soft decision check", () => {
    expect(SEQUENCE_VARIANTS[10][0](vars)).toBe(
      "Should I keep the roofing estimate on my active list, or close it out? Either is fine — just tell me which.",
    );
  });

  it("Day 14 v0 is the new Open, Revise, or Close (no discounting)", () => {
    expect(SEQUENCE_VARIANTS[14][0](vars)).toBe(
      "I can keep the roofing estimate open, revise it, or close it out. Which helps most?",
    );
  });

  it("Day 21 v0 is the Clean Closeout", () => {
    expect(SEQUENCE_VARIANTS[21][0](vars)).toBe(
      "I'll close out the roofing estimate on my side so it's off your plate. If the timing changes later, text me here and I'll send a fresh number — no re-quote needed.",
    );
  });

  it("Day 60 v0 is the one-time reopen-later touch", () => {
    expect(SEQUENCE_VARIANTS[60][0](vars)).toBe(
      "Saw the roofing estimate from a while back. If the timing is better now, I can send a fresh number in 60 seconds. If not, no worries — I'll leave it closed.",
    );
  });
});

// ---------------------------------------------------------------------------
// AI prompt now carries the contractor-native rules and the new framework
// labels (not the old psychology jargon).
// ---------------------------------------------------------------------------

describe("generate-recovery-plan system prompt enforces the contractor-native rewrite", () => {
  it("instructs the model to vary phrasing while preserving each day's intent", () => {
    expect(generatePlan).toMatch(/Vary phrasing across different quotes/);
    expect(generatePlan).toMatch(/Same quote always renders the same message/);
  });

  it("uses the new framework labels in the JSON example", () => {
    for (const label of [
      "Decision Friction",
      "Scope Rescue",
      "Soft Decision Check",
      "Open, Revise, or Close",
      "Clean Closeout",
      "Reopen Later",
    ]) {
      expect(generatePlan).toContain(label);
    }
  });

  it("no longer surfaces the old psychology labels to the AI", () => {
    expect(generatePlan).not.toContain("Casual Pattern Interrupt");
    expect(generatePlan).not.toContain("Authority & Status Squeeze");
    expect(generatePlan).not.toContain("Professional Closeout");
    expect(generatePlan).not.toContain("Value Re-frame");
    expect(generatePlan).not.toContain("Final Breakup");
  });

  it("explicitly forbids the contractor-vocabulary banned phrases in the prompt", () => {
    for (const phrase of [
      "dead or just on pause",
      "locking the schedule today",
      "releasing it",
      "let the slot go",
      "loss aversion",
      "reactance",
      "squeeze",
      "breakup",
      "discount",
      "cheaper",
      "guaranteed",
      "last chance",
      "final notice",
      "CRM",
      "workflow",
    ]) {
      expect(generatePlan).toContain(phrase);
    }
  });

  it("RecoveryContext threads an optional quoteId for variant seeding", () => {
    expect(generatePlan).toMatch(/quoteId\?:\s*string\s*\|\s*null/);
  });
});
