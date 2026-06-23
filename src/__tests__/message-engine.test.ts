/**
 * Decision-friction message engine tests.
 *
 * Tests the deterministic message generation, banned-phrase enforcement,
 * trade-specific nouns, One-Tap Reply options, and quality gate.
 */
import { describe, expect, it } from "vitest";
import {
  generateFollowupMessage,
  messageWindowForDays,
  projectNounForTrade,
  containsBannedPhrase,
  containsUnsupportedClaim,
  messagePassesQualityGate,
  BANNED_PHRASES,
} from "@/lib/audit/message-engine";
import { suggestedMessage } from "@/lib/audit/silent-quote-audit";

// ---------------------------------------------------------------------------
// Window classification
// ---------------------------------------------------------------------------

describe("messageWindowForDays", () => {
  it("classifies days 1-7 as warm", () => {
    expect(messageWindowForDays(0)).toBe("warm");
    expect(messageWindowForDays(3)).toBe("warm");
    expect(messageWindowForDays(7)).toBe("warm");
  });
  it("classifies days 8-21 as cooling", () => {
    expect(messageWindowForDays(8)).toBe("cooling");
    expect(messageWindowForDays(14)).toBe("cooling");
    expect(messageWindowForDays(21)).toBe("cooling");
  });
  it("classifies days 22-44 as cold", () => {
    expect(messageWindowForDays(22)).toBe("cold");
    expect(messageWindowForDays(30)).toBe("cold");
    expect(messageWindowForDays(44)).toBe("cold");
  });
  it("classifies days 45+ as closeout", () => {
    expect(messageWindowForDays(45)).toBe("closeout");
    expect(messageWindowForDays(46)).toBe("closeout");
    expect(messageWindowForDays(60)).toBe("closeout");
    expect(messageWindowForDays(120)).toBe("closeout");
  });
  it("treats null as warm (unknown age → fresh)", () => {
    expect(messageWindowForDays(null)).toBe("warm");
  });
});

// ---------------------------------------------------------------------------
// Trade-specific project nouns
// ---------------------------------------------------------------------------

describe("projectNounForTrade", () => {
  it("concrete → driveway", () => {
    expect(projectNounForTrade("concrete")).toBe("driveway");
  });
  it("driveway → driveway", () => {
    expect(projectNounForTrade("driveway")).toBe("driveway");
  });
  it("fencing → fence", () => {
    expect(projectNounForTrade("fencing")).toBe("fence");
  });
  it("painting → painting", () => {
    expect(projectNounForTrade("painting")).toBe("painting");
  });
  it("hvac → AC", () => {
    expect(projectNounForTrade("hvac")).toBe("AC");
  });
  it("roofing → roof", () => {
    expect(projectNounForTrade("roofing")).toBe("roof");
  });
  it("null/unknown → estimate", () => {
    expect(projectNounForTrade(null)).toBe("estimate");
    expect(projectNounForTrade("gutters")).toBe("estimate");
  });
});

// ---------------------------------------------------------------------------
// Banned phrases — no message ever contains them
// ---------------------------------------------------------------------------

describe("banned phrases are never in generated messages", () => {
  const windows: Array<[string, number | null]> = [
    ["warm", 3],
    ["cooling", 14],
    ["cold", 30],
    ["closeout", 60],
  ];
  for (const [label, days] of windows) {
    it(`${label} message contains no banned phrases`, () => {
      const gen = generateFollowupMessage({ daysSilent: days });
      expect(containsBannedPhrase(gen.message)).toBe(false);
      // Also check each banned phrase individually for clear failure output
      for (const banned of BANNED_PHRASES) {
        expect(gen.message.toLowerCase()).not.toContain(banned);
      }
    });
  }
  it("no message says 'just checking in', 'any update', or 'are you still interested'", () => {
    for (const days of [3, 14, 30, 60, null]) {
      const gen = generateFollowupMessage({ daysSilent: days });
      expect(gen.message.toLowerCase()).not.toContain("just checking in");
      expect(gen.message.toLowerCase()).not.toContain("any update");
      expect(gen.message.toLowerCase()).not.toContain("are you still interested");
    }
  });
});

// ---------------------------------------------------------------------------
// Unsupported claims — no message makes operational claims
// ---------------------------------------------------------------------------

describe("no unsupported operational claims", () => {
  it("no message claims financing, discount, warranty, tax credit, crew nearby, or schedule opening", () => {
    for (const days of [3, 14, 30, 60, null]) {
      const gen = generateFollowupMessage({ daysSilent: days });
      expect(containsUnsupportedClaim(gen.message)).toBe(false);
      expect(gen.message.toLowerCase()).not.toContain("financing");
      expect(gen.message.toLowerCase()).not.toContain("discount");
      expect(gen.message.toLowerCase()).not.toContain("warranty");
      expect(gen.message.toLowerCase()).not.toContain("tax credit");
      expect(gen.message.toLowerCase()).not.toContain("crew nearby");
      expect(gen.message.toLowerCase()).not.toContain("schedule opening");
    }
  });
  it("no message contains 'guarantee'", () => {
    for (const days of [3, 14, 30, 60, null]) {
      const gen = generateFollowupMessage({ daysSilent: days });
      expect(gen.message.toLowerCase()).not.toMatch(/guarantee/);
    }
  });
});

// ---------------------------------------------------------------------------
// Warm window (1-7 days)
// ---------------------------------------------------------------------------

describe("warm message", () => {
  const gen = generateFollowupMessage({ daysSilent: 3 });
  it("asks one easy question about scope, timing, or price", () => {
    expect(gen.message).toMatch(/scope|timing|price/i);
  });
  it("has quick_check family", () => {
    expect(gen.messageFamily).toBe("quick_check");
  });
  it("has 4 one-tap options", () => {
    expect(gen.oneTapOptions).toHaveLength(4);
  });
  it("whyThisMessage mentions the estimate is fresh", () => {
    expect(gen.whyThisMessage.toLowerCase()).toContain("fresh");
  });
});

// ---------------------------------------------------------------------------
// Cooling window (8-21 days)
// ---------------------------------------------------------------------------

describe("cooling message", () => {
  const gen = generateFollowupMessage({ daysSilent: 14 });
  it("diagnoses timing, budget, or scope", () => {
    expect(gen.message).toMatch(/timing/i);
    expect(gen.message).toMatch(/budget/i);
    expect(gen.message).toMatch(/scope/i);
  });
  it("has friction_diagnosis family", () => {
    expect(gen.messageFamily).toBe("friction_diagnosis");
  });
  it("has 4 one-tap options including Budget and Timing", () => {
    expect(gen.oneTapOptions).toHaveLength(4);
    expect(gen.oneTapOptions).toContain("Budget");
    expect(gen.oneTapOptions).toContain("Timing");
  });
  it("whyThisMessage mentions timing, budget, or scope", () => {
    expect(gen.whyThisMessage.toLowerCase()).toMatch(/timing|budget|scope/);
  });
});

// ---------------------------------------------------------------------------
// Cold window (22-45 days)
// ---------------------------------------------------------------------------

describe("cold message", () => {
  const gen = generateFollowupMessage({ daysSilent: 30 });
  it("uses open/revise/close logic", () => {
    expect(gen.message).toMatch(/open/i);
    expect(gen.message).toMatch(/revise/i);
    expect(gen.message).toMatch(/close/i);
  });
  it("has open_revise_close family", () => {
    expect(gen.messageFamily).toBe("open_revise_close");
  });
  it("has 4 one-tap options including Keep open and Revise it", () => {
    expect(gen.oneTapOptions).toHaveLength(4);
    expect(gen.oneTapOptions).toContain("Keep open");
    expect(gen.oneTapOptions).toContain("Revise it");
  });
  it("whyThisMessage mentions open, revise, or close", () => {
    expect(gen.whyThisMessage.toLowerCase()).toMatch(/open|revise|close/);
  });
});

// ---------------------------------------------------------------------------
// Closeout window (45+ days)
// ---------------------------------------------------------------------------

describe("closeout message", () => {
  const gen = generateFollowupMessage({ daysSilent: 60 });
  it("closes cleanly without guilt", () => {
    expect(gen.message).toMatch(/close out/i);
    expect(gen.message).toMatch(/reopen/i);
  });
  it("does not sound desperate", () => {
    expect(gen.message.toLowerCase()).not.toMatch(/desperate|please|beg|last/);
  });
  it("has clean_closeout family", () => {
    expect(gen.messageFamily).toBe("clean_closeout");
  });
  it("has 4 one-tap options including Reopen later", () => {
    expect(gen.oneTapOptions).toHaveLength(4);
    expect(gen.oneTapOptions).toContain("Reopen later");
  });
  it("whyThisMessage mentions removing awkwardness or leaving the door open", () => {
    expect(gen.whyThisMessage.toLowerCase()).toMatch(/awkward|door|reopen/);
  });
});

// ---------------------------------------------------------------------------
// Concrete trade-specific language
// ---------------------------------------------------------------------------

describe("concrete trade uses driveway language", () => {
  it("warm message says 'driveway estimate'", () => {
    const gen = generateFollowupMessage({ daysSilent: 3, trade: "concrete" });
    expect(gen.message).toContain("driveway estimate");
  });
  it("cooling message says 'driveway estimate'", () => {
    const gen = generateFollowupMessage({ daysSilent: 14, trade: "concrete" });
    expect(gen.message).toContain("driveway estimate");
  });
  it("cold message says 'driveway estimate'", () => {
    const gen = generateFollowupMessage({ daysSilent: 30, trade: "concrete" });
    expect(gen.message).toContain("driveway estimate");
  });
  it("closeout message says 'driveway estimate'", () => {
    const gen = generateFollowupMessage({ daysSilent: 60, trade: "concrete" });
    expect(gen.message).toContain("driveway estimate");
  });
  it("driveway trade also produces driveway language", () => {
    const gen = generateFollowupMessage({ daysSilent: 3, trade: "driveway" });
    expect(gen.message).toContain("driveway estimate");
  });
  it("generic (no trade) says 'estimate' not 'driveway'", () => {
    const gen = generateFollowupMessage({ daysSilent: 3 });
    expect(gen.message).toContain("estimate");
    expect(gen.message).not.toContain("driveway");
  });
});

// ---------------------------------------------------------------------------
// First name handling
// ---------------------------------------------------------------------------

describe("first name handling", () => {
  it("warm message includes first name when provided", () => {
    const gen = generateFollowupMessage({ daysSilent: 3, firstName: "Jane" });
    expect(gen.message).toContain("Hi Jane");
  });
  it("warm message works without first name", () => {
    const gen = generateFollowupMessage({ daysSilent: 3, firstName: null });
    expect(gen.message).not.toContain("Hi Jane");
    expect(gen.message).toMatch(/quick check/i);
  });
  it("cold message does not use first name (direct opener)", () => {
    const gen = generateFollowupMessage({ daysSilent: 30, firstName: "Jane" });
    expect(gen.message).not.toContain("Hi Jane");
  });
});

// ---------------------------------------------------------------------------
// Quality gate
// ---------------------------------------------------------------------------

describe("messagePassesQualityGate", () => {
  it("all generated messages pass the quality gate", () => {
    for (const days of [3, 14, 30, 60, null]) {
      const gen = generateFollowupMessage({ daysSilent: days });
      const result = messagePassesQualityGate(gen.message);
      expect(result.pass).toBe(true);
    }
  });
  it("fails for a banned phrase", () => {
    const result = messagePassesQualityGate("Just checking in on the estimate.");
    expect(result.pass).toBe(false);
    expect(result.reasons).toContain("Contains a banned phrase");
  });
  it("fails for 'guarantee'", () => {
    const result = messagePassesQualityGate("We guarantee you'll get the job back.");
    expect(result.pass).toBe(false);
  });
  it("fails for more than 3 sentences", () => {
    const result = messagePassesQualityGate(
      "This is sentence one. This is sentence two. This is sentence three. This is sentence four.",
    );
    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Backwards compatibility — suggestedMessage() still works
// ---------------------------------------------------------------------------

describe("suggestedMessage backwards compatibility", () => {
  it("returns different messages for different age bands", () => {
    const fresh = suggestedMessage(3);
    const prime = suggestedMessage(14);
    const cold = suggestedMessage(60);
    expect(new Set([fresh, prime, cold]).size).toBe(3);
  });
  it("closeout message contains 'close out'", () => {
    expect(suggestedMessage(60).toLowerCase()).toContain("close out");
  });
  it("never says 'just checking in'", () => {
    for (const days of [3, 14, 30, 60, null]) {
      expect(suggestedMessage(days).toLowerCase()).not.toContain("just checking in");
    }
  });
});
