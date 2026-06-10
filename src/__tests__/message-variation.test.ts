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
const DAY_TO_FOLLOWUP: Record<1 | 3 | 7 | 14 | 30, 1 | 2 | 3 | 4 | 5> = {
  1: 1,
  3: 2,
  7: 3,
  14: 4,
  30: 5,
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
    for (const day of [1, 3, 7, 14, 30] as const) {
      const a = pickVariant(id, day);
      const b = pickVariant(id, day);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(3);
    }
  });

  it("returns 0 (canonical template) for an empty/missing seed", () => {
    expect(pickVariant("", 1)).toBe(0);
    expect(pickVariant("", 3)).toBe(0);
    expect(pickVariant("", 7)).toBe(0);
    expect(pickVariant(null, 1)).toBe(0);
    expect(pickVariant(undefined, 7)).toBe(0);
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
    // firstName falls back to "there"; trade falls back to "the estimate".
    expect(seq.day1).toBe(
      "Hey there — Contractor here. I looked back over the estimate. Was there a number, timing question, or detail you wanted me to break down?",
    );
    expect(seq.day3.startsWith("there,")).toBe(true);
    expect(seq.day7).toMatch(/^Should I keep /);
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

  it("different quoteIds can produce different phrasings (anti-repetition across customers)", () => {
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
        a.day3 !== b.day3 ||
        a.day7 !== b.day7 ||
        a.day14 !== b.day14 ||
        a.day30 !== b.day30
      ) {
        diverged = true;
        break;
      }
    }
    expect(diverged).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Every variant across the arc passes length / ban / emoji / structure checks.
// Days 1/3/14/30 expose 4 variants; Day 7 carries 5 (calm contractor-native
// close-the-loop asks — the earlier verbatim Voss "Have you given up on…?"
// variant was removed in the message-tone safety pass). Total ≥20 variants
// across the sequence.
// ---------------------------------------------------------------------------

describe("all message variants pass validation", () => {
  for (const day of [1, 3, 7, 14, 30] as const) {
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
            // Day 30 (Final Closeout) is declarative — 0 questions by design.
            const expectedQuestions = day === 30 ? 0 : 1;
            expect((message.match(/\?/g) ?? []).length).toBe(expectedQuestions);
            expect(message).not.toMatch(/\bbid\b/i);
          });
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Cadence: schedule is 1/3/7/14/30 days (5 reminders per sequence)
// ---------------------------------------------------------------------------

describe("schedule is the 5-touch cadence", () => {
  const actionsSrc = readSource("../lib/quotes/actions.ts");
  const detailSrc = readSource("../app/(app)/quotes/[id]/page.tsx");

  it("actions.ts CADENCE_DAYS uses +1/+3/+7/+14/+30", () => {
    expect(actionsSrc).toMatch(
      /CADENCE_DAYS[^=]*=\s*\{\s*1:\s*1,\s*2:\s*3,\s*3:\s*7,\s*4:\s*14,\s*5:\s*30/,
    );
  });

  it("quote detail page CADENCE_DAYS matches", () => {
    expect(detailSrc).toMatch(
      /CADENCE_DAYS[^=]*=\s*\{\s*1:\s*1,\s*2:\s*3,\s*3:\s*7,\s*4:\s*14,\s*5:\s*30/,
    );
  });

  it("createQuoteAction now inserts 5 reminders (not 3) via the shared writer", () => {
    // The 5-step gate moved into the shared recovery-plan writer;
    // createQuoteAction delegates to it and the writer enforces a complete plan.
    expect(actionsSrc).toContain("persistRecoveryPlan");
    const writer = readSource("../lib/quotes/recovery-plan-write.ts");
    expect(writer).toMatch(/chosen\.length\s*!==\s*5/);
  });
});

// ---------------------------------------------------------------------------
// Day 14 — Options Check: phasing/options frame, never discounting
// Day 30 — Final Closeout: respectful, declarative closeout signal
// ---------------------------------------------------------------------------

describe("Day 14 stays on options/phasing (NO price drop) and Day 30 closes out cleanly", () => {
  const day14 = SEQUENCE_VARIANTS[14];
  const day30 = SEQUENCE_VARIANTS[30];
  const sampleVars = makeVars("Jane", "Mike", "Roofing");

  it("Day 14 offers options/walk-through without any discount language", () => {
    for (let i = 0; i < day14.length; i++) {
      const msg = day14[i](sampleVars).toLowerCase();
      // Every variant must explicitly offer a walk-through / options framing.
      expect(
        /walk through|options|lay out|handle it|holding (this|things) up|stuck on/.test(
          msg,
        ),
      ).toBe(true);
      // No discount language whatsoever.
      expect(msg).not.toMatch(/\b(discount|sale|deal|coupon|promo|cheaper)\b/);
      expect(msg).not.toMatch(/\d+\s?%\s?off/);
      expect(msg).not.toMatch(/drop the price|lower the price|price drop/);
    }
  });

  it("Day 30 carries a clear closeout signal (close out / mark closed / step back)", () => {
    for (let i = 0; i < day30.length; i++) {
      const msg = day30[i](sampleVars).toLowerCase();
      expect(
        /close .*out|close out|mark .* closed|step back|going to close/.test(msg),
      ).toBe(true);
    }
  });

  it("Day 30 is declarative (no question mark)", () => {
    for (let i = 0; i < day30.length; i++) {
      expect((day30[i](sampleVars).match(/\?/g) ?? []).length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// v0 of each day is verbatim — AI exact-match gate intact, fresh canonical
// ---------------------------------------------------------------------------

describe("v0 of every day stays verbatim — AI exact-match gate intact", () => {
  const vars = makeVars("Jane", "Mike", "Roofing");

  it("Day 1 v0 is the new contractor-native Estimate Check", () => {
    expect(SEQUENCE_VARIANTS[1][0](vars)).toBe(
      "Hey Jane — Mike here. I looked back over the roofing estimate. Was there a number, timing question, or detail you wanted me to break down?",
    );
  });

  it("Day 3 v0 is the new Schedule Check (no fake slot scarcity)", () => {
    expect(SEQUENCE_VARIANTS[3][0](vars)).toBe(
      "Jane, I'm lining up the roofing schedule. Should I keep your estimate active, or move it off my list?",
    );
  });

  it("Day 7 v0 is the new Close-the-Loop", () => {
    expect(SEQUENCE_VARIANTS[7][0](vars)).toBe(
      "Should I keep the roofing estimate open, or close it out for now? Either way is fine.",
    );
  });

  it("Day 14 v0 is the new Options Check (no discounting)", () => {
    expect(SEQUENCE_VARIANTS[14][0](vars)).toBe(
      "Jane, if the total, timing, or scope on the roofing estimate is what's holding this up, I can walk through options without cutting corners. Worth a look?",
    );
  });

  it("Day 30 v0 is the new Final Closeout", () => {
    expect(SEQUENCE_VARIANTS[30][0](vars)).toBe(
      "Jane, I'll close out the roofing estimate after this. All good either way. If anything changes later, reach out and I'll pick it back up.",
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
      "Estimate Check",
      "Schedule Check",
      "Close-the-Loop",
      "Options Check",
      "Final Closeout",
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
