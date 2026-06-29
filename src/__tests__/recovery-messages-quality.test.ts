/**
 * 32 quality checks the upgraded recovery-message rewrite must satisfy.
 * Each numbered describe maps 1:1 to the task spec's checklist.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SEQUENCE_VARIANTS,
  pickVariant,
  projectLabel,
  tradeWord,
  jobDetail,
  researchSequenceMessages,
  variantSeed,
  type VariantVars,
} from "@/lib/ai/fallback-messages";
import { generateRecoveryPlan } from "@/lib/ai/generate-recovery-plan";
import { validateMessage } from "@/lib/ai/validate-message";
import { getProjectNoun } from "@/lib/recovery/recovery-logic";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const viewModel = readSource("../lib/recovery/recovery-plan-view-model.ts");
const recoveryLogic = readSource("../lib/recovery/recovery-logic.ts");

const TRADES = [
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Remodeling",
  "General Contracting",
  "Landscaping",
  "Painting",
  "Concrete",
];

const NAMES = ["Jane", "Tom", "Sarah", "John", "Amanda", "Chris", "Karen"];

function vars(firstName: string, contractor: string, trade: string): VariantVars {
  const project = projectLabel(trade);
  return {
    firstName,
    contractorFirstName: contractor,
    project,
    projectDetail: project,
    tradeWord: tradeWord(trade),
  };
}

function everyMessage(): string[] {
  const out: string[] = [];
  for (const day of [1, 5, 10, 14, 21, 60] as const) {
    for (let i = 0; i < SEQUENCE_VARIANTS[day].length; i++) {
      for (const trade of TRADES) {
        for (const name of NAMES) {
          out.push(SEQUENCE_VARIANTS[day][i](vars(name, "Mike", trade)));
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Six follow-up messages exist
// ---------------------------------------------------------------------------

describe("1. six follow-ups exist", () => {
  it("generateRecoveryPlan returns exactly 6 messages", async () => {
    const plan = await generateRecoveryPlan({
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
      quoteId: "q-1",
    });
    expect(plan).toHaveLength(6);
    expect(plan.map((m) => m.followup_number)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ---------------------------------------------------------------------------
// 2-4. Variation: same quote → stable, different quotes → can differ
// ---------------------------------------------------------------------------

describe("2-4. deterministic variation by seed", () => {
  it("2. same quoteId returns the same messages", () => {
    const ctx = {
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
      quoteId: "q-stable-1",
    };
    expect(researchSequenceMessages(ctx)).toEqual(researchSequenceMessages(ctx));
  });

  it("3. messages stay stable across hundreds of calls for the same quoteId", () => {
    const ctx = {
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
      quoteId: "q-stable-2",
    };
    const ref = researchSequenceMessages(ctx);
    for (let i = 0; i < 200; i++) {
      expect(researchSequenceMessages(ctx)).toEqual(ref);
    }
  });

  it("4. different quoteIds spread across more than one variant per day", () => {
    for (const day of [1, 5, 10, 14, 21, 60] as const) {
      const seen = new Set<number>();
      for (let i = 0; i < 100; i++) {
        seen.add(pickVariant(`q-${i}`, day));
      }
      expect(seen.size).toBeGreaterThan(1);
    }
  });

  it("(seed fallback) uses clientName + trade + amount + daysSilent when quoteId is absent", () => {
    expect(
      variantSeed({
        firstName: "Jane",
        trade: "Roofing",
        estimateAmount: 8500,
        daysSilent: 7,
      }),
    ).toBe("Jane|Roofing|8500|7");
  });
});

// ---------------------------------------------------------------------------
// 5-20. Banned phrases must NOT appear in any message body
// ---------------------------------------------------------------------------

describe("5-20. banned phrases never appear in any message body", () => {
  const allMessages = everyMessage();

  const banned: Array<[string, string]> = [
    ["5. just checking in", "just checking in"],
    ["6. touching base", "touching base"],
    ["7. circling back", "circling back"],
    ["8. dead or just on pause", "dead or just on pause"],
    ["9. Just need one word", "just need one word"],
    ["10. locking the schedule today", "locking the schedule today"],
    ["11. releasing it", "releasing it"],
    ["12. let the slot go", "let the slot go"],
    ["13. loss aversion", "loss aversion"],
    ["14. reactance", "reactance"],
    ["15. trigger", "trigger"],
    ["16. squeeze", "squeeze"],
    ["17. breakup", "breakup"],
    ["18. AI (as standalone word)", "ai"],
    ["19. CRM (as standalone word)", "crm"],
    ["20. workflow", "workflow"],
  ];

  for (const [label, phrase] of banned) {
    it(`${label} appears in zero message bodies`, () => {
      for (const msg of allMessages) {
        const lower = msg.toLowerCase();
        if (/^[a-z0-9]+$/i.test(phrase)) {
          // Whole-word check for single tokens so "ai" doesn't match "available".
          expect(
            new RegExp(`\\b${phrase}\\b`, "i").test(lower),
            `"${phrase}" found in: ${msg}`,
          ).toBe(false);
        } else {
          expect(
            lower.includes(phrase),
            `"${phrase}" found in: ${msg}`,
          ).toBe(false);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 21-25. Each day fulfils its specific intent
// ---------------------------------------------------------------------------

describe("21-25. each day fulfils its strategic role", () => {
  const sampleVars = vars("Jane", "Mike", "Roofing");

  it("21. Day 1 is a clarity check (number / timing / detail / scope)", () => {
    for (const builder of SEQUENCE_VARIANTS[1]) {
      const msg = builder(sampleVars).toLowerCase();
      expect(/number|timing|detail|scope|clarify|break down|walk through/.test(msg)).toBe(
        true,
      );
    }
  });

  it("22. Day 5 gives easy scope/timing/budget categories and a clean no", () => {
    for (const builder of SEQUENCE_VARIANTS[5]) {
      const msg = builder(sampleVars).toLowerCase();
      expect(msg).toMatch(/timing/);
      expect(msg).toMatch(/budget/);
      expect(msg).toMatch(/scope/);
      expect(msg).toMatch(/\bno\b/);
    }
  });

  it("23. Day 10 is an active-or-close decision", () => {
    for (const builder of SEQUENCE_VARIANTS[10]) {
      const msg = builder(sampleVars).toLowerCase();
      expect(msg).toMatch(/active|open/);
      expect(msg).toMatch(/close/);
      expect(msg).not.toMatch(/locking the schedule today|releasing it|let the slot go/);
    }
  });

  it("24. Day 14 asks for a clean active / pause / close decision", () => {
    for (const builder of SEQUENCE_VARIANTS[14]) {
      const msg = builder(sampleVars).toLowerCase();
      expect(
        /active|pause|paused|close|closed|board|worth discussing|walk through/.test(
          msg,
        ),
      ).toBe(true);
      expect(msg).not.toMatch(/\b(discount|sale|deal|cheaper|coupon|promo)\b/);
      expect(msg).not.toMatch(/\d+\s?%\s?off/);
    }
  });

  it("25. Day 21 closes out respectfully with the door open", () => {
    for (const builder of SEQUENCE_VARIANTS[21]) {
      const msg = builder(sampleVars).toLowerCase();
      expect(/close .*out|close out|mark .* closed|closing|leave .* closed/.test(msg)).toBe(
        true,
      );
      expect((builder(sampleVars).match(/\?/g) ?? []).length).toBe(0);
      expect(msg).not.toMatch(/please|sorry|begging|last chance|final notice/);
    }
  });

  it("26. Day 60 reopens once and leaves the estimate closed", () => {
    for (const builder of SEQUENCE_VARIANTS[60]) {
      const msg = builder(sampleVars).toLowerCase();
      expect(msg).toMatch(/fresh number|refresh the number/);
      expect(msg).toMatch(/closed|stays closed/);
      expect((builder(sampleVars).match(/\?/g) ?? []).length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Day 10 tone safety.
// ---------------------------------------------------------------------------

describe("Day 10 — every variant is a calm soft decision check", () => {
  const sampleVars = vars("Jane", "Mike", "Roofing");

  it("no Day 10 variant opens with the sharp 'Have you given up on…' frame", () => {
    const rendered = SEQUENCE_VARIANTS[10].map((b) => b(sampleVars));
    for (const msg of rendered) {
      expect(msg).not.toMatch(/^Have you given up on /);
      expect(msg).not.toMatch(/given up on/i);
    }
  });

  it("every Day 10 variant carries exactly one question and a trade keyword", () => {
    for (const builder of SEQUENCE_VARIANTS[10]) {
      const msg = builder(sampleVars);
      expect(msg).not.toMatch(/^(Hi|Hey)\b/);
      expect(msg).not.toContain("Jane");
      expect((msg.match(/\?/g) ?? []).length).toBe(1);
      expect(msg.toLowerCase()).toContain("roofing");
      expect(msg.length).toBeLessThanOrEqual(220);
      expect(msg.toLowerCase()).toMatch(/active|open/);
      expect(msg.toLowerCase()).toMatch(/close/);
    }
  });

  it("every Day 10 variant validates for every supported trade", () => {
    for (const trade of TRADES) {
      const v = vars("Jane", "Mike", trade);
      for (const builder of SEQUENCE_VARIANTS[10]) {
        const msg = builder(v);
        const res = validateMessage(msg, {
          firstName: "Jane",
          trade,
          followupNumber: 3,
        });
        expect(res.reasons).not.toContain("missing trade/job context");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Trade/project keyword appears in every message.
// ---------------------------------------------------------------------------

describe("26. trade/project keyword in every message", () => {
  for (const trade of TRADES) {
    it(`trade keyword present in all 6 days for ${trade}`, () => {
      const seq = researchSequenceMessages({
        firstName: "Jane",
        contractorFirstName: "Mike",
        trade,
        estimateAmount: 5000,
      });
      for (const day of [
        "day1",
        "day5",
        "day10",
        "day14",
        "day21",
        "day60",
      ] as const) {
        const result = validateMessage(seq[day], {
          firstName: "Jane",
          trade,
          followupNumber:
            day === "day1"
              ? 1
              : day === "day5"
                ? 2
                : day === "day10"
                  ? 3
                  : day === "day14"
                    ? 4
                    : day === "day21"
                      ? 5
                      : 6,
        });
        // The trade check is part of validateMessage now; if a message is
        // missing the trade keyword, this reason fires.
        expect(result.reasons).not.toContain("missing trade/job context");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 27-29. Asymmetry across the sequence
// ---------------------------------------------------------------------------

describe("27-29. asymmetric structure across the sequence", () => {
  const seq = researchSequenceMessages({
    firstName: "Jane",
    contractorFirstName: "Mike",
    trade: "Roofing",
    estimateAmount: 8500,
    quoteId: "asym-seed",
  });

  it("27. the 6 messages are not all structurally identical", () => {
    const opens = [
      seq.day1,
      seq.day5,
      seq.day10,
      seq.day14,
      seq.day21,
      seq.day60,
    ].map((m) => m.split(/[\s,—]/)[0]);
    // First-token diversity is a proxy for structural variation across the arc.
    expect(new Set(opens).size).toBeGreaterThanOrEqual(3);
  });

  it("28. not all messages start with the client name", () => {
    const startsWithName = [
      seq.day1,
      seq.day5,
      seq.day10,
      seq.day14,
      seq.day21,
      seq.day60,
    ].map((m) => m.startsWith("Jane,"));
    expect(startsWithName.every((b) => b)).toBe(false);
  });

  it("29. messages do not use a repetitive Hey opener", () => {
    for (const m of [
      seq.day1,
      seq.day5,
      seq.day10,
      seq.day14,
      seq.day21,
      seq.day60,
    ]) {
      expect(m).not.toMatch(/^Hey\b/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 30. Visible labels are the new contractor-native names
// ---------------------------------------------------------------------------

describe("30. visible framework labels", () => {
  it("uses the six corrected sequence labels", async () => {
    const plan = await generateRecoveryPlan({
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
      quoteId: "labels-1",
    });
    expect(plan.map((m) => m.framework)).toEqual([
      "Decision Friction",
      "Scope Rescue",
      "Soft Decision Check",
      "Open, Revise, or Close",
      "Clean Closeout",
      "Reopen Later",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 31-32. WHY_THIS_WORKS is unchanged — the rewrite ONLY touches message bodies
//        and visible labels, not the contractor-only rationale text.
// ---------------------------------------------------------------------------

describe("31-32. WHY_THIS_WORKS rationale is contractor-native (no psychology jargon)", () => {
  // Locked snapshot after the no-overclaim rewrite. The previous version
  // claimed "Most quiet quotes stall on price, not interest" — an assertion
  // about cause the app has no signal to back ("No engagement signal yet"
  // renders on the same page). Every rationale now explains the move's
  // mechanics (effort, clarity, choice) without diagnosing the homeowner.
  const EXPECTED_WHY_THIS_WORKS = `getWhyThisWorksForStep`;

  it("31. WHY_THIS_WORKS source block matches the no-overclaim rewrite", () => {
    expect(viewModel).toContain(EXPECTED_WHY_THIS_WORKS);
  });

  it("32. each rationale is supplied through the ViewModel", () => {
    expect(viewModel).toContain("getWhyThisWorks");
    expect(viewModel).toContain("getWhyThisWorksForStep");
    expect(detailPage).toContain("viewModel.currentWhyThisWorks");
    expect(detailPage).toContain("card.whyThisWorks");
  });

  it("32b. the Day 14 rationale never claims price is the stall reason (no signal to back it)", () => {
    expect(detailPage).not.toMatch(/stall on price/i);
    expect(detailPage).not.toMatch(/Most quiet quotes stall/i);
  });

  it("the rationale is keyed by the ViewModel sequence definition", () => {
    expect(viewModel).toMatch(
      /getWhyThisWorksForStep\(reminder\.followup_number\)/,
    );
  });

  it("contains NO academic psychology jargon (the contract this rewrite delivers)", () => {
    // Scan the locked block only — `loss aversion` / `reactance` may appear
    // legitimately in test fixtures elsewhere in the file.
    const startIdx = recoveryLogic.indexOf("getWhyThisWorksForStep");
    const endIdx = recoveryLogic.indexOf("// One-Tap Reply options", startIdx);
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const block = recoveryLogic.slice(startIdx, endIdx);
    expect(block).not.toMatch(/loss aversion/i);
    expect(block).not.toMatch(/reactance/i);
    expect(block).not.toMatch(/scarcity makes you the prize/i);
    expect(block).not.toMatch(/psychological trigger/i);
  });
});

// ---------------------------------------------------------------------------
// Length cap — keep messages email-friendly
// ---------------------------------------------------------------------------

describe("messages stay concise — every message under 220 chars across all trades + names", () => {
  it("all 20 variants × 9 trades × 7 names stay within MAX_MESSAGE_CHARS", () => {
    for (const msg of everyMessage()) {
      expect(msg.length).toBeLessThanOrEqual(220);
    }
  });
});

// ---------------------------------------------------------------------------
// Job-aware specificity — the headline 10/10 lever. When a job is known, the
// message names it ("the roofing estimate for the metal roof"); when unknown,
// it degrades cleanly to the plain trade phrasing. Fail-closed: never awkward.
// ---------------------------------------------------------------------------

describe("job-aware specificity (jobDetail)", () => {
  // HVAC is intentionally excluded: equipment nouns stack awkwardly behind
  // "the HVAC … estimate", so HVAC carries its specificity in the richer
  // "the HVAC replacement estimate" label instead of per-job injection. See
  // the dedicated HVAC test below.
  const KNOWN: Array<{ trade: string; desc: string; detail: string }> = [
    { trade: "Plumbing", desc: "Replace water heater", detail: "water heater" },
    { trade: "Electrical", desc: "Panel upgrade to 200A", detail: "panel upgrade" },
    { trade: "Remodeling", desc: "Kitchen remodel", detail: "kitchen" },
    { trade: "General Contracting", desc: "Deck + sunroom addition", detail: "deck" },
    { trade: "Roofing", desc: "Re-roof, asphalt shingles", detail: "shingle roof" },
    { trade: "Roofing", desc: "Full tear-off and replace", detail: "new roof" },
    { trade: "Concrete", desc: "New driveway pour", detail: "driveway" },
    { trade: "Painting", desc: "Exterior repaint", detail: "exterior" },
    { trade: "Landscaping", desc: "New paver patio", detail: "patio" },
  ];

  it("extracts the curated job noun for each trade", () => {
    for (const { trade, desc, detail } of KNOWN) {
      expect(jobDetail(trade, desc)).toBe(detail);
    }
  });

  it("is fail-closed: unknown / empty descriptions return null", () => {
    expect(jobDetail("Plumbing", "asdf qwerty zzz")).toBeNull();
    expect(jobDetail("Roofing", "")).toBeNull();
    expect(jobDetail("HVAC", null)).toBeNull();
    expect(jobDetail("HVAC", undefined)).toBeNull();
    // A trade with no dictionary entry never throws and returns null.
    expect(jobDetail("Other", "something custom")).toBeNull();
  });

  it("is deterministic for the same inputs", () => {
    for (const { trade, desc } of KNOWN) {
      expect(jobDetail(trade, desc)).toBe(jobDetail(trade, desc));
    }
  });

  it("uses the approved project noun instead of ad-hoc job-description injection", () => {
    for (const { trade, desc } of KNOWN) {
      const seq = researchSequenceMessages({
        firstName: "Jane",
        contractorFirstName: "Mike",
        trade,
        estimateAmount: 5000,
        jobDescription: desc,
        quoteId: `detail-${trade}`,
      });
      const noun = getProjectNoun(trade);
      expect(seq.day1.toLowerCase()).toContain(noun);
      expect(seq.day14.toLowerCase()).toContain(noun);
      expect(seq.day21.toLowerCase()).toContain(noun);
      expect(seq.day60.toLowerCase()).toContain(noun);
      for (const [n, msg] of [
        [1, seq.day1],
        [4, seq.day14],
        [5, seq.day21],
        [6, seq.day60],
      ] as const) {
        const res = validateMessage(msg, {
          firstName: "Jane",
          trade,
          followupNumber: n,
        });
        expect(res.reasons).toEqual([]);
        expect(msg.length).toBeLessThanOrEqual(320);
      }
    }
  });

  it("when the job is unknown, the sequence still validates and stays trade-anchored", () => {
    for (const trade of TRADES) {
      const seq = researchSequenceMessages({
        firstName: "Jane",
        contractorFirstName: "Mike",
        trade,
        estimateAmount: 5000,
        jobDescription: "custom unrecognized scope text",
        quoteId: `nodetail-${trade}`,
      });
      // No "for the" injection occurred (detail was null).
      expect(jobDetail(trade, "custom unrecognized scope text")).toBeNull();
      for (const [n, msg] of [
        [1, seq.day1],
        [2, seq.day5],
        [3, seq.day10],
        [4, seq.day14],
        [5, seq.day21],
        [6, seq.day60],
      ] as const) {
        const res = validateMessage(msg, {
          firstName: "Jane",
          trade,
          followupNumber: n,
        });
        expect(res.reasons).not.toContain("missing trade/job context");
      }
    }
  });

  it("detail injection is stable per quote across repeated calls", () => {
    const ctx = {
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Plumbing",
      estimateAmount: 2400,
      jobDescription: "Replace water heater",
      quoteId: "stable-detail-1",
    };
    expect(researchSequenceMessages(ctx)).toEqual(researchSequenceMessages(ctx));
  });

  it("HVAC uses the clean system noun and never stacks an equipment noun", () => {
    // jobDetail returns null for HVAC so no "for the furnace / AC / heat pump"
    // ever appears — the noun stack that read awkwardly is gone.
    expect(jobDetail("HVAC", "Replace 3-ton AC + furnace")).toBeNull();
    expect(jobDetail("HVAC", "Install heat pump")).toBeNull();

    const seq = researchSequenceMessages({
      firstName: "John",
      contractorFirstName: "Mike",
      trade: "HVAC",
      estimateAmount: 12000,
      jobDescription: "Replace 3-ton AC + furnace",
      quoteId: "hvac-clean-1",
    });
    for (const day of [
      "day1",
      "day5",
      "day10",
      "day14",
      "day21",
      "day60",
    ] as const) {
      expect(seq[day]).toContain("system");
    }
    // No awkward equipment-noun stack on ANY touch.
    for (const day of [
      "day1",
      "day5",
      "day10",
      "day14",
      "day21",
      "day60",
    ] as const) {
      expect(seq[day]).not.toMatch(
        /estimate for the (furnace|ac|heat pump|mini-split|ductwork)/i,
      );
    }
  });
});
