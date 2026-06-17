/**
 * Silent-quote audit — pure logic.
 *
 * Honest math only: total = sum of what was quoted, priority weighted toward
 * the still-pickable age window, deterministic message. No probability model,
 * no "recoverable revenue". Reuses the dashboard's recoveryScoreForDays band.
 */
import { describe, expect, it } from "vitest";

import {
  buildSignupHref,
  buildWhyNotOthers,
  describeRecoveryWindow,
  NEXT_THREE_MOVES,
  parseDaysSilent,
  parseQuoteAmount,
  reasonForPriority,
  recoveryWindowForDays,
  runSilentQuoteAudit,
  suggestedMessage,
  UTM_KEYS,
} from "../lib/audit/silent-quote-audit";
import { recoveryScoreForDays } from "../lib/quotes/recovery-score";

describe("parseQuoteAmount", () => {
  it("accepts $, commas, and whitespace", () => {
    expect(parseQuoteAmount("$8,500")).toBe(8500);
    expect(parseQuoteAmount("8500")).toBe(8500);
    expect(parseQuoteAmount("8,500.00")).toBe(8500);
    expect(parseQuoteAmount("  4000 ")).toBe(4000);
    expect(parseQuoteAmount("2500.75")).toBe(2500.75);
  });

  it("rejects zero, negative, and garbage", () => {
    expect(parseQuoteAmount("0")).toBeNull();
    expect(parseQuoteAmount("-5")).toBeNull();
    expect(parseQuoteAmount("abc")).toBeNull();
    expect(parseQuoteAmount("")).toBeNull();
    expect(parseQuoteAmount("$")).toBeNull();
    expect(parseQuoteAmount("99999999999")).toBeNull(); // > $10M cap
  });
});

describe("parseDaysSilent", () => {
  it("parses a bare integer, clamped 0-365", () => {
    expect(parseDaysSilent("14")).toBe(14);
    expect(parseDaysSilent("0")).toBe(0);
    expect(parseDaysSilent("999")).toBe(365);
  });

  it("blank/garbage/undefined → null (it is optional)", () => {
    expect(parseDaysSilent("")).toBeNull();
    expect(parseDaysSilent(undefined)).toBeNull();
    expect(parseDaysSilent(null)).toBeNull();
    expect(parseDaysSilent("abc")).toBeNull();
    expect(parseDaysSilent("2 weeks")).toBeNull();
  });
});

describe("runSilentQuoteAudit", () => {
  it("requires at least one valid amount, else a friendly error", () => {
    const r = runSilentQuoteAudit([
      { amountRaw: "" },
      { amountRaw: "abc" },
      { amountRaw: "0" },
    ]);
    expect(r.error).toBe("Enter at least one old quote amount to see your audit.");
    expect(r.totalSilentQuoteValue).toBe(0);
    expect(r.priority).toBeNull();
  });

  it("sums all valid amounts into silent quote value", () => {
    const r = runSilentQuoteAudit([
      { amountRaw: "$2,500" },
      { amountRaw: "4000" },
      { amountRaw: "8,500" },
    ]);
    expect(r.error).toBeNull();
    expect(r.totalSilentQuoteValue).toBe(15000);
    expect(r.quotes).toHaveLength(3);
  });

  it("does not block on 1-2 amounts (third blank)", () => {
    const r = runSilentQuoteAudit([
      { amountRaw: "3000" },
      { amountRaw: "" },
      { amountRaw: "5000" },
    ]);
    expect(r.totalSilentQuoteValue).toBe(8000);
    expect(r.quotes.map((q) => q.index)).toEqual([1, 3]); // 1-based, position-preserving
  });

  it("prioritizes by dollars WEIGHTED toward the still-pickable window, not raw size", () => {
    // $8,500 is the biggest but 120 days silent (likely cold); $4,000 at 30
    // days sits in the prime window and should win.
    const r = runSilentQuoteAudit([
      { amountRaw: "2500", daysSilentRaw: "5" }, // 2500 * 0.7  = 1750
      { amountRaw: "4000", daysSilentRaw: "30" }, // 4000 * 1.0 = 4000  ← priority
      { amountRaw: "8500", daysSilentRaw: "120" }, // 8500 * 0.35 = 2975
    ]);
    expect(r.priority?.index).toBe(2);
    expect(r.priority?.amount).toBe(4000);
    expect(r.priorityBandLabel).toBe(recoveryScoreForDays(30).label);
  });

  it("with no days given, ranks by raw amount and shows no band", () => {
    const r = runSilentQuoteAudit([
      { amountRaw: "2500" },
      { amountRaw: "9000" },
      { amountRaw: "4000" },
    ]);
    expect(r.priority?.index).toBe(2);
    expect(r.priority?.amount).toBe(9000);
    expect(r.priorityBandLabel).toBeNull();
  });

  it("attaches the deterministic suggested message for the priority quote's age", () => {
    const prime = runSilentQuoteAudit([{ amountRaw: "4000", daysSilentRaw: "30" }]);
    expect(prime.suggestedMessage).toBe(suggestedMessage(30));
    const cold = runSilentQuoteAudit([{ amountRaw: "4000", daysSilentRaw: "120" }]);
    expect(cold.suggestedMessage).toBe(suggestedMessage(120));
  });
});

describe("reasonForPriority — honest 'why this first' line", () => {
  it("top-value + prime window → the value+timing reason (matches the example card)", () => {
    const quotes = [
      { index: 1, amount: 3800, daysSilent: 21 },
      { index: 2, amount: 1200, daysSilent: 30 },
    ];
    expect(reasonForPriority(quotes[0], quotes)).toMatch(
      /High value and still recent enough/i,
    );
  });

  it("a very fresh quote gets the 'not pushy' reason", () => {
    const q = { index: 1, amount: 4000, daysSilent: 3 };
    expect(reasonForPriority(q, [q]).toLowerCase()).toContain("won't feel pushy");
  });

  it("a cold quote gets the close-it-out-soon reason", () => {
    const q = { index: 1, amount: 4000, daysSilent: 80 };
    expect(reasonForPriority(q, [q]).toLowerCase()).toContain("going cold");
  });

  it("runSilentQuoteAudit returns a non-empty priorityReason for valid input, '' on error", () => {
    expect(runSilentQuoteAudit([{ amountRaw: "5000", daysSilentRaw: "20" }]).priorityReason)
      .not.toBe("");
    expect(runSilentQuoteAudit([{ amountRaw: "" }]).priorityReason).toBe("");
  });
});

describe("suggestedMessage — honest, no weak 'just checking in'", () => {
  it("varies by age band and never says 'just checking in'", () => {
    const fresh = suggestedMessage(3);
    const prime = suggestedMessage(20);
    const cold = suggestedMessage(60);
    for (const m of [fresh, prime, cold]) {
      expect(m.toLowerCase()).not.toContain("just checking in");
      expect(m.toLowerCase()).not.toMatch(/guarantee/);
    }
    // The three bands produce three different messages.
    expect(new Set([fresh, prime, cold]).size).toBe(3);
  });

  it("the cold-quote message uses the takeaway / close-out angle", () => {
    expect(suggestedMessage(60).toLowerCase()).toContain("close out");
  });
});

// ---------------------------------------------------------------------------
// Recovery-window bands — Warm / Cooling / Cold (no percentages)
// ---------------------------------------------------------------------------

describe("recoveryWindowForDays — honest day-band labels", () => {
  it("0-14 days → warm", () => {
    expect(recoveryWindowForDays(0)).toBe("warm");
    expect(recoveryWindowForDays(7)).toBe("warm");
    expect(recoveryWindowForDays(14)).toBe("warm");
  });
  it("15-30 days → cooling", () => {
    expect(recoveryWindowForDays(15)).toBe("cooling");
    expect(recoveryWindowForDays(21)).toBe("cooling");
    expect(recoveryWindowForDays(30)).toBe("cooling");
  });
  it("31+ days → cold", () => {
    expect(recoveryWindowForDays(31)).toBe("cold");
    expect(recoveryWindowForDays(120)).toBe("cold");
  });
  it("null days → unknown", () => {
    expect(recoveryWindowForDays(null)).toBe("unknown");
  });
});

describe("describeRecoveryWindow — labels match the spec", () => {
  it("warm shows 'Follow up while the job is still fresh.'", () => {
    expect(describeRecoveryWindow(7)).toEqual({
      window: "warm",
      label: "Warm",
      explanation: "Follow up while the job is still fresh.",
    });
  });
  it("cooling shows 'Still worth chasing, but do it soon.'", () => {
    expect(describeRecoveryWindow(21)).toEqual({
      window: "cooling",
      label: "Cooling",
      explanation: "Still worth chasing, but do it soon.",
    });
  });
  it("cold shows 'Needs a softer close-the-loop angle.'", () => {
    expect(describeRecoveryWindow(60)).toEqual({
      window: "cold",
      label: "Cold",
      explanation: "Needs a softer close-the-loop angle.",
    });
  });
  it("uses NO percentage / reply-rate language", () => {
    const all = [7, 21, 60, null].map((d) => describeRecoveryWindow(d));
    for (const d of all) {
      expect(d.explanation).not.toMatch(/%/);
      expect(d.explanation.toLowerCase()).not.toMatch(/reply rate|odds|chance/);
    }
  });
});

// ---------------------------------------------------------------------------
// Ranked follow-up order + priority labels
// ---------------------------------------------------------------------------

describe("runSilentQuoteAudit — ranked follow-up order", () => {
  it("includes every entered quote, each with a rank, window, and priority label", () => {
    const r = runSilentQuoteAudit([
      { amountRaw: "2500", daysSilentRaw: "5" },
      { amountRaw: "4000", daysSilentRaw: "21" },
      { amountRaw: "8500", daysSilentRaw: "120" },
    ]);
    expect(r.rankedQuotes).toHaveLength(3);
    expect(r.rankedQuotes.map((q) => q.rank)).toEqual([1, 2, 3]);
    expect(r.rankedQuotes.map((q) => q.priorityLabel)).toEqual([
      "Follow up first",
      "Next backup",
      "Lower priority",
    ]);
    // Each row carries a windowLabel that matches its days.
    expect(r.rankedQuotes[0].windowLabel).toMatch(/Warm|Cooling|Cold/);
  });

  it("ranks consistently with the standalone priority pick", () => {
    const r = runSilentQuoteAudit([
      { amountRaw: "2500", daysSilentRaw: "5" },
      { amountRaw: "4000", daysSilentRaw: "21" },
      { amountRaw: "8500", daysSilentRaw: "120" },
    ]);
    expect(r.rankedQuotes[0].index).toBe(r.priority?.index);
  });

  it("ties break toward bigger dollar amount, then earlier entry — deterministic", () => {
    const r = runSilentQuoteAudit([
      { amountRaw: "5000", daysSilentRaw: "20" },
      { amountRaw: "5000", daysSilentRaw: "20" },
    ]);
    expect(r.rankedQuotes[0].index).toBe(1);
    expect(r.rankedQuotes[1].index).toBe(2);
  });

  it("nextThreeMoves is the fixed 3-step practical plan", () => {
    const r = runSilentQuoteAudit([{ amountRaw: "4000", daysSilentRaw: "20" }]);
    expect(r.nextThreeMoves).toEqual(NEXT_THREE_MOVES);
    expect(NEXT_THREE_MOVES).toEqual([
      "Send this message today.",
      "If there is no reply, follow up again in 3 days.",
      "If it is still silent, close the loop after 7 days.",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Why-not-others — 0-2 short, deterministic insights, references quote NUMBERS
// ---------------------------------------------------------------------------

describe("buildWhyNotOthers", () => {
  function rank(
    inputs: Array<{ amount: number; days: number | null }>,
  ): ReturnType<typeof runSilentQuoteAudit>["rankedQuotes"] {
    return runSilentQuoteAudit(
      inputs.map((i) => ({
        amountRaw: String(i.amount),
        daysSilentRaw: i.days == null ? "" : String(i.days),
      })),
    ).rankedQuotes;
  }

  it("returns [] when there's only one quote", () => {
    expect(buildWhyNotOthers(rank([{ amount: 5000, days: 20 }]))).toEqual([]);
  });

  it("flags 'more money at stake' when #1 is meaningfully bigger than #2", () => {
    const lines = buildWhyNotOthers(
      rank([
        { amount: 8000, days: 20 },
        { amount: 3000, days: 20 },
      ]),
    );
    expect(lines[0]).toMatch(/has more money at stake/);
  });

  it("flags 'more recent but lower value' when #2 is fresher but smaller", () => {
    const lines = buildWhyNotOthers(
      rank([
        { amount: 6000, days: 30 },
        { amount: 5500, days: 5 },
      ]),
    );
    expect(lines[0]).toMatch(/more recent, but lower value/);
  });

  it("returns at most 2 insights, never more (keeps the result skimmable)", () => {
    const lines = buildWhyNotOthers(
      rank([
        { amount: 8000, days: 10 },
        { amount: 3000, days: 5 },
        { amount: 1000, days: 90 },
      ]),
    );
    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it("references quote NUMBERS only — never dollar amounts (focus on the decision)", () => {
    const lines = buildWhyNotOthers(
      rank([
        { amount: 8000, days: 10 },
        { amount: 3000, days: 5 },
      ]),
    );
    for (const line of lines) {
      expect(line).toMatch(/Quote #\d/);
      expect(line).not.toMatch(/\$/);
    }
  });

  it("uses NO fabricated percentages or reply-rate claims", () => {
    const lines = buildWhyNotOthers(
      rank([
        { amount: 8000, days: 60 },
        { amount: 3000, days: 5 },
        { amount: 2000, days: 90 },
      ]),
    );
    for (const line of lines) {
      expect(line).not.toMatch(/%/);
      expect(line.toLowerCase()).not.toMatch(/reply rate|odds|guaranteed/);
    }
  });
});

describe("buildSignupHref — preserves UTMs into the existing auth flow", () => {
  it("defaults next to the existing first-3-free onboarding reveal", () => {
    expect(buildSignupHref("")).toBe("/sign-up?next=%2Fonboarding%2Freveal");
  });

  it("carries every UTM param, drops everything else", () => {
    const href = buildSignupHref(
      "?utm_source=reddit&utm_medium=cpc&utm_campaign=painters&utm_content=ad1&utm_term=silent&foo=bar&fbclid=xyz",
    );
    for (const key of UTM_KEYS) {
      expect(href).toContain(`${key}=`);
    }
    expect(href).not.toContain("foo=bar");
    expect(href).not.toContain("fbclid");
    expect(href).toContain("next=%2Fonboarding%2Freveal");
  });

  it("honors an explicit next override", () => {
    expect(buildSignupHref("", { next: "/dashboard" })).toBe(
      "/sign-up?next=%2Fdashboard",
    );
  });
});
