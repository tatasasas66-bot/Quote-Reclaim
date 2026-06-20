import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BANNED_PHRASES,
  MAX_MESSAGE_CHARS,
  containsBannedPhrase,
  tradeKeywords,
  validateMessage,
} from "@/lib/ai/validate-message";
import {
  FALLBACK_FLOOR_SCORE,
  MIN_AI_SCORE,
  scoreMessage,
} from "@/lib/ai/score-message";
import {
  fallbackMessages,
  projectLabel,
  researchSequenceMessages,
} from "@/lib/ai/fallback-messages";
import {
  generateRecoveryPlan,
  type RecoveryContext,
} from "@/lib/ai/generate-recovery-plan";

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("AI_WRITER_PROVIDER", "groq");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const SCENARIOS: Array<{
  label: string;
  ctx: RecoveryContext;
}> = [
  {
    label: "Roofing $8,500 - Jane",
    ctx: {
      firstName: "Jane",
      contractorFirstName: "Mike",
      trade: "Roofing",
      estimateAmount: 8500,
      jobDescription: "Re-roof main house, asphalt shingles",
    },
  },
  {
    label: "Plumbing $2,400 - Tom",
    ctx: {
      firstName: "Tom",
      contractorFirstName: "Luis",
      trade: "Plumbing",
      estimateAmount: 2400,
      jobDescription: "Replace water heater",
    },
  },
  {
    label: "HVAC $7,900 - Mike",
    ctx: {
      firstName: "Mike",
      contractorFirstName: "Aaron",
      trade: "HVAC",
      estimateAmount: 7900,
      jobDescription: "Replace 3-ton AC + furnace",
    },
  },
  {
    label: "Electrical $4,200 - Sarah",
    ctx: {
      firstName: "Sarah",
      contractorFirstName: "Dana",
      trade: "Electrical",
      estimateAmount: 4200,
      jobDescription: "Panel upgrade to 200A",
    },
  },
  {
    label: "Remodeling $18,000 - David",
    ctx: {
      firstName: "David",
      contractorFirstName: "Chris",
      trade: "Remodeling",
      estimateAmount: 18000,
      jobDescription: "Kitchen remodel",
    },
  },
  {
    label: "General Contracting $12,500 - Amanda",
    ctx: {
      firstName: "Amanda",
      contractorFirstName: "Pat",
      trade: "General Contracting",
      estimateAmount: 12500,
      jobDescription: "Deck + sunroom addition",
    },
  },
];

const DISQUALIFYING_PATTERNS = [
  "Hi Jane, just checking in",
  "just checking in",
  "following up",
  "touching base",
  "circle back",
  "circling back",
  "hope this finds you well",
  "hope you're doing great",
  "leave it hanging",
  "make the next step simple",
  "before you decide",
  "The Team at",
  "tracking link",
  "discount",
  "Bid",
  "Send Now",
];

function validatePlan(ctx: RecoveryContext) {
  return fallbackMessages(ctx).map((m) => ({
    ...m,
    validation: validateMessage(m.message, {
      firstName: ctx.firstName,
      trade: ctx.trade,
      followupNumber: m.followup_number,
    }),
    score: scoreMessage(m.message, {
      firstName: ctx.firstName,
      trade: ctx.trade,
      ctaType: m.cta_type,
      followupNumber: m.followup_number,
    }),
  }));
}

describe("research framework fallback sequence", () => {
  it("Day 1 is an Estimate Check — opens with Hey + name, asks about a number/timing/detail", () => {
    const ctx = SCENARIOS[0].ctx;
    const sequence = researchSequenceMessages(ctx);
    // Day 1 opens with "Hey {Name} —" or "Hey {Name}," (either is valid for variation).
    const opensRight =
      sequence.day1.startsWith("Hey Jane —") ||
      sequence.day1.startsWith("Hey Jane,");
    expect(opensRight).toBe(true);
    // Surfaces the clarity-check intent.
    expect(sequence.day1).toMatch(
      /looked back over|went back through|reviewed .* again|looked over .* again/i,
    );
    expect(sequence.day1).toMatch(/the roofing estimate/);
    expect(sequence.day1).not.toMatch(/just checking in/i);
  });

  it("Day 3 is a Schedule Check — active-list / move-it-off / pause framing, never fake slot scarcity", () => {
    const ctx = SCENARIOS[0].ctx;
    const sequence = researchSequenceMessages(ctx);
    expect(sequence.day3.startsWith("Jane,")).toBe(true);
    expect(sequence.day3).not.toMatch(/^(Hi|Hey)\b/);
    // Schedule-check intent — keep active / move off / set aside / pause.
    expect(sequence.day3).toMatch(
      /active list|active|set it aside|pause it|move it off/i,
    );
    // Trade keyword appears (now required on Day 3).
    expect(sequence.day3.toLowerCase()).toContain("roofing");
    // No fake-scarcity phrases.
    expect(sequence.day3).not.toMatch(
      /releasing it|let the slot go|locking the schedule today|holding a slot/i,
    );
  });

  it("Day 7 is a Scope Rescue — no greeting, no name, offers a lower-commitment path", () => {
    const ctx = SCENARIOS[0].ctx;
    const sequence = researchSequenceMessages(ctx);
    expect(sequence.day7).not.toMatch(/^Jane\b/);
    expect(sequence.day7).not.toMatch(/^(Hi|Hey)\b/);
    expect(sequence.day7).not.toContain("Jane");
    expect(sequence.day7).toMatch(
      /separate|break it into|phase|must-do|later pieces|holding things up|simpler path/i,
    );
    expect(sequence.day7).not.toMatch(/discount|cheaper|price drop/i);
  });

  it("omits the sender identity clause when the contractor name is unknown (no 'Contractor here' placeholder)", () => {
    const sequence = researchSequenceMessages({
      firstName: "Rita",
      contractorFirstName: null,
      trade: "Roofing",
      estimateAmount: 9000,
    });
    expect(sequence.day1).toMatch(/^Hey Rita — I looked back over/);
    expect(sequence.day1).not.toContain("Contractor here");
  });

  for (const { label, ctx } of SCENARIOS) {
    describe(label, () => {
      const expected = researchSequenceMessages(ctx);
      const plan = fallbackMessages(ctx);

      it("has exactly 5 messages numbered 1..5", () => {
        expect(plan).toHaveLength(5);
        expect(plan.map((m) => m.followup_number)).toEqual([1, 2, 3, 4, 5]);
      });

      it("uses the research frameworks in order (5 touches)", () => {
        expect(plan.map((m) => m.framework)).toEqual([
          "Estimate Check",
          "Schedule Check",
          "Scope Rescue",
          "Decision Check",
          "Clean Closeout",
        ]);
      });

      it("returns the exact fallback sequence (5 days)", () => {
        expect(plan.map((m) => m.message)).toEqual([
          expected.day1,
          expected.day3,
          expected.day7,
          expected.day14,
          expected.day30,
        ]);
      });

      it("keeps the asymmetrical naming pattern across the new 5 touches", () => {
        // Day 1 opens with "Hey {Name} —" OR "Hey {Name}," — both are valid
        // contractor openings and the rewrite uses both for variation.
        const day1OpensRight =
          plan[0].message.startsWith(`Hey ${ctx.firstName} —`) ||
          plan[0].message.startsWith(`Hey ${ctx.firstName},`);
        expect(day1OpensRight).toBe(true);
        expect(plan[1].message.startsWith(`${ctx.firstName},`)).toBe(true);
        // Day 7 (Scope Rescue) — no greeting, no name.
        expect(plan[2].message).not.toMatch(new RegExp(`^(Hi|Hey)\\b`, "i"));
        expect(plan[2].message).not.toContain(ctx.firstName);
        // Day 14 + Day 30 lead with the client name like Day 3.
        expect(plan[3].message.startsWith(`${ctx.firstName},`)).toBe(true);
        expect(plan[4].message.startsWith(`${ctx.firstName},`)).toBe(true);
      });

      it("includes the project label in Day 1, Day 7, Day 14, and Day 30", () => {
        const project = projectLabel(ctx.trade).toLowerCase();
        const messages = plan.map((m) => m.message.toLowerCase());
        expect(messages[0]).toContain(project); // Day 1
        expect(messages[2]).toContain(project); // Day 7
        expect(messages[3]).toContain(project); // Day 14
        expect(messages[4]).toContain(project); // Day 30
        // Day 3 uses a schedule/slot frame intentionally without the project label.
      });

      it("passes validation, scores above the fallback floor, and stays concise", () => {
        for (const item of validatePlan(ctx)) {
          expect(item.validation.ok).toBe(true);
          expect(item.validation.reasons).toEqual([]);
          expect(item.score).toBeGreaterThanOrEqual(FALLBACK_FLOOR_SCORE);
          expect(item.message.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
          // Day 30 (followup_number 5) is the Clean Closeout — declarative, 0 questions.
          // Every other day must carry exactly one.
          const expectedQuestions = item.followup_number === 5 ? 0 : 1;
          expect((item.message.match(/\?/g) ?? []).length).toBe(expectedQuestions);
        }
      });

      it("does not repeat a robotic greeting pattern", () => {
        const starts = plan.map((m) => m.message.trim());
        expect(starts.every((m) => /^Hi\b/i.test(m))).toBe(false);
        expect(starts.every((m) => m.startsWith(ctx.firstName))).toBe(false);
      });

      it("contains none of the disqualifying patterns", () => {
        const joined = plan.map((m) => m.message).join("\n");
        for (const pattern of DISQUALIFYING_PATTERNS) {
          expect(joined).not.toMatch(new RegExp(pattern, "i"));
        }
      });
    });
  }
});

describe("validateMessage", () => {
  it("rejects every disqualifying phrase", () => {
    for (const phrase of DISQUALIFYING_PATTERNS) {
      const sample = `Jane, ${phrase} about the roofing estimate. Any questions?`;
      const result = validateMessage(sample, {
        firstName: "Jane",
        trade: "Roofing",
        followupNumber: 2,
      });
      expect(result.ok).toBe(false);
      expect(containsBannedPhrase(sample)).not.toBeNull();
    }
  });

  it("rejects more than one question mark", () => {
    const result = validateMessage(
      "Hey Jane — Mike here. Looked back at your roofing estimate. Anything unclear? Any number you want me to walk through?",
      { firstName: "Jane", trade: "Roofing", followupNumber: 1 },
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.some((x) => x.includes("exactly one question"))).toBe(
      true,
    );
  });

  it("rejects emojis, exclamation marks, and links", () => {
    const samples = [
      "Jane, putting next week's roofing install schedule together! What works?",
      "Jane, putting next week's roofing install schedule together. What works? https://example.com",
      "Jane, putting next week's roofing install schedule together. What works? 🙂",
    ];
    for (const sample of samples) {
      const result = validateMessage(sample, {
        firstName: "Jane",
        trade: "Roofing",
        followupNumber: 2,
      });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects messages over the concise SMS ceiling", () => {
    const long =
      "Hey Jane — Mike here. " +
      "roofing estimate details ".repeat(10) +
      "Anything on it that didn't make sense?";
    const result = validateMessage(long, {
      firstName: "Jane",
      trade: "Roofing",
      followupNumber: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((x) => x.includes(String(MAX_MESSAGE_CHARS)))).toBe(
      true,
    );
  });

  it("allows Day 7 to omit the client name but rejects a Day 7 greeting", () => {
    const good = researchSequenceMessages(SCENARIOS[0].ctx).day7;
    expect(
      validateMessage(good, {
        firstName: "Jane",
        trade: "Roofing",
        followupNumber: 3,
      }).ok,
    ).toBe(true);

    const bad =
      "Hi Jane, have you given up on the roofing? If so, I'll close out the file — no problem either way.";
    const result = validateMessage(bad, {
      firstName: "Jane",
      trade: "Roofing",
      followupNumber: 3,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((x) => x.includes("greeting"))).toBe(true);
  });
});

describe("tradeKeywords and scoring", () => {
  it("extracts trade keywords", () => {
    expect(tradeKeywords("Roofing")).toEqual(["roofing"]);
    expect(tradeKeywords("HVAC")).toEqual(["hvac"]);
    expect(tradeKeywords("General Contracting")).toEqual([
      "general",
      "contracting",
    ]);
    expect(tradeKeywords("Roofing and Siding")).toEqual(["roofing", "siding"]);
  });

  it("zeroes a banned-phrase message", () => {
    const score = scoreMessage(
      "Jane, following up on the roofing estimate. Any questions?",
      { firstName: "Jane", trade: "Roofing", followupNumber: 2 },
    );
    expect(score).toBe(0);
  });

  it("does not penalize the required Day 7 no-name pattern", () => {
    const msg = researchSequenceMessages(SCENARIOS[0].ctx).day7;
    expect(
      scoreMessage(msg, {
        firstName: "Jane",
        trade: "Roofing",
        followupNumber: 3,
      }),
    ).toBeGreaterThanOrEqual(FALLBACK_FLOOR_SCORE);
  });

  it("the constants are sane", () => {
    expect(MIN_AI_SCORE).toBe(75);
    expect(FALLBACK_FLOOR_SCORE).toBe(85);
    expect(FALLBACK_FLOOR_SCORE).toBeGreaterThanOrEqual(MIN_AI_SCORE);
  });
});

describe("generateRecoveryPlan", () => {
  it("returns 5 fallback messages and never throws when no writer key is configured", async () => {
    const plan = await generateRecoveryPlan(SCENARIOS[0].ctx);
    expect(plan).toHaveLength(5);
    expect(plan.every((m) => m.source === "fallback")).toBe(true);
    expect(plan.map((m) => m.message)).toEqual(
      Object.values(researchSequenceMessages(SCENARIOS[0].ctx)),
    );
  });

  it("accepts AI output only when it matches the exact research sequence (5 messages)", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key-not-real");
    const ctx = SCENARIOS[0].ctx;
    const sequence = researchSequenceMessages(ctx);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  messages: [
                    {
                      followup_number: 1,
                      framework: "Estimate Check",
                      message: sequence.day1,
                      cta_type: "question",
                      confidence: 1,
                    },
                    {
                      followup_number: 2,
                      framework: "Schedule Check",
                      message: sequence.day3,
                      cta_type: "question",
                      confidence: 1,
                    },
                    {
                      followup_number: 3,
                      framework: "Scope Rescue",
                      message: sequence.day7,
                      cta_type: "question",
                      confidence: 1,
                    },
                    {
                      followup_number: 4,
                      framework: "Decision Check",
                      message: sequence.day14,
                      cta_type: "question",
                      confidence: 1,
                    },
                    {
                      followup_number: 5,
                      framework: "Clean Closeout",
                      message: sequence.day30,
                      cta_type: "statement",
                      confidence: 1,
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const plan = await generateRecoveryPlan(ctx);
    expect(plan).toHaveLength(5);
    expect(plan.every((m) => m.source === "ai")).toBe(true);
    expect(plan.map((m) => m.message)).toEqual(Object.values(sequence));
  });

  it("falls back when AI paraphrases the strategy", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key-not-real");
    const badPayload = {
      messages: [
        {
          followup_number: 1,
          framework: "Estimate Check",
          message:
            "Hey Jane — Mike here. Looked back at your roofing estimate. Want me to make the next step simple?",
          cta_type: "question",
        },
        {
          followup_number: 2,
          framework: "Schedule Check",
          message:
            "Jane, touching base on the roofing schedule. Want me to hold your spot?",
          cta_type: "question",
        },
        {
          followup_number: 3,
          framework: "Close-the-Loop",
          message:
            "Jane, have you given up on the roofing? I can leave it hanging if needed.",
          cta_type: "question",
        },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(badPayload) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const plan = await generateRecoveryPlan(SCENARIOS[0].ctx);
    expect(plan.every((m) => m.source === "fallback")).toBe(true);
    expect(plan.map((m) => m.message)).toEqual(
      Object.values(researchSequenceMessages(SCENARIOS[0].ctx)),
    );
  });
});

describe("source-level guardrails", () => {
  it("BANNED_PHRASES includes the research disqualifiers", () => {
    const required = [
      "just checking in",
      "following up",
      "touching base",
      "circle back",
      "hope this finds you well",
      "hope you're doing great",
      "leave it hanging",
      "make the next step simple",
      "before you decide",
      "the team at",
      "discount",
      "send now",
      "bid",
    ];
    for (const phrase of required) {
      expect(BANNED_PHRASES.map((s) => s.toLowerCase())).toContain(phrase);
    }
  });
});
