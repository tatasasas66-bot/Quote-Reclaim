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
const DAY_TO_FOLLOWUP: Record<1 | 3 | 7, 1 | 2 | 3> = { 1: 1, 3: 2, 7: 3 };

// ---------------------------------------------------------------------------
// pickVariant — deterministic selection
// ---------------------------------------------------------------------------

describe("pickVariant", () => {
  it("is deterministic: same quoteId + day always yields the same index", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    for (const day of [1, 3, 7] as const) {
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
// All 12 variants (3 days × 4) pass length / ban / emoji / structure checks
// ---------------------------------------------------------------------------

describe("all 12 message variants pass validation", () => {
  for (const day of [1, 3, 7] as const) {
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

            // Explicit length / ban / emoji / single-question guarantees.
            expect(message.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
            expect(message).not.toMatch(/!/);
            expect(message).not.toMatch(
              /[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿]/,
            );
            expect((message.match(/\?/g) ?? []).length).toBe(1);
            expect(message).not.toMatch(/\bbid\b/i);
          });
        }
      }
    }
  }
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
