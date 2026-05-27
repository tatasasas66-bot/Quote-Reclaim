import { z } from "zod";
import { AIUnavailableError, callAI, type ChatMessage } from "./call-ai";
import {
  fallbackMessages,
  projectLabel,
  researchSequenceMessages,
} from "./fallback-messages";
import { isWriterAvailable } from "./router";
import { scoreMessage, MIN_AI_SCORE } from "./score-message";
import { validateMessage } from "./validate-message";
import { titleCase } from "@/lib/utils/normalize";

export type RecoveryFramework =
  | "Casual Pattern Interrupt"
  | "Authority & Status Squeeze"
  | "Professional Closeout";

export type RecoveryMessage = {
  followup_number: 1 | 2 | 3;
  framework: RecoveryFramework;
  message: string;
  cta_type: string;
  source: "ai" | "fallback";
  score: number;
};

export type RecoveryContext = {
  firstName: string;
  contractorFirstName?: string | null;
  trade: string;
  estimateAmount: number;
  jobDescription?: string | null;
  city?: string | null;
  state?: string | null;
};

const FRAMEWORK_BY_NUMBER: Record<1 | 2 | 3, RecoveryFramework> = {
  1: "Casual Pattern Interrupt",
  2: "Authority & Status Squeeze",
  3: "Professional Closeout",
};

const aiResponseSchema = z.object({
  messages: z
    .array(
      z.object({
        followup_number: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        framework: z.string().optional(),
        message: z.string().min(1),
        cta_type: z.string().optional(),
        confidence: z.number().optional(),
      }),
    )
    .length(3),
});

function expectedMessage(
  ctx: RecoveryContext,
  followupNumber: 1 | 2 | 3,
): string {
  const sequence = researchSequenceMessages(ctx);
  if (followupNumber === 1) return sequence.day1;
  if (followupNumber === 2) return sequence.day3;
  return sequence.day7;
}

function buildPrompt(ctx: RecoveryContext): ChatMessage[] {
  const project = projectLabel(ctx.trade);
  const contractorFirstName =
    (ctx.contractorFirstName ?? "").trim().split(/\s+/)[0] || "Contractor";
  const name = titleCase(ctx.firstName ?? "");

  const system = `You generate SMS follow-up messages for US home-service contractors chasing silent estimates. Each message must:

VOICE AND TONE:
- Sound like a confident, busy tradesperson — not a salesperson
- Blue-collar direct: short declarative sentences, no qualifiers
- Never needy, never apologetic, never explain why you're following up
- The contractor is highly demanded — this homeowner is one of many

FORMAT RULES (non-negotiable):
- Under 220 characters total
- No exclamation marks
- No emoji
- No "just", "wanted to", "hope you're doing well", "circling back"
- No company name — contractor first name only
- No tracking links

DAY 1 — Pattern Interrupt:
Start with "Hey {firstName} —" (only use Hey on Day 1).
Identify yourself by first name.
Reference the specific trade/project.
Surface ONE objection: scope confusion OR price concern.
End with an easy, open-ended question.
Target: 150-180 characters.

DAY 3 — Authority Frame:
Start with "{firstName}," (name only, no greeting word).
Invoke your schedule/calendar as the scarce resource.
Create a binary choice: hold their slot or release it.
End with "What works?" or equivalent decisional question.
Target: 120-150 characters.
NEVER offer a discount. NEVER apologize for the timeline.

DAY 7 — Voss Takeaway Close:
NO name. NO greeting. Start directly with the question.
Use Chris Voss no-oriented structure: "Have you given up on..."
Explicitly withdraw: "I'll close the file."
Offer relief: "no problem either way."
Force binary: "just need a yes or no."
Target: 140-165 characters.
This must feel like a foreman clearing a job board — zero emotion.

NEVER use: "just checking in", "following up", "touching base", "circling back", "hope this finds you well", "hope you're doing great", "leave it hanging", "make the next step simple", "before you decide", emojis, exclamation marks, unsolicited discounts, guilt language, generic company signatures, tracking links.

Return JSON only, no markdown, no commentary:
{
  "messages": [
    { "followup_number": 1, "framework": "Casual Pattern Interrupt", "message": "...", "cta_type": "question", "confidence": 1 },
    { "followup_number": 2, "framework": "Authority & Status Squeeze", "message": "...", "cta_type": "question", "confidence": 1 },
    { "followup_number": 3, "framework": "Professional Closeout", "message": "...", "cta_type": "question", "confidence": 1 }
  ]
}`;

  const user = `Generate the exact three-message recovery sequence.

firstName: ${name}
contractorFirstName: ${contractorFirstName}
trade: ${ctx.trade}
project: ${project}
estimateAmount: $${ctx.estimateAmount.toLocaleString("en-US")}
jobDescription: ${ctx.jobDescription ? ctx.jobDescription : "(not provided)"}
location: ${[ctx.city, ctx.state].filter(Boolean).join(", ") || "(not provided)"}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function attemptAI(ctx: RecoveryContext): Promise<RecoveryMessage[] | null> {
  let raw: string;
  try {
    raw = await callAI(buildPrompt(ctx), {
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 700,
    });
  } catch (err) {
    if (err instanceof AIUnavailableError) return null;
    return null;
  }

  let parsed;
  try {
    parsed = aiResponseSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }

  const ordered = [...parsed.messages].sort(
    (a, b) => a.followup_number - b.followup_number,
  );
  const numbers = ordered.map((m) => m.followup_number);
  if (numbers[0] !== 1 || numbers[1] !== 2 || numbers[2] !== 3) return null;

  const out: RecoveryMessage[] = [];
  for (const m of ordered) {
    const ctaType = (m.cta_type ?? "question").toString();
    const expected = expectedMessage(ctx, m.followup_number);
    if (m.message.trim() !== expected) return null;

    const validation = validateMessage(m.message, {
      firstName: ctx.firstName,
      trade: ctx.trade,
      followupNumber: m.followup_number,
    });
    if (!validation.ok) return null;

    const score = scoreMessage(m.message, {
      firstName: ctx.firstName,
      trade: ctx.trade,
      ctaType,
      followupNumber: m.followup_number,
    });
    if (score < MIN_AI_SCORE) return null;
    out.push({
      followup_number: m.followup_number,
      framework: FRAMEWORK_BY_NUMBER[m.followup_number],
      message: m.message.trim(),
      cta_type: ctaType,
      source: "ai",
      score,
    });
  }
  return out;
}

function fallbackPlan(ctx: RecoveryContext): RecoveryMessage[] {
  const plan = fallbackMessages(ctx);
  return plan.map((m) => ({
    ...m,
    score: scoreMessage(m.message, {
      firstName: ctx.firstName,
      trade: ctx.trade,
      ctaType: m.cta_type,
      followupNumber: m.followup_number,
    }),
  }));
}

/**
 * Generate a 3-step recovery plan. Tries the configured writer twice, then
 * falls back to deterministic research templates. Never throws to the caller.
 */
export async function generateRecoveryPlan(
  ctx: RecoveryContext,
): Promise<RecoveryMessage[]> {
  if (!isWriterAvailable()) return fallbackPlan(ctx);

  const first = await attemptAI(ctx);
  if (first) return first;

  const second = await attemptAI(ctx);
  if (second) return second;

  return fallbackPlan(ctx);
}
