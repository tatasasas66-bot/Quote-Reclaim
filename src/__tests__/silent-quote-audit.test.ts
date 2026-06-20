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

  it("also accepts the user-typed 'days' suffix from the placeholder", () => {
    expect(parseDaysSilent("14 days")).toBe(14);
    expect(parseDaysSilent("1 day")).toBe(1);
    expect(parseDaysSilent("22 DAYS")).toBe(22);
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
    expect(r.error).toBe("Enter an estimate amount.");
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
      { amountRaw: "2500", daysSilentRaw: "5" }, // 2500 * 0.9  = 2250
      { amountRaw: "4000", daysSilentRaw: "30" }, // 4000 * 1.0 = 4000  ← priority
      { amountRaw: "8500", daysSilentRaw: "120" }, // 8500 * 0.35 = 2975
    ]);
    expect(r.priority?.index).toBe(2);
    expect(r.priority?.amount).toBe(4000);
    expect(r.priorityBandLabel).toBe(recoveryScoreForDays(30).label);
  });

  // ---------------------------------------------------------------------------
  // Regression: the fresh-penalty bug that let a $5K prime quote beat a $7K
  // fresh quote by 100 points and then mislabel the bigger quote as "lower
  // value". The fix uses a 0.9 fresh weight so size dominates timing past
  // ~11% bigger, and buildWhyNotOthers fact-checks every claim.
  // ---------------------------------------------------------------------------
  it("BUG: 2500/10, 5000/12, 7000/5 → Quote #3 ranks first (size > tiny fresh penalty)", () => {
    const r = runSilentQuoteAudit([
      { amountRaw: "2500", daysSilentRaw: "10" }, // 2500 * 1.0 = 2500
      { amountRaw: "5000", daysSilentRaw: "12" }, // 5000 * 1.0 = 5000
      { amountRaw: "7000", daysSilentRaw: "5" }, //  7000 * 0.9 = 6300  ← priority
    ]);
    expect(r.priority?.index).toBe(3);
    expect(r.priority?.amount).toBe(7000);
    expect(r.priority?.windowLabel).toBe("Warm");
    expect(r.priorityReason).toMatch(/most money at stake/i);
    expect(r.rankedQuotes.map((q) => q.index)).toEqual([3, 2, 1]);
  });

  it("BUG: the why-not-others lines for 2500/10, 5000/12, 7000/5 never call Quote #3 'lower value'", () => {
    const r = runSilentQuoteAudit([
      { amountRaw: "2500", daysSilentRaw: "10" },
      { amountRaw: "5000", daysSilentRaw: "12" },
      { amountRaw: "7000", daysSilentRaw: "5" },
    ]);
    const all = r.whyNotOthers.join(" ");
    // Quote #3 ($7000) is the WINNER. Nothing should make it the SUBJECT of
    // a "lower value" or "more recent but lower value" line.
    expect(all).not.toMatch(/Quote #3 is more recent, but lower value/);
    expect(all).not.toMatch(/Quote #3.*lower value/);
    // Conversely, Quote #2 ($5000) cannot be the SUBJECT of "more money at
    // stake" — that would name the smaller quote as the bigger one.
    expect(all).not.toMatch(/Quote #2 has more money at stake/);
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
    const biggerCold = { index: 2, amount: 6000, daysSilent: 80 };
    expect(reasonForPriority(q, [q, biggerCold]).toLowerCase()).toContain(
      "won't feel pushy",
    );
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
  it("warm shows the direct follow-up definition", () => {
    expect(describeRecoveryWindow(7)).toEqual({
      window: "warm",
      label: "Warm",
      explanation: "Recent enough for a direct, simple follow-up.",
    });
  });
  it("cooling shows the reopen-now definition", () => {
    expect(describeRecoveryWindow(21)).toEqual({
      window: "cooling",
      label: "Cooling",
      explanation: "Worth reopening now before it gets harder to restart.",
    });
  });
  it("cold shows the lighter-check-in definition", () => {
    expect(describeRecoveryWindow(60)).toEqual({
      window: "cold",
      label: "Cold",
      explanation:
        "Use a lighter check-in. Still worth testing, but expect lower response.",
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

  // ---------------------------------------------------------------------------
  // Factual-consistency invariants — copy can NEVER contradict the amounts
  // ---------------------------------------------------------------------------

  // Walks each emitted line and verifies its embedded value claim is true
  // against the ranked list it was generated from. Subject-targeted regexes
  // (no greedy `[\s\S]*?`) so we always validate the actual claim subject,
  // never the leftmost Quote #N that happens to appear in the line.
  function assertFactual(
    lines: string[],
    ranked: ReturnType<typeof rank>,
  ): void {
    const byIndex = new Map(ranked.map((q) => [q.index, q]));
    const first = ranked[0];
    for (const line of lines) {
      // "Quote #X is more recent, but lower value" — X must be genuinely smaller
      // than the priority pick, and X must also be more recent (lower days).
      const lowerValueMatch = /Quote #(\d) is more recent, but lower value/.exec(
        line,
      );
      if (lowerValueMatch) {
        const q = byIndex.get(Number(lowerValueMatch[1]))!;
        expect(q.amount).toBeLessThan(first.amount);
        if (q.daysSilent != null && first.daysSilent != null) {
          expect(q.daysSilent).toBeLessThan(first.daysSilent);
        }
      }
      // "Quote #X has more money at stake" — X must be the priority (winner)
      // AND must be genuinely bigger than the row it's compared to.
      const moneyAtStakeMatch = /Quote #(\d) has more money at stake/.exec(line);
      if (moneyAtStakeMatch) {
        const q = byIndex.get(Number(moneyAtStakeMatch[1]))!;
        expect(q.index).toBe(first.index); // subject is the priority pick
        for (const other of ranked) {
          if (other.index !== q.index) {
            expect(q.amount).toBeGreaterThan(other.amount);
          }
        }
      }
      // "Quote #X is bigger, but it's still fresh" — X must be genuinely
      // bigger than the priority AND very fresh.
      const biggerFreshMatch = /Quote #(\d) is bigger, but it/.exec(line);
      if (biggerFreshMatch) {
        const q = byIndex.get(Number(biggerFreshMatch[1]))!;
        expect(q.amount).toBeGreaterThan(first.amount);
        expect(q.daysSilent ?? 100).toBeLessThan(7);
      }
      // "wait behind the bigger quote" — used in pair with "Quote #X lower value";
      // implicitly references the priority pick, which must really be bigger.
      if (/wait behind the bigger quote/.test(line)) {
        const lvMatch = /Quote #(\d) is more recent, but lower value/.exec(line);
        if (lvMatch) {
          const q = byIndex.get(Number(lvMatch[1]))!;
          expect(first.amount).toBeGreaterThan(q.amount);
        }
      }
      // "Quote #X is the smallest of the three" — X must be the smallest amount.
      const smallestMatch = /Quote #(\d) is the smallest of the three/.exec(line);
      if (smallestMatch) {
        const q = byIndex.get(Number(smallestMatch[1]))!;
        for (const other of ranked) {
          if (other.index !== q.index) {
            expect(q.amount).toBeLessThan(other.amount);
          }
        }
      }
    }
  }

  it("a HIGHER amount in a warm window outranks a LOWER amount with a similar warm window", () => {
    const ranked = rank([
      { amount: 4000, days: 10 },
      { amount: 7000, days: 5 },
    ]);
    expect(ranked[0].amount).toBe(7000); // bigger wins despite slight fresh penalty
    assertFactual(buildWhyNotOthers(ranked), ranked);
  });

  it("'lower value' copy NEVER fires when the compared quote is actually bigger", () => {
    // Reproduces the original bug shape and asserts the factual guard.
    const ranked = rank([
      { amount: 2500, days: 10 },
      { amount: 5000, days: 12 },
      { amount: 7000, days: 5 },
    ]);
    const lines = buildWhyNotOthers(ranked);
    assertFactual(lines, ranked);
    expect(lines.join(" ")).not.toMatch(/Quote #3[\s\S]*lower value/);
  });

  it("'more money at stake' copy NEVER fires when the priority quote is smaller than the second pick", () => {
    // Build a case where the priority pick is smaller (forced via the cooling weight):
    const ranked = rank([
      { amount: 5000, days: 20 }, // 5000 * 1.0 = 5000  ← priority
      { amount: 6000, days: 80 }, // 6000 * 0.6 = 3600
    ]);
    expect(ranked[0].amount).toBe(5000);
    const lines = buildWhyNotOthers(ranked);
    assertFactual(lines, ranked);
    expect(lines.join(" ")).not.toMatch(/has more money at stake/);
  });

  it("'smallest of the three' copy only fires when the row truly has the smallest amount", () => {
    const ranked = rank([
      { amount: 8000, days: 20 },
      { amount: 6000, days: 22 },
      { amount: 2000, days: 25 }, // genuinely smallest
    ]);
    assertFactual(buildWhyNotOthers(ranked), ranked);
  });

  it("when the loser is BIGGER but very fresh, copy explains via timing, not value", () => {
    // 5000/12 → 5000 prime;  5400/5 → 4860 fresh — winner is SMALLER + older.
    const ranked = rank([
      { amount: 5000, days: 12 },
      { amount: 5400, days: 5 },
    ]);
    expect(ranked[0].amount).toBe(5000);
    const lines = buildWhyNotOthers(ranked);
    assertFactual(lines, ranked);
    // No "lower value" claim, no "more money at stake" claim — the only
    // honest framing is the "bigger but fresh" timing tradeoff.
    expect(lines.join(" ")).not.toMatch(/lower value/);
    expect(lines.join(" ")).not.toMatch(/more money at stake/);
    expect(lines[0]).toMatch(/bigger, but it&apos;s still fresh|bigger, but it's still fresh/);
  });

  it("ranking list and explanation always agree on which quote is the priority", () => {
    const cases: Array<Array<{ amount: number; days: number | null }>> = [
      [
        { amount: 2500, days: 10 },
        { amount: 5000, days: 12 },
        { amount: 7000, days: 5 },
      ],
      [
        { amount: 8000, days: 60 },
        { amount: 3000, days: 5 },
        { amount: 2000, days: 90 },
      ],
      [
        { amount: 4000, days: 14 },
        { amount: 4500, days: 12 },
      ],
      [
        { amount: 5000, days: null },
        { amount: 9000, days: null },
      ],
    ];
    for (const c of cases) {
      const r = runSilentQuoteAudit(
        c.map((i) => ({
          amountRaw: String(i.amount),
          daysSilentRaw: i.days == null ? "" : String(i.days),
        })),
      );
      // Ranking row 1 must be the priority pick.
      expect(r.rankedQuotes[0].index).toBe(r.priority?.index);
      // And the why-not-others copy must not contradict the amounts.
      assertFactual(r.whyNotOthers, r.rankedQuotes);
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
