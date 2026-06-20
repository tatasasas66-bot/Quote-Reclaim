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
    label: "Concrete",
    ctx: { firstName: "Karen", contractorFirstName: "Will", trade: "Concrete", estimateAmount: 4800 },
    expectedFirstName: "Karen",
  },
  {
    label: "Other",
    ctx: { firstName: "Robin", contractorFirstName: "Sam", trade: "Other", estimateAmount: 1500 },
    expectedFirstName: "Robin",
  },
];

describe("contractor-native sequence structural rules", () => {
  for (const { label, ctx, expectedFirstName } of SCENARIOS) {
    describe(label, () => {
      const seq = researchSequenceMessages(ctx);
      const allMessages = [seq.day1, seq.day3, seq.day7, seq.day14, seq.day30];

      it("Day 1 opens with 'Hey {Name} —' or 'Hey {Name},' (the only Hey in the sequence)", () => {
        // Either separator is valid — both are natural contractor openings and
        // the rewrite uses both for variation across quotes.
        const opensCorrectly =
          new RegExp(`^Hey ${expectedFirstName} —`).test(seq.day1) ||
          new RegExp(`^Hey ${expectedFirstName},`).test(seq.day1);
        expect(opensCorrectly).toBe(true);
        // Only Day 1 uses "Hey" — the rest of the sequence drops it.
        expect(seq.day3).not.toMatch(/\bHey\b/i);
        expect(seq.day7).not.toMatch(/\bHey\b/i);
        expect(seq.day14).not.toMatch(/\bHey\b/i);
        expect(seq.day30).not.toMatch(/\bHey\b/i);
      });

      it("Day 3 starts with the client name only — no greeting word", () => {
        expect(seq.day3).toMatch(new RegExp(`^${expectedFirstName},`));
        expect(seq.day3).not.toMatch(/^(Hi|Hey)\b/i);
      });

      it("Day 7 omits the client name and never opens with a greeting", () => {
        expect(seq.day7).not.toContain(expectedFirstName);
        expect(seq.day7).not.toMatch(/^(Hi|Hey)\b/i);
      });

      it("Day 7 is a Scope Rescue ask: smaller path, no pressure", () => {
        expect(seq.day7).toMatch(
          /separate|break it into|phase|must-do|later pieces|holding things up|simpler path|not quite right/i,
        );
        expect(seq.day7).not.toMatch(/\b(discount|sale|deal|cheaper|coupon|promo)\b/i);
      });

      it("Day 14 leads with the client name and offers options without any discount language", () => {
        expect(seq.day14).toMatch(new RegExp(`^${expectedFirstName},`));
        expect(seq.day14.toLowerCase()).not.toMatch(
          /\b(discount|sale|deal|cheaper|coupon|promo)\b/,
        );
        expect(seq.day14).not.toMatch(/drop the price|lower the price|price drop/i);
      });

      it("Day 30 leads with the client name, is declarative (no '?'), and closes out cleanly", () => {
        expect(seq.day30).toMatch(new RegExp(`^${expectedFirstName},`));
        expect((seq.day30.match(/\?/g) ?? []).length).toBe(0);
        expect(seq.day30.toLowerCase()).toMatch(
          /close .*out|close out|mark .* closed|step back|going to close/,
        );
      });

      it("no message contains a banned phrase from the rewrite contract", () => {
        for (const msg of allMessages) {
          const lower = msg.toLowerCase();
          expect(lower).not.toContain("just checking");
          expect(lower).not.toContain("touching base");
          expect(lower).not.toContain("circling back");
          expect(lower).not.toContain("circle back");
          expect(lower).not.toContain("hope this finds you well");
          expect(lower).not.toContain("dead or just on pause");
          expect(lower).not.toContain("just need one word");
          expect(lower).not.toContain("locking the schedule today");
          expect(lower).not.toContain("releasing it");
          expect(lower).not.toContain("let the slot go");
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
        if (ctx.firstName !== expectedFirstName) {
          expect(seq.day1).not.toContain(ctx.firstName);
          expect(seq.day3).not.toContain(ctx.firstName);
        }
      });
    });
  }
});
