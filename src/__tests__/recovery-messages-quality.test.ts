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

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");

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
  for (const day of [1, 3, 7, 14, 30] as const) {
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
// 1. Five follow-up messages exist
// ---------------------------------------------------------------------------

describe("1. five follow-ups exist", () => {
  it("generateRecoveryPlan returns exactly 5 messages", async () => {
    const plan = await generateRecoveryPlan({
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
      quoteId: "q-1",
    });
    expect(plan).toHaveLength(5);
    expect(plan.map((m) => m.followup_number)).toEqual([1, 2, 3, 4, 5]);
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
    for (const day of [1, 3, 7, 14, 30] as const) {
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

  it("22. Day 3 is an active-list / schedule check with no fake slot scarcity", () => {
    for (const builder of SEQUENCE_VARIANTS[3]) {
      const msg = builder(sampleVars).toLowerCase();
      expect(/active list|active|schedule|set it aside|pause it|move it off/.test(msg)).toBe(
        true,
      );
      expect(msg).not.toMatch(/locking the schedule today|releasing it|let the slot go/);
    }
  });

  it("23. Day 7 is a close-the-loop ask (keep open or close out)", () => {
    for (const builder of SEQUENCE_VARIANTS[7]) {
      const msg = builder(sampleVars).toLowerCase();
      expect(/keep .* (open|active)|leave .* open|on the board/.test(msg)).toBe(true);
      expect(/close it out|close it out for now|mark it closed/.test(msg)).toBe(true);
    }
  });

  it("24. Day 14 offers options without ANY discount language", () => {
    for (const builder of SEQUENCE_VARIANTS[14]) {
      const msg = builder(sampleVars).toLowerCase();
      expect(
        /walk through|options|lay out|handle it|holding (this|things) up|stuck on/.test(
          msg,
        ),
      ).toBe(true);
      expect(msg).not.toMatch(/\b(discount|sale|deal|cheaper|coupon|promo)\b/);
      expect(msg).not.toMatch(/\d+\s?%\s?off/);
    }
  });

  it("25. Day 30 closes out respectfully (no hard feelings, door open)", () => {
    for (const builder of SEQUENCE_VARIANTS[30]) {
      const msg = builder(sampleVars).toLowerCase();
      expect(/close .*out|close out|mark .* closed|step back|going to close/.test(msg)).toBe(
        true,
      );
      // No question — declarative breakup signal.
      expect((builder(sampleVars).match(/\?/g) ?? []).length).toBe(0);
      // No begging or guilt language.
      expect(msg).not.toMatch(/please|sorry|begging|last chance|final notice/);
    }
  });
});

// ---------------------------------------------------------------------------
// Day 7 tone safety — every variant is a calm contractor-native
// close-the-loop ask. The earlier verbatim Chris Voss "Have you given up
// on…?" frame was research-backed but read too sharp under a contractor's
// own name and is removed.
// ---------------------------------------------------------------------------

describe("Day 7 — every variant is calm contractor-native, no 'Have you given up'", () => {
  const sampleVars = vars("Jane", "Mike", "Roofing");

  it("NO Day 7 variant opens with the sharp 'Have you given up on…' frame", () => {
    const rendered = SEQUENCE_VARIANTS[7].map((b) => b(sampleVars));
    for (const msg of rendered) {
      expect(msg).not.toMatch(/^Have you given up on /);
      expect(msg).not.toMatch(/given up on/i);
    }
  });

  it("every Day 7 variant carries no name, no greeting, exactly one question, trade keyword", () => {
    for (const builder of SEQUENCE_VARIANTS[7]) {
      const msg = builder(sampleVars);
      expect(msg).not.toMatch(/^(Hi|Hey)\b/);
      expect(msg).not.toContain("Jane");
      expect((msg.match(/\?/g) ?? []).length).toBe(1);
      expect(msg.toLowerCase()).toContain("roofing");
      expect(msg.length).toBeLessThanOrEqual(220);
      // Each must still satisfy the close-the-loop guarantees.
      expect(
        /keep .* (open|active)|leave .* open|on the board/.test(msg.toLowerCase()),
      ).toBe(true);
      expect(
        /close it out|close it out for now|mark it closed/.test(msg.toLowerCase()),
      ).toBe(true);
    }
  });

  it("every Day 7 variant validates for every supported trade", () => {
    for (const trade of TRADES) {
      const v = vars("Jane", "Mike", trade);
      for (const builder of SEQUENCE_VARIANTS[7]) {
        const msg = builder(v);
        const res = validateMessage(msg, {
          firstName: "Jane",
          trade,
          followupNumber: 3,
        });
        expect(res.reasons).toEqual([]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 26. Trade/project keyword appears in EVERY message (Day 1-30)
// ---------------------------------------------------------------------------

describe("26. trade/project keyword in every message", () => {
  for (const trade of TRADES) {
    it(`trade keyword present in all 5 days for ${trade}`, () => {
      const seq = researchSequenceMessages({
        firstName: "Jane",
        contractorFirstName: "Mike",
        trade,
        estimateAmount: 5000,
      });
      for (const day of ["day1", "day3", "day7", "day14", "day30"] as const) {
        const result = validateMessage(seq[day], {
          firstName: "Jane",
          trade,
          followupNumber:
            day === "day1" ? 1 : day === "day3" ? 2 : day === "day7" ? 3 : day === "day14" ? 4 : 5,
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

  it("27. the 5 messages are NOT all structurally identical (different openings/shapes)", () => {
    const opens = [seq.day1, seq.day3, seq.day7, seq.day14, seq.day30].map((m) =>
      m.split(/[\s,—]/)[0],
    );
    // First-token diversity is a proxy for structural variation across the arc.
    expect(new Set(opens).size).toBeGreaterThanOrEqual(3);
  });

  it("28. not ALL messages start with the client name (Day 1 leads with Hey, Day 7 omits)", () => {
    const startsWithName = [seq.day1, seq.day3, seq.day7, seq.day14, seq.day30].map((m) =>
      m.startsWith("Jane,"),
    );
    expect(startsWithName.every((b) => b)).toBe(false);
  });

  it("29. not ALL messages start with 'Hey' (Day 1 leads with Hey, the rest do not)", () => {
    for (const m of [seq.day3, seq.day7, seq.day14, seq.day30]) {
      expect(m).not.toMatch(/^Hey\b/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 30. Visible labels are the new contractor-native names
// ---------------------------------------------------------------------------

describe("30. visible framework labels", () => {
  it("uses Estimate Check / Schedule Check / Close-the-Loop / Options Check / Final Closeout", async () => {
    const plan = await generateRecoveryPlan({
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
      quoteId: "labels-1",
    });
    expect(plan.map((m) => m.framework)).toEqual([
      "Estimate Check",
      "Schedule Check",
      "Close-the-Loop",
      "Options Check",
      "Final Closeout",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 31-32. WHY_THIS_WORKS is unchanged — the rewrite ONLY touches message bodies
//        and visible labels, not the contractor-only rationale text.
// ---------------------------------------------------------------------------

describe("31-32. WHY_THIS_WORKS rationale is contractor-native (no psychology jargon)", () => {
  // Locked snapshot after the contractor-native rewrite. The previous version
  // used "Schedule scarcity makes you the prize", "loss aversion", and
  // "reactance" — phrases that read as a sales coach instead of a contractor.
  const EXPECTED_WHY_THIS_WORKS = `const WHY_THIS_WORKS: Record<FollowupStep, string> = {
  1: "Asking what didn't land flips you from chaser to helper — and surfaces the real objection instead of begging for a reply.",
  2: "Showing that your schedule has to be managed makes the homeowner choose instead of leaving you hanging.",
  3: "Giving permission to say no feels safer than being pushed — so they rarely take it. Asking 'should I close it' lets the homeowner act instead of staying silent.",
  4: "Most quiet quotes stall on price, not interest. Offering a phased path removes the real barrier without ever dropping your number.",
  5: "Pulling back often gets the reply that pushing could not. Saying you'll close the estimate lets the homeowner re-engage on their own terms.",
};`;

  it("31. WHY_THIS_WORKS source block matches the contractor-native rewrite", () => {
    expect(detailPage).toContain(EXPECTED_WHY_THIS_WORKS);
  });

  it("32. each rationale line is present verbatim on the quote detail page", () => {
    expect(detailPage).toContain(
      "Asking what didn't land flips you from chaser to helper — and surfaces the real objection instead of begging for a reply.",
    );
    expect(detailPage).toContain(
      "Showing that your schedule has to be managed makes the homeowner choose instead of leaving you hanging.",
    );
    expect(detailPage).toContain(
      "Giving permission to say no feels safer than being pushed — so they rarely take it. Asking 'should I close it' lets the homeowner act instead of staying silent.",
    );
    expect(detailPage).toContain(
      "Most quiet quotes stall on price, not interest. Offering a phased path removes the real barrier without ever dropping your number.",
    );
    expect(detailPage).toContain(
      "Pulling back often gets the reply that pushing could not. Saying you'll close the estimate lets the homeowner re-engage on their own terms.",
    );
  });

  it("the WHY_THIS_WORKS UI rendering point is unchanged (keyed by followup_number)", () => {
    expect(detailPage).toMatch(/WHY_THIS_WORKS\[r\.followup_number/);
  });

  it("contains NO academic psychology jargon (the contract this rewrite delivers)", () => {
    // Scan the locked block only — `loss aversion` / `reactance` may appear
    // legitimately in test fixtures elsewhere in the file.
    const startIdx = detailPage.indexOf("const WHY_THIS_WORKS");
    const endIdx = detailPage.indexOf("};", startIdx);
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const block = detailPage.slice(startIdx, endIdx);
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

  it("injects the job noun into Day 1, Day 14, and Day 30 (the conversion touches)", () => {
    for (const { trade, desc, detail } of KNOWN) {
      const seq = researchSequenceMessages({
        firstName: "Jane",
        contractorFirstName: "Mike",
        trade,
        estimateAmount: 5000,
        jobDescription: desc,
        quoteId: `detail-${trade}`,
      });
      expect(seq.day1.toLowerCase()).toContain(detail.toLowerCase());
      expect(seq.day14.toLowerCase()).toContain(detail.toLowerCase());
      expect(seq.day30.toLowerCase()).toContain(detail.toLowerCase());
      // The "for the {detail}" phrasing keeps the trade keyword, so every
      // detail-injected message still passes the validator unchanged.
      for (const [n, msg] of [
        [1, seq.day1],
        [4, seq.day14],
        [5, seq.day30],
      ] as const) {
        const res = validateMessage(msg, {
          firstName: "Jane",
          trade,
          followupNumber: n,
        });
        expect(res.reasons).toEqual([]);
        expect(msg.length).toBeLessThanOrEqual(220);
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
        [2, seq.day3],
        [3, seq.day7],
        [4, seq.day14],
        [5, seq.day30],
      ] as const) {
        const res = validateMessage(msg, {
          firstName: "Jane",
          trade,
          followupNumber: n,
        });
        expect(res.reasons).toEqual([]);
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

  it("HVAC uses the clean 'replacement estimate' label and never stacks an equipment noun", () => {
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
    // Day 3 deliberately uses the bare trade word ("HVAC") for the schedule
    // frame, so the full label only appears on the project-anchored touches.
    for (const day of ["day1", "day7", "day14", "day30"] as const) {
      expect(seq[day]).toContain("HVAC replacement estimate");
    }
    // No awkward equipment-noun stack on ANY touch.
    for (const day of ["day1", "day3", "day7", "day14", "day30"] as const) {
      expect(seq[day]).not.toMatch(
        /estimate for the (furnace|ac|heat pump|mini-split|ductwork)/i,
      );
    }
  });
});
