import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SEQUENCE_VARIANTS,
  pickVariant,
  projectLabel,
  researchSequenceMessages,
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

// ---------------------------------------------------------------------------
// pickVariant — deterministic selection
// ---------------------------------------------------------------------------

describe("pickVariant", () => {
  it("is deterministic: same quoteId + day always yields the same index", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    for (const day of [1, 3, 7, 14, 30] as const) {
      const a = pickVariant(id, day);
      const b = pickVariant(id, day);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(3);
    }
  });

  it("returns 0 (canonical template) for an empty/missing quoteId", () => {
    expect(pickVariant("", 1)).toBe(0);
    expect(pickVariant("", 3)).toBe(0);
    expect(pickVariant("", 7)).toBe(0);
    expect(pickVariant(null, 1)).toBe(0);
    expect(pickVariant(undefined, 7)).toBe(0);
  });

  it("spreads different quoteIds across more than one variant", () => {
    const day1 = new Set<number>();
    for (let i = 0; i < 60; i++) {
      day1.add(pickVariant(`quote-${i}-abc`, 1));
    }
    // Anti-repetition: not every quote collapses onto the same phrasing.
    expect(day1.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// researchSequenceMessages — canonical when no quoteId, varied with one
// ---------------------------------------------------------------------------

describe("researchSequenceMessages variant selection", () => {
  it("returns the canonical v1 template when no quoteId is supplied", () => {
    const seq = researchSequenceMessages({
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
    });
    expect(seq.day1).toBe(
      "Hey Jane — Mike here. Looked back at the roofing estimate. Anything on it that didn't make sense, or any number you want me to walk through?",
    );
    expect(seq.day3).toBe(
      "Jane, putting next week's schedule together. Need to know if I'm holding a slot for you or releasing it. What works?",
    );
    expect(seq.day7).toBe(
      "Have you given up on the roofing estimate? If so, I'll close the file — no problem either way. Just need a yes or no so I can clear it from my list.",
    );
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
});

// ---------------------------------------------------------------------------
// All 20 variants (5 days × 4) pass length / ban / emoji / structure checks
// ---------------------------------------------------------------------------

describe("all 20 message variants pass validation", () => {
  for (const day of [1, 3, 7, 14, 30] as const) {
    const builders = SEQUENCE_VARIANTS[day];

    it(`day ${day} exposes exactly 4 variants`, () => {
      expect(builders).toHaveLength(4);
    });

    for (let index = 0; index < builders.length; index++) {
      for (const trade of TRADES) {
        for (const { firstName, contractor } of NAMES) {
          const vars: VariantVars = {
            firstName,
            contractorFirstName: contractor,
            project: projectLabel(trade),
          };
          const message = builders[index](vars);

          it(`day ${day} v${index + 1} — ${trade} / ${firstName} is valid`, () => {
            const result = validateMessage(message, {
              firstName,
              trade,
              followupNumber: DAY_TO_FOLLOWUP[day],
            });
            expect(result.reasons).toEqual([]);
            expect(result.ok).toBe(true);

            // Explicit length / ban / emoji / question-count guarantees.
            expect(message.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
            expect(message).not.toMatch(/!/);
            expect(message).not.toMatch(
              /[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿]/,
            );
            // Day 30 (Final Breakup) is declarative — 0 question marks by design.
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

  it("createQuoteAction now inserts 5 reminders (not 3)", () => {
    expect(actionsSrc).toMatch(/reminderRows\.length\s*===\s*5/);
  });
});

// ---------------------------------------------------------------------------
// Day 14 — Value Re-frame: phasing/scope only, never a discount/% off
// Day 30 — Final Breakup: declarative breakup signal
// ---------------------------------------------------------------------------

describe("Day 14 stays on phasing/scope (NO price drop) and Day 30 is a clean breakup", () => {
  const day14 = SEQUENCE_VARIANTS[14];
  const day30 = SEQUENCE_VARIANTS[30];
  const sampleVars: VariantVars = {
    firstName: "Jane",
    contractorFirstName: "Mike",
    project: projectLabel("Roofing"),
  };

  it("Day 14 contains phasing/scope language and never uses discount/sale/% off", () => {
    for (let i = 0; i < day14.length; i++) {
      const msg = day14[i](sampleVars).toLowerCase();
      // Each variant must mention either phasing or scope — the value re-frame.
      expect(/phase|phased|scope|rework|leaner/.test(msg)).toBe(true);
      // No discount language whatsoever.
      expect(msg).not.toMatch(/\b(discount|sale|deal|coupon|promo)\b/);
      expect(msg).not.toMatch(/\d+\s?%\s?off/);
      expect(msg).not.toMatch(/drop the price|lower the price/);
    }
  });

  it("Day 30 carries a clear breakup signal (closing / won't reach out again)", () => {
    for (let i = 0; i < day30.length; i++) {
      const msg = day30[i](sampleVars).toLowerCase();
      expect(
        /closing|close the file|close .* out|let .* go|won't reach out|wont reach out/.test(
          msg,
        ),
      ).toBe(true);
    }
  });

  it("Day 30 is declarative (no question mark) — that's the takeaway", () => {
    for (let i = 0; i < day30.length; i++) {
      expect((day30[i](sampleVars).match(/\?/g) ?? []).length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Day 1/3/7 variant 0 still equals the canonical text (AI exact-match gate)
// ---------------------------------------------------------------------------

describe("v0 of Day 1/3/7 stays verbatim — AI exact-match gate intact", () => {
  const vars: VariantVars = {
    firstName: "Jane",
    contractorFirstName: "Mike",
    project: projectLabel("Roofing"),
  };

  it("Day 1 v0 is the canonical Pattern Interrupt", () => {
    expect(SEQUENCE_VARIANTS[1][0](vars)).toBe(
      "Hey Jane — Mike here. Looked back at the roofing estimate. Anything on it that didn't make sense, or any number you want me to walk through?",
    );
  });

  it("Day 3 v0 is the canonical Authority Frame", () => {
    expect(SEQUENCE_VARIANTS[3][0](vars)).toBe(
      "Jane, putting next week's schedule together. Need to know if I'm holding a slot for you or releasing it. What works?",
    );
  });

  it("Day 7 v0 is the canonical Voss Takeaway", () => {
    expect(SEQUENCE_VARIANTS[7][0](vars)).toBe(
      "Have you given up on the roofing estimate? If so, I'll close the file — no problem either way. Just need a yes or no so I can clear it from my list.",
    );
  });
});

// ---------------------------------------------------------------------------
// B2 — system prompt carries the variation instruction
// ---------------------------------------------------------------------------

describe("generate-recovery-plan system prompt (B2)", () => {
  it("instructs the model to vary phrasing while preserving the frame", () => {
    expect(generatePlan).toContain("Generate a DIFFERENT phrasing each time");
    expect(generatePlan).toContain(
      "Never reuse the exact same sentence across clients",
    );
    expect(generatePlan).toMatch(/Vary verbs, sentence structure, and opening/);
  });

  it("RecoveryContext threads an optional quoteId for variant seeding", () => {
    expect(generatePlan).toMatch(/quoteId\?:\s*string\s*\|\s*null/);
  });
});
