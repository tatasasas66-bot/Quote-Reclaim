import { describe, expect, it } from "vitest";
import { researchSequenceMessages } from "@/lib/ai/fallback-messages";
import type { RecoveryContext } from "@/lib/ai/generate-recovery-plan";

const EMOJI_REGEX = /[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿]/;

const SCENARIOS: Array<{
  label: string;
  ctx: RecoveryContext;
  expectedFirstName: string;
}> = [
  {
    label: "HVAC — lowercase first name",
    ctx: { firstName: "jane", contractorFirstName: "Aaron", trade: "HVAC", estimateAmount: 7900 },
    expectedFirstName: "Jane",
  },
  {
    label: "Roofing — uppercase first name",
    ctx: { firstName: "SARAH", contractorFirstName: "Mike", trade: "Roofing", estimateAmount: 8500 },
    expectedFirstName: "Sarah",
  },
  {
    label: "Plumbing — normal name",
    ctx: { firstName: "Tom", contractorFirstName: "Luis", trade: "Plumbing", estimateAmount: 2400 },
    expectedFirstName: "Tom",
  },
  {
    label: "Remodeling — null contractor name",
    ctx: { firstName: "David", contractorFirstName: null, trade: "Remodeling", estimateAmount: 18000 },
    expectedFirstName: "David",
  },
  {
    label: "General Contracting",
    ctx: { firstName: "Amanda", contractorFirstName: "Pat", trade: "General Contracting", estimateAmount: 12500 },
    expectedFirstName: "Amanda",
  },
  {
    label: "Painting",
    ctx: { firstName: "Lisa", contractorFirstName: "Dan", trade: "Painting", estimateAmount: 3800 },
    expectedFirstName: "Lisa",
  },
  {
    label: "Landscaping",
    ctx: { firstName: "Chris", contractorFirstName: "Ben", trade: "Landscaping", estimateAmount: 5200 },
    expectedFirstName: "Chris",
  },
  {
    label: "Other",
    ctx: { firstName: "Robin", contractorFirstName: "Sam", trade: "Other", estimateAmount: 1500 },
    expectedFirstName: "Robin",
  },
];

describe("research-backed sequence structural rules", () => {
  for (const { label, ctx, expectedFirstName } of SCENARIOS) {
    describe(label, () => {
      const seq = researchSequenceMessages(ctx);
      const allMessages = [seq.day1, seq.day3, seq.day7];

      it("Day 1 contains 'Hey {name}' — the only Hey in the sequence", () => {
        expect(seq.day1).toMatch(new RegExp(`^Hey ${expectedFirstName} —`));
        expect(seq.day3).not.toMatch(/\bHey\b/i);
        expect(seq.day7).not.toMatch(/\bHey\b/i);
      });

      it("Day 3 starts with name only — no greeting word", () => {
        expect(seq.day3).toMatch(new RegExp(`^${expectedFirstName},`));
        expect(seq.day3).not.toMatch(/^(Hi|Hey)\b/i);
      });

      it("Day 7 contains no name — zero emotion", () => {
        expect(seq.day7).not.toContain(expectedFirstName);
        expect(seq.day7).not.toMatch(/^(Hi|Hey)\b/i);
      });

      it("Day 7 uses Voss takeaway structure", () => {
        expect(seq.day7).toMatch(/Have you given up/i);
        expect(seq.day7).toContain("close the file");
      });

      it("no message contains banned soft phrases", () => {
        for (const msg of allMessages) {
          const lower = msg.toLowerCase();
          expect(lower).not.toContain("just checking");
          expect(lower).not.toContain("hope");
          expect(lower).not.toContain("circling back");
        }
      });

      it("no message exceeds 220 characters", () => {
        for (const msg of allMessages) {
          expect(msg.length).toBeLessThanOrEqual(220);
        }
      });

      it("no message contains an exclamation mark", () => {
        for (const msg of allMessages) {
          expect(msg).not.toContain("!");
        }
      });

      it("no message contains emoji", () => {
        for (const msg of allMessages) {
          expect(EMOJI_REGEX.test(msg)).toBe(false);
        }
      });

      it("client name is title-cased in Day 1 and Day 3", () => {
        expect(seq.day1).toContain(expectedFirstName);
        expect(seq.day3).toContain(expectedFirstName);
        // Verify the raw all-caps version is NOT present when input was all-caps
        if (ctx.firstName !== expectedFirstName) {
          expect(seq.day1).not.toContain(ctx.firstName);
          expect(seq.day3).not.toContain(ctx.firstName);
        }
      });
    });
  }
});
