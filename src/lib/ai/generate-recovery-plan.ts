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
  const sequence = researchSequenceMessages(ctx);

  const system = `You write SMS recovery plans for high-ticket home service contractors after a homeowner has gone quiet on an estimate.

SOURCE OF TRUTH:
"Engineering a 3-Step SMS Sequence for High-Ticket Home Service Contractors: Research Dossier & Framework"

Do not reinterpret the strategy. Return the exact three-step sequence with the provided variables inserted.

MESSAGE STRATEGY:
1. Casual Pattern Interrupt - warm-direct. Confirm receipt, disarm defensiveness, surface hidden objections around clarity and price.
2. Authority & Status Squeeze - cold-confident. Use the contractor schedule / slot frame exactly. No greeting, no apology, no begging, no discount.
3. Professional Closeout - emotionless-final. No name, no greeting. Use the no-oriented closeout question exactly.

VARIABLE RULES:
- {FirstName} comes from the homeowner first name.
- {ContractorFirstName} comes from the contractor first name when available; otherwise use the supplied fallback.
- {project} is the trade/project label and must appear in every message.
- Day 1 starts with "Hey {FirstName} —".
- Day 3 starts with "{FirstName}," and does not use "Hey" or "Hi".
- Day 7 starts with "Have you given up on the {project}?" and uses no name or greeting.

NEVER use disqualifying patterns:
"Hi {Name}, just checking in", "just checking in", "following up", "touching base", "circle back", "circling back", "hope this finds you well", "hope you're doing great", "leave it hanging", "make the next step simple", "before you decide", emojis, exclamation marks, unsolicited discounts, guilt language, generic company signatures, "The Team at", tracking links, or manufactured price-drop urgency.

NEVER use exclamation marks.

The exact Day 7 sentence "Just need a yes or no so I can clear it from my list." is allowed because it is part of the source framework. Do not use "just" anywhere else.

Return JSON only, no markdown, no commentary:
{
  "messages": [
    { "followup_number": 1, "framework": "Casual Pattern Interrupt", "message": "${sequence.day1}", "cta_type": "question", "confidence": 1 },
    { "followup_number": 2, "framework": "Authority & Status Squeeze", "message": "${sequence.day3}", "cta_type": "question", "confidence": 1 },
    { "followup_number": 3, "framework": "Professional Closeout", "message": "${sequence.day7}", "cta_type": "question", "confidence": 1 }
  ]
}`;

  const user = `Generate the exact three-message recovery sequence.

firstName: ${ctx.firstName}
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
