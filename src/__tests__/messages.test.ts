import { describe, expect, it } from "vitest";
import {
  getProjectNoun,
  getRecommendedMessage,
  getReplyPlaybook,
  getSequenceFamily,
} from "@/lib/recovery/recovery-logic";
import { researchSequenceMessages } from "@/lib/ai/fallback-messages";

const TRADE_NOUNS = [
  ["Concrete", "driveway"],
  ["Roofing", "roof"],
  ["HVAC", "system"],
  ["Plumbing", "job"],
  ["Electrical", "work"],
  ["Remodeling", "project"],
  ["General Contracting", "project"],
  ["Painting", "project"],
  ["Landscaping", "project"],
  ["Fencing", "fence"],
  ["Flooring", "floor"],
  ["Windows & Doors", "install"],
  ["Siding", "siding"],
  ["Drywall", "work"],
  ["Tree Service", "removal"],
  ["Other", "estimate"],
] as const;

describe("unified recovery message library", () => {
  it.each(TRADE_NOUNS)("maps %s to %s", (trade, noun) => {
    expect(getProjectNoun(trade)).toBe(noun);
  });

  it("uses the exact five centralized messages for fallback schedules", () => {
    const context = { firstName: "Jane", trade: "Concrete", estimateAmount: 9000 };
    const sequence = researchSequenceMessages(context);
    expect(Object.values(sequence)).toEqual(
      ([1, 2, 3, 4, 5] as const).map((step) =>
        getRecommendedMessage(getSequenceFamily(step), context),
      ),
    );
  });

  it("keeps the required shame-removal closes verbatim", () => {
    expect(
      getRecommendedMessage("Decision Friction", {
        firstName: "Jane",
        trade: "Concrete",
      }),
    ).toContain("no awkward follow-up from me");
    expect(
      getRecommendedMessage("Clean Closeout", {
        firstName: "Jane",
        trade: "Concrete",
      }),
    ).toContain("no restart, no re-quote, no awkward conversation");
  });

  it("contains no generic 'this estimate' message", () => {
    for (const trade of TRADE_NOUNS.slice(0, -1).map(([name]) => name)) {
      for (const step of [1, 2, 3, 4, 5] as const) {
        expect(
          getRecommendedMessage(getSequenceFamily(step), {
            firstName: "Jane",
            trade,
          }).toLowerCase(),
        ).not.toContain("this estimate");
      }
    }
  });

  it("ships financing and margin-protection branches for quotes over $5k", () => {
    const paths = getReplyPlaybook("Concrete", 9000);
    expect(paths).toHaveLength(10);
    expect(paths.find((path) => path.id === "still_comparing")?.response).toContain(
      "did anyone trim it to come in lower",
    );
    expect(paths.find((path) => path.id === "financing")?.response).toContain(
      "milestone payments",
    );
    expect(paths.find((path) => path.id === "do_it_for_less")?.response).toContain(
      "I can't cut the price without cutting the work",
    );
  });
});
