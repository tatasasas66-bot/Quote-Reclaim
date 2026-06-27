import { describe, expect, it } from "vitest";
import { fallbackMessages, researchSequenceMessages } from "@/lib/ai/fallback-messages";
import {
  MAX_MESSAGE_CHARS,
  validateMessage,
} from "@/lib/ai/validate-message";
import {
  getRecommendedMessage,
  getSequenceFamily,
} from "@/lib/recovery/recovery-logic";

describe("recovery fallback contract", () => {
  const context = {
    firstName: "Jane",
    contractorFirstName: "Mike",
    trade: "Roofing",
    estimateAmount: 8500,
    jobDescription: "Re-roof main house",
  };

  it("persists five deterministic messages in sequence order", () => {
    const plan = fallbackMessages(context);
    expect(plan.map((item) => item.followup_number)).toEqual([1, 2, 3, 4, 5]);
    expect(plan.map((item) => item.message)).toEqual(
      ([1, 2, 3, 4, 5] as const).map((step) =>
        getRecommendedMessage(getSequenceFamily(step), context),
      ),
    );
  });

  it("matches the public researchSequenceMessages adapter", () => {
    expect(fallbackMessages(context).map((item) => item.message)).toEqual(
      Object.values(researchSequenceMessages(context)),
    );
  });

  it("stays within the approved SMS ceiling and passes safety validation", () => {
    for (const item of fallbackMessages(context)) {
      expect(item.message.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
      expect(
        validateMessage(item.message, {
          firstName: context.firstName,
          trade: context.trade,
          followupNumber: item.followup_number,
        }).reasons,
      ).not.toContain("contains a banned phrase");
    }
  });

  it("uses estimate and 'there' fallbacks without inventing identity", () => {
    const sequence = researchSequenceMessages({
      firstName: "",
      contractorFirstName: null,
      trade: "Other",
      estimateAmount: 1000,
    });
    expect(sequence.day1.startsWith("Hi there")).toBe(true);
    expect(Object.values(sequence).every((message) => message.includes("estimate"))).toBe(true);
  });
});
