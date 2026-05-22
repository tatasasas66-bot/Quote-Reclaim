import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BANNED_PHRASES,
  containsBannedPhrase,
  validateMessage,
  tradeKeywords,
} from "@/lib/ai/validate-message";
import {
  scoreMessage,
  MIN_AI_SCORE,
  FALLBACK_FLOOR_SCORE,
} from "@/lib/ai/score-message";
import { fallbackMessages } from "@/lib/ai/fallback-messages";
import {
  generateRecoveryPlan,
  type RecoveryContext,
} from "@/lib/ai/generate-recovery-plan";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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
    label: "Roofing $8,500 — Jane",
    ctx: {
      firstName: "Jane",
      trade: "Roofing",
      estimateAmount: 8500,
      jobDescription: "Re-roof main house, asphalt shingles",
    },
  },
  {
    label: "Plumbing $2,400 — Tom",
    ctx: {
      firstName: "Tom",
      trade: "Plumbing",
      estimateAmount: 2400,
      jobDescription: "Replace water heater",
    },
  },
  {
    label: "HVAC $7,900 — Mike",
    ctx: {
      firstName: "Mike",
      trade: "HVAC",
      estimateAmount: 7900,
      jobDescription: "Replace 3-ton AC + furnace",
    },
  },
  {
    label: "Electrical $4,200 — Sarah",
    ctx: {
      firstName: "Sarah",
      trade: "Electrical",
      estimateAmount: 4200,
      jobDescription: "Panel upgrade to 200A",
    },
  },
  {
    label: "Remodeling $18,000 — David",
    ctx: {
      firstName: "David",
      trade: "Remodeling",
      estimateAmount: 18000,
      jobDescription: "Kitchen remodel",
    },
  },
  {
    label: "General Contracting $12,500 — Amanda",
    ctx: {
      firstName: "Amanda",
      trade: "General Contracting",
      estimateAmount: 12500,
      jobDescription: "Deck + sunroom addition",
    },
  },
];

// ---------------------------------------------------------------------------
// validateMessage — every banned phrase must fail
// ---------------------------------------------------------------------------

describe("validateMessage: banned phrases", () => {
  const BAD_INPUTS: Array<{ phrase: string; sample: string }> = [
    {
      phrase: "just following up",
      sample:
        "Hi Jane, just following up on the roofing estimate. Any questions?",
    },
    {
      phrase: "just checking in",
      sample: "Hi Jane, just checking in on the roofing quote. Any questions?",
    },
    {
      phrase: "checking back",
      sample: "Hi Jane, checking back on the roofing job. Any questions?",
    },
    {
      phrase: "touching base",
      sample: "Hi Jane, touching base about the roofing project. Any update?",
    },
    {
      phrase: "circling back",
      sample:
        "Hi Jane, circling back on the roofing estimate. Any questions for me?",
    },
    {
      phrase: "wanted to follow up",
      sample:
        "Hi Jane, wanted to follow up on the roofing estimate. Any questions?",
    },
    {
      phrase: "checking in to see",
      sample:
        "Hi Jane, checking in to see if you had questions on the roofing job?",
    },
    {
      phrase: "quick reminder",
      sample:
        "Hi Jane, quick reminder about the roofing estimate. Any questions?",
    },
    {
      phrase: "final reminder",
      sample:
        "Hi Jane, this is a final reminder about the roofing estimate. Any questions?",
    },
    {
      phrase: "one final follow-up",
      sample:
        "Hi Jane, one final follow-up on the roofing quote. Any questions?",
    },
    {
      phrase: "last chance",
      sample:
        "Hi Jane, last chance on the roofing quote pricing. Any questions?",
    },
    {
      phrase: "act now",
      sample: "Hi Jane, act now on the roofing estimate. Any questions?",
    },
    {
      phrase: "don't miss out",
      sample:
        "Hi Jane, don't miss out on the roofing slot pricing. Any questions?",
    },
    {
      phrase: "AI-generated",
      sample:
        "Hi Jane, this is an AI-generated note about the roofing quote. Any questions?",
    },
    {
      phrase: "our system",
      sample:
        "Hi Jane, our system flagged your roofing quote. Any questions today?",
    },
    {
      phrase: "optimize",
      sample:
        "Hi Jane, we can optimize the roofing scope. Any questions for me?",
    },
    {
      phrase: "leverage",
      sample:
        "Hi Jane, we can leverage volume pricing on the roofing job. Any questions?",
    },
    {
      phrase: "please don't hesitate",
      sample:
        "Hi Jane, please don't hesitate about the roofing quote. Any questions?",
    },
    {
      phrase: "looking forward to hearing",
      sample:
        "Hi Jane, looking forward to hearing about the roofing job. Any questions?",
    },
    {
      phrase: "happy to help",
      sample:
        "Hi Jane, happy to help on the roofing estimate. Any questions today?",
    },
    {
      phrase: "on file",
      sample:
        "Hi Jane, I'll keep the roofing estimate on file. Any questions?",
    },
    {
      phrase: "no problem whenever you're ready",
      sample:
        "Hi Jane, no problem whenever you're ready on the roofing job. Any questions?",
    },
  ];

  for (const { phrase, sample } of BAD_INPUTS) {
    it(`rejects "${phrase}"`, () => {
      const result = validateMessage(sample, {
        firstName: "Jane",
        trade: "Roofing",
      });
      expect(result.ok).toBe(false);
      expect(containsBannedPhrase(sample)).not.toBeNull();
    });
  }

  it("rejects more than one question mark", () => {
    const r = validateMessage(
      "Hi Jane, the roofing estimate is ready? Are you free to chat?",
      { firstName: "Jane", trade: "Roofing" },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("more than one question"))).toBe(
      true,
    );
  });

  it("rejects emojis", () => {
    const r = validateMessage(
      "Hi Jane, the roofing quote is ready 👋 Any questions?",
      { firstName: "Jane", trade: "Roofing" },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("emoji"))).toBe(true);
  });

  it("rejects messages over 320 chars", () => {
    const long =
      "Hi Jane, " + "roofing scope is clear ".repeat(20) + "any questions?";
    const r = validateMessage(long, { firstName: "Jane", trade: "Roofing" });
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("320"))).toBe(true);
  });

  it("rejects 'final' framing", () => {
    const r = validateMessage(
      "Hi Jane, here is the final roofing note. Any questions?",
      { firstName: "Jane", trade: "Roofing" },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects when client first name is missing", () => {
    const r = validateMessage(
      "Hi there, the roofing estimate is ready. Any questions?",
      { firstName: "Jane", trade: "Roofing" },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("first name"))).toBe(true);
  });

  it("rejects when trade is missing", () => {
    const r = validateMessage(
      "Hi Jane, the estimate is ready. Any questions before you decide?",
      { firstName: "Jane", trade: "Roofing" },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("trade"))).toBe(true);
  });

  it("rejects fake availability promises", () => {
    const r = validateMessage(
      "Hi Jane, I have a slot open Tuesday for the roofing work. Want it?",
      { firstName: "Jane", trade: "Roofing" },
    );
    expect(r.ok).toBe(false);
  });
});

describe("validateMessage: accepts well-formed messages", () => {
  it("accepts the roofing reassurance fallback", () => {
    const msg =
      "Hi Jane, I sent the roofing estimate over. If scope, materials, or warranty details are unclear, I can clean that up quickly. Any questions before you decide?";
    const r = validateMessage(msg, { firstName: "Jane", trade: "Roofing" });
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// tradeKeywords
// ---------------------------------------------------------------------------

describe("tradeKeywords", () => {
  it("returns 'roofing' for 'Roofing'", () => {
    expect(tradeKeywords("Roofing")).toEqual(["roofing"]);
  });
  it("returns 'hvac' for 'HVAC'", () => {
    expect(tradeKeywords("HVAC")).toEqual(["hvac"]);
  });
  it("splits 'general contracting' into both words", () => {
    expect(tradeKeywords("General Contracting")).toEqual([
      "general",
      "contracting",
    ]);
  });
  it("strips stopwords", () => {
    expect(tradeKeywords("Roofing and Siding")).toEqual(["roofing", "siding"]);
  });
});

// ---------------------------------------------------------------------------
// scoreMessage
// ---------------------------------------------------------------------------

describe("scoreMessage", () => {
  it("zeroes a banned-phrase message", () => {
    const score = scoreMessage(
      "Hi Jane, just following up on the roofing quote. Any questions?",
      { firstName: "Jane", trade: "Roofing" },
    );
    expect(score).toBe(0);
  });

  it("penalises missing first name", () => {
    const good =
      "Hi Jane, the roofing scope and warranty are ready to review. Any questions before you decide?";
    const bad =
      "Hi there, the roofing scope and warranty are ready to review. Any questions before you decide?";
    expect(scoreMessage(good, { firstName: "Jane", trade: "Roofing" })).toBeGreaterThan(
      scoreMessage(bad, { firstName: "Jane", trade: "Roofing" }),
    );
  });

  it("the constants are sane", () => {
    expect(MIN_AI_SCORE).toBe(75);
    expect(FALLBACK_FLOOR_SCORE).toBe(85);
    expect(FALLBACK_FLOOR_SCORE).toBeGreaterThanOrEqual(MIN_AI_SCORE);
  });
});

// ---------------------------------------------------------------------------
// Fallback per-trade
// ---------------------------------------------------------------------------

describe("fallback per-trade", () => {
  for (const { label, ctx } of SCENARIOS) {
    describe(label, () => {
      const plan = fallbackMessages(ctx);

      it("has exactly 3 messages numbered 1/2/3", () => {
        expect(plan).toHaveLength(3);
        expect(plan.map((m) => m.followup_number)).toEqual([1, 2, 3]);
      });

      for (let i = 0; i < 3; i++) {
        it(`message ${i + 1} passes validation`, () => {
          const result = validateMessage(plan[i].message, {
            firstName: ctx.firstName,
            trade: ctx.trade,
          });
          expect(result.ok).toBe(true);
          expect(result.reasons).toEqual([]);
        });

        it(`message ${i + 1} scores >= ${FALLBACK_FLOOR_SCORE}`, () => {
          const score = scoreMessage(plan[i].message, {
            firstName: ctx.firstName,
            trade: ctx.trade,
            ctaType: plan[i].cta_type,
          });
          expect(score).toBeGreaterThanOrEqual(FALLBACK_FLOOR_SCORE);
        });

        it(`message ${i + 1} is under 320 chars`, () => {
          expect(plan[i].message.length).toBeLessThanOrEqual(320);
        });

        it(`message ${i + 1} contains the first name and a trade keyword`, () => {
          const m = plan[i].message.toLowerCase();
          expect(m).toContain(ctx.firstName.toLowerCase());
          const kws = tradeKeywords(ctx.trade);
          expect(kws.some((k) => m.includes(k))).toBe(true);
        });

        it(`message ${i + 1} has exactly one question mark`, () => {
          const count = (plan[i].message.match(/\?/g) ?? []).length;
          expect(count).toBe(1);
        });

        it(`message ${i + 1} contains no banned phrase`, () => {
          expect(containsBannedPhrase(plan[i].message)).toBeNull();
        });
      }
    });
  }

  it("frameworks are assigned in order", () => {
    const plan = fallbackMessages(SCENARIOS[0].ctx);
    expect(plan[0].framework).toBe("Specific Reassurance");
    expect(plan[1].framework).toBe("Easy Next Step");
    expect(plan[2].framework).toBe("Permission-Based Check-In");
  });
});

// ---------------------------------------------------------------------------
// generateRecoveryPlan integration
// ---------------------------------------------------------------------------

describe("generateRecoveryPlan: GROQ_API_KEY missing → fallback path", () => {
  it("returns 3 fallback messages and never throws", async () => {
    const plan = await generateRecoveryPlan(SCENARIOS[0].ctx);
    expect(plan).toHaveLength(3);
    expect(plan.every((m) => m.source === "fallback")).toBe(true);
  });

  for (const { label, ctx } of SCENARIOS) {
    it(`produces a valid, scored 3-step plan for ${label}`, async () => {
      const plan = await generateRecoveryPlan(ctx);
      expect(plan).toHaveLength(3);
      for (const m of plan) {
        const v = validateMessage(m.message, {
          firstName: ctx.firstName,
          trade: ctx.trade,
        });
        expect(v.ok).toBe(true);
        expect(m.score).toBeGreaterThanOrEqual(FALLBACK_FLOOR_SCORE);
      }
    });
  }
});

describe("generateRecoveryPlan: malformed AI output → fallback", () => {
  it("falls back when the AI returns non-JSON garbage", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key-not-real");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "this is not json at all" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const plan = await generateRecoveryPlan(SCENARIOS[0].ctx);

    expect(plan).toHaveLength(3);
    expect(plan.every((m) => m.source === "fallback")).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("falls back when the AI returns valid JSON but a banned phrase", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key-not-real");
    const badPayload = {
      messages: [
        {
          followup_number: 1,
          framework: "Specific Reassurance",
          message:
            "Hi Jane, just following up on the roofing estimate. Any questions?",
          cta_type: "question",
          confidence: 0.9,
        },
        {
          followup_number: 2,
          framework: "Easy Next Step",
          message:
            "Hi Jane, just following up again on the roofing estimate. Any questions?",
          cta_type: "question",
          confidence: 0.9,
        },
        {
          followup_number: 3,
          framework: "Permission-Based Check-In",
          message:
            "Hi Jane, just following up one last time on the roofing estimate. Any questions?",
          cta_type: "question",
          confidence: 0.9,
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
    for (const m of plan) expect(containsBannedPhrase(m.message)).toBeNull();
  });

  it("falls back when AI output scores below MIN_AI_SCORE", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key-not-real");
    // Valid format, no banned phrases, but missing trade word -> low score
    const lowScorePayload = {
      messages: [
        {
          followup_number: 1,
          framework: "Specific Reassurance",
          message:
            "Hi Jane, the estimate is ready. Want to chat tomorrow morning sometime?",
          cta_type: "question",
        },
        {
          followup_number: 2,
          framework: "Easy Next Step",
          message:
            "Hi Jane, the estimate is ready. Want to chat tomorrow morning sometime?",
          cta_type: "question",
        },
        {
          followup_number: 3,
          framework: "Permission-Based Check-In",
          message:
            "Hi Jane, the estimate is ready. Want to chat tomorrow morning sometime?",
          cta_type: "question",
        },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify(lowScorePayload) } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const plan = await generateRecoveryPlan(SCENARIOS[0].ctx);
    expect(plan.every((m) => m.source === "fallback")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Source-level invariants — no Twilio/Resend yet
// ---------------------------------------------------------------------------

describe("Phase 5 boundary: no Twilio/Resend integration yet", () => {
  it("BANNED_PHRASES list includes every required entry", () => {
    const required = [
      "just following up",
      "just checking in",
      "checking back",
      "touching base",
      "circling back",
      "wanted to follow up",
      "checking in to see",
      "quick reminder",
      "final reminder",
      "one final follow-up",
      "last chance",
      "act now",
      "ai-generated",
      "our system",
      "optimize",
      "leverage",
      "looking forward to hearing",
      "happy to help",
      "on file",
    ];
    for (const p of required) {
      expect(BANNED_PHRASES.map((s) => s.toLowerCase())).toContain(p);
    }
  });
});
