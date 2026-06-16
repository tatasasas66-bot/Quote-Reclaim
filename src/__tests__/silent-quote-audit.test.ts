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
  parseDaysSilent,
  parseQuoteAmount,
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
