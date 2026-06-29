/**
 * Golden test matrix for centralized recovery logic.
 *
 * Tests the SINGLE source of truth (src/lib/recovery/recovery-logic.ts)
 * across all 13 golden cases. Every product surface must agree with these.
 */
import { describe, expect, it } from "vitest";
import {
  getRecoveryWindow,
  getRecoveryWindowLabel,
  getExpectedRecoveryValue,
  getPriorityLabel,
  getMessageFamily,
  getWhyThisWorks,
  getOneTapOptions,
  getQuietSignal,
  getRecommendedMessage,
  getProjectNoun,
  getReplyPlaybook,
  containsBannedPhrase,
  BANNED_PHRASES,
  CADENCE_DAYS,
  SEQUENCE_FAMILIES,
} from "@/lib/recovery/recovery-logic";

// ---------------------------------------------------------------------------
// Golden cases 1-11: recovery window classification
// ---------------------------------------------------------------------------

describe("golden cases: recovery window classification", () => {
  const cases: Array<{ name: string; days: number; expected: string }> = [
    { name: "Case 1: $3,000 / 0 days → Warm", days: 0, expected: "warm" },
    { name: "Case 2: $3,000 / 3 days → Warm", days: 3, expected: "warm" },
    { name: "Case 3: $3,000 / 7 days → Warm", days: 7, expected: "warm" },
    { name: "Case 4: $3,000 / 8 days → Cooling", days: 8, expected: "cooling" },
    { name: "Case 5: $7,000 / 14 days → Cooling", days: 14, expected: "cooling" },
    { name: "Case 6: $12,000 / 20 days → Cooling", days: 20, expected: "cooling" },
    { name: "Case 7: $10,000 / 22 days → Cold", days: 22, expected: "cold" },
    { name: "Case 8: $10,000 / 30 days → Cold", days: 30, expected: "cold" },
    { name: "Case 9: $10,000 / 44 days → Cold", days: 44, expected: "cold" },
    { name: "Case 10: $10,000 / 45 days → Closeout", days: 45, expected: "closeout" },
    { name: "Case 11: $60,000 / 50 days → Closeout", days: 50, expected: "closeout" },
  ];
  for (const c of cases) {
    it(c.name, () => {
      expect(getRecoveryWindow(c.days)).toBe(c.expected);
      expect(getRecoveryWindowLabel(getRecoveryWindow(c.days))).toBe(
        c.expected.charAt(0).toUpperCase() + c.expected.slice(1),
      );
    });
  }
  it("null days → unknown", () => {
    expect(getRecoveryWindow(null)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Golden case 12: ranking by expected recovery value
// ---------------------------------------------------------------------------

describe("golden case 12: ranking by expected recovery value", () => {
  it("$8k/9d (6000) beats $30k/50d (4500) and $3k/2d (3000)", () => {
    const e1 = getExpectedRecoveryValue(8000, 9);   // Cooling 0.75 → 6000
    const e2 = getExpectedRecoveryValue(30000, 50);  // Closeout 0.15 → 4500
    const e3 = getExpectedRecoveryValue(3000, 2);    // Warm 1.0 → 3000
    expect(e1).toBe(6000);
    expect(e2).toBe(4500);
    expect(e3).toBe(3000);
    expect(e1).toBeGreaterThan(e2);
    expect(e2).toBeGreaterThan(e3);
    // Estimate #1 should be selected first
    const ranked = [
      { index: 1, value: e1 },
      { index: 2, value: e2 },
      { index: 3, value: e3 },
    ].sort((a, b) => b.value - a.value);
    expect(ranked[0]!.index).toBe(1);
  });
  it("Estimate #1 window is Cooling", () => {
    expect(getRecoveryWindow(9)).toBe("cooling");
  });
  it("Estimate #2 window is Closeout", () => {
    expect(getRecoveryWindow(50)).toBe("closeout");
  });
  it("Estimate #3 window is Warm", () => {
    expect(getRecoveryWindow(2)).toBe("warm");
  });
});

// ---------------------------------------------------------------------------
// Golden case 13: high-value closeout can beat cooling
// ---------------------------------------------------------------------------

describe("golden case 13: high-value closeout beats cooling", () => {
  it("$60k/50d (9000) beats $7k/14d (5250) and $3k/4d (3000)", () => {
    const e1 = getExpectedRecoveryValue(7000, 14);   // Cooling 0.75 → 5250
    const e2 = getExpectedRecoveryValue(60000, 50);  // Closeout 0.15 → 9000
    const e3 = getExpectedRecoveryValue(3000, 4);    // Warm 1.0 → 3000
    expect(e2).toBeGreaterThan(e1);
    expect(e1).toBeGreaterThan(e3);
    const ranked = [
      { index: 1, value: e1 },
      { index: 2, value: e2 },
      { index: 3, value: e3 },
    ].sort((a, b) => b.value - a.value);
    expect(ranked[0]!.index).toBe(2); // Closeout quote wins
  });
});

// ---------------------------------------------------------------------------
// Priority labels — never show raw window names as priority
// ---------------------------------------------------------------------------

describe("priority labels are contractor-friendly, not raw window names", () => {
  it("warm → Send today", () => {
    expect(getPriorityLabel("warm")).toBe("Send today");
  });
  it("cooling → Follow up next", () => {
    expect(getPriorityLabel("cooling")).toBe("Follow up next");
  });
  it("cold → High", () => {
    expect(getPriorityLabel("cold")).toBe("High");
  });
  it("closeout → Closeout touch", () => {
    expect(getPriorityLabel("closeout")).toBe("Closeout touch");
  });
  it("priority labels never contain raw band words (FRESH/AT RISK/CRITICAL)", () => {
    for (const window of ["warm", "cooling", "cold", "closeout", "unknown"] as const) {
      const label = getPriorityLabel(window).toLowerCase();
      expect(label).not.toContain("fresh");
      expect(label).not.toContain("at risk");
      expect(label).not.toContain("critical");
    }
  });
});

// ---------------------------------------------------------------------------
// Message families — one per window
// ---------------------------------------------------------------------------

describe("message families match recovery windows", () => {
  it("warm → Decision Friction", () => {
    expect(getMessageFamily("warm")).toBe("Decision Friction");
  });
  it("cooling → Soft Decision Check", () => {
    expect(getMessageFamily("cooling")).toBe("Soft Decision Check");
  });
  it("cold → Open, Revise, or Close", () => {
    expect(getMessageFamily("cold")).toBe("Open, Revise, or Close");
  });
  it("closeout → Clean Closeout", () => {
    expect(getMessageFamily("closeout")).toBe("Clean Closeout");
  });
  it("sequence has 6 distinct families", () => {
    expect(SEQUENCE_FAMILIES).toHaveLength(6);
    expect(new Set(SEQUENCE_FAMILIES).size).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Why-this-works — per window, no repeats
// ---------------------------------------------------------------------------

describe("why-this-works varies by window", () => {
  const windows = ["warm", "cooling", "cold", "closeout"] as const;
  it("each window has a distinct why-this-works", () => {
    const explanations = windows.map((w) => getWhyThisWorks(w));
    expect(new Set(explanations).size).toBe(4);
  });
  it("warm removes decision friction", () => {
    expect(getWhyThisWorks("warm").toLowerCase()).toContain("replying cheap");
  });
  it("cooling makes a keep-or-close answer safe", () => {
    expect(getWhyThisWorks("cooling").toLowerCase()).toContain("keep-or-close");
  });
  it("cold mentions an exit ramp", () => {
    expect(getWhyThisWorks("cold").toLowerCase()).toContain("exit ramp");
  });
  it("closeout mentions mental clutter", () => {
    expect(getWhyThisWorks("closeout").toLowerCase()).toContain("mental clutter");
  });
});

// ---------------------------------------------------------------------------
// One-Tap options — per window
// ---------------------------------------------------------------------------

describe("one-tap options match recovery window", () => {
  it("uses the window-aware option sets", () => {
    expect(getOneTapOptions("warm")).toHaveLength(4);
    expect(getOneTapOptions("cooling")).toHaveLength(7);
    expect(getOneTapOptions("cooling")).toContain("Still comparing");
    expect(getOneTapOptions("cooling")).toContain("Need to talk it over");
    expect(getOneTapOptions("cold")).toHaveLength(4);
    expect(getOneTapOptions("closeout")).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Quiet signal — per window
// ---------------------------------------------------------------------------

describe("quiet signal matches recovery window", () => {
  it("warm → Early / Normal early silence", () => {
    const qs = getQuietSignal("warm");
    expect(qs.signal).toBe("Early");
    expect(qs.stallReason).toBe("Normal early silence");
  });
  it("cooling → Waiting / Decision friction", () => {
    const qs = getQuietSignal("cooling");
    expect(qs.signal).toBe("Waiting");
    expect(qs.stallReason).toBe("Decision friction");
  });
  it("cold → Cooling off / Stalled decision", () => {
    const qs = getQuietSignal("cold");
    expect(qs.signal).toBe("Cooling off");
    expect(qs.stallReason).toBe("Stalled decision");
  });
  it("closeout → Closeout / Likely inactive", () => {
    const qs = getQuietSignal("closeout");
    expect(qs.signal).toBe("Closeout");
    expect(qs.stallReason).toBe("Likely inactive");
  });
});

// ---------------------------------------------------------------------------
// Recommended message — per window, trade-specific
// ---------------------------------------------------------------------------

describe("recommended message matches recovery window", () => {
  it("warm message asks a clear question", () => {
    const rec = getRecommendedMessage({ daysQuiet: 3, firstName: "Ali", trade: "concrete" });
    expect(rec.window).toBe("warm");
    expect(rec.messageFamily).toBe("Decision Friction");
    expect(rec.message).toContain("Any question on the driveway I can clear up?");
  });
  it("cooling message asks for a soft keep-or-close decision", () => {
    const rec = getRecommendedMessage({ daysQuiet: 14, firstName: "Ali", trade: "electrical" });
    expect(rec.window).toBe("cooling");
    expect(rec.messageFamily).toBe("Soft Decision Check");
    expect(rec.message).toContain("active list");
    expect(rec.message).toContain("Either is fine");
  });
  it("cold message offers open/revise/close", () => {
    const rec = getRecommendedMessage({ daysQuiet: 30, trade: "electrical" });
    expect(rec.window).toBe("cold");
    expect(rec.message).toMatch(/open/i);
    expect(rec.message).toMatch(/revise/i);
    expect(rec.message).toMatch(/close/i);
  });
  it("closeout message closes cleanly", () => {
    const rec = getRecommendedMessage({ daysQuiet: 50, trade: "electrical" });
    expect(rec.window).toBe("closeout");
    expect(rec.message).toContain("close out");
    expect(rec.message).toContain("no re-quote needed");
  });
  it("concrete trade uses 'driveway' noun", () => {
    const rec = getRecommendedMessage({ daysQuiet: 14, trade: "concrete" });
    expect(rec.message).toContain("the driveway");
  });
});

// ---------------------------------------------------------------------------
// Banned phrases — never appear in any generated message
// ---------------------------------------------------------------------------

describe("no banned phrases in generated messages", () => {
  it("no message contains any banned phrase", () => {
    for (const days of [0, 3, 7, 8, 14, 20, 22, 30, 44, 45, 50, null]) {
      const rec = getRecommendedMessage({ daysQuiet: days, firstName: "Ali", trade: "electrical" });
      expect(containsBannedPhrase(rec.message)).toBe(false);
      for (const banned of BANNED_PHRASES) {
        expect(rec.message.toLowerCase()).not.toContain(banned);
      }
    }
  });
  it("no guarantee language", () => {
    for (const days of [0, 3, 14, 30, 50, null]) {
      const rec = getRecommendedMessage({ daysQuiet: days, trade: "electrical" });
      expect(rec.message.toLowerCase()).not.toContain("guarantee");
      expect(rec.message.toLowerCase()).not.toContain("proven to win");
      expect(rec.message.toLowerCase()).not.toContain("force a reply");
    }
  });
});

// ---------------------------------------------------------------------------
// Cadence — single source of truth
// ---------------------------------------------------------------------------

describe("cadence is centralized", () => {
  it("has 6 steps with correct day offsets", () => {
    expect(CADENCE_DAYS[1]).toBe(1);
    expect(CADENCE_DAYS[2]).toBe(5);
    expect(CADENCE_DAYS[3]).toBe(10);
    expect(CADENCE_DAYS[4]).toBe(14);
    expect(CADENCE_DAYS[5]).toBe(21);
    expect(CADENCE_DAYS[6]).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Project nouns — trade-specific
// ---------------------------------------------------------------------------

describe("project nouns are trade-specific", () => {
  it("concrete → driveway", () => {
    expect(getProjectNoun("concrete")).toBe("driveway");
  });
  it("fencing → fence", () => {
    expect(getProjectNoun("fencing")).toBe("fence");
  });
  it("unknown trade → estimate", () => {
    expect(getProjectNoun("electrical")).toBe("work");
    expect(getProjectNoun("solar")).toBe("estimate");
    expect(getProjectNoun(null)).toBe("estimate");
  });
  it("covers every newly supported trade", () => {
    expect(getProjectNoun("flooring")).toBe("floor");
    expect(getProjectNoun("windows & doors")).toBe("install");
    expect(getProjectNoun("siding")).toBe("siding");
    expect(getProjectNoun("drywall")).toBe("work");
    expect(getProjectNoun("tree service")).toBe("removal");
  });
  it("prefers the selected project type over the trade fallback", () => {
    expect(getProjectNoun("concrete", "Patio")).toBe("patio");
    expect(getProjectNoun("concrete", "Driveway")).toBe("driveway");
  });
});

describe("trade-native reply playbook", () => {
  const paths = getReplyPlaybook("Concrete");

  it("uses the exact price and comparison moves", () => {
    expect(
      paths.find((path) => path.id === "price_concern")?.response,
    ).toContain("pick the piece that fits");
    expect(
      paths.find((path) => path.id === "still_comparing")?.response,
    ).toContain("did anyone trim it to come in lower");
  });

  it("uses the concrete project noun", () => {
    expect(paths.find((path) => path.id === "bad_timing")?.response).toContain(
      "the driveway",
    );
  });
  it("adds spouse approval and persistent no-response branches", () => {
    expect(paths.find((path) => path.id === "spouse_approval")?.response).toContain(
      "send a quick summary",
    );
    expect(
      paths.find((path) => path.id === "no_response_breakup")?.response,
    ).toContain("no awkward restart");
  });
});
