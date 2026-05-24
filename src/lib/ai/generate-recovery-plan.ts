import { z } from "zod";
import { AIUnavailableError, callAI, type ChatMessage } from "./call-ai";
import { fallbackMessages } from "./fallback-messages";
import { isWriterAvailable } from "./router";
import { scoreMessage, MIN_AI_SCORE } from "./score-message";
import { validateMessage } from "./validate-message";

export type RecoveryFramework =
  | "Specific Reassurance"
  | "Easy Next Step"
  | "Permission-Based Check-In";

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
  trade: string;
  estimateAmount: number;
  jobDescription?: string | null;
  city?: string | null;
  state?: string | null;
};

const FRAMEWORK_BY_NUMBER: Record<1 | 2 | 3, RecoveryFramework> = {
  1: "Specific Reassurance",
  2: "Easy Next Step",
  3: "Permission-Based Check-In",
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

function buildPrompt(ctx: RecoveryContext): ChatMessage[] {
  const bracket =
    ctx.estimateAmount < 500
      ? "Under $500: keep it very short, low-pressure, simple scheduling."
      : ctx.estimateAmount < 1500
        ? "$500-$1,500: emphasize convenience, prevention, a clear next step."
        : ctx.estimateAmount < 5000
          ? "$1,500-$5,000: emphasize scope clarity, trust, timing."
          : ctx.estimateAmount < 15000
            ? "$5,000-$15,000: emphasize options, timing, process clarity, stakeholder comfort."
            : "$15,000+: be stakeholder-friendly and summary-oriented; low-pressure; easy to share or ask questions.";

  const system = `You write SMS follow-ups from a small-business contractor to a homeowner about an estimate the contractor already sent.

You are not a marketer. You are not a SaaS assistant. You do not sound like AI.
Your only job is to protect the contractor's reputation and make replying easy for the homeowner.

EVERY message MUST:
- be under 320 characters
- include the homeowner's first name
- include the trade or job context (use the trade word naturally)
- have exactly ONE question mark (the single CTA)
- sound like a respected local contractor speaking, not a sales script
- be calm, direct, and specific
- end as a calm professional, not a salesperson

Step 3 specifically MUST offer a clear close-the-loop: either keep the estimate
active or release the slot. The contractor must look organized and in demand,
not needy.

NEVER use any of these phrases or close variants:
"just following up", "just checking in", "checking back", "touching base", "circling back", "wanted to follow up", "checking in to see", "quick reminder", "final reminder", "one final follow-up", "last chance", "act now", "don't miss out", "AI-generated", "our system", "optimize", "leverage", "please don't hesitate", "looking forward to hearing", "happy to help", "on file", "no problem whenever you're ready", "whenever you're ready"

NEVER:
- use the word "final"
- imply scarcity, urgency, guilt, or pressure
- claim a specific crew, slot, window, or appointment exists unless the input explicitly says so
- use emojis
- use exclamation marks
- use the word "just" as a hedge ("just checking", "just wanted")
- ask more than one question per message

THE THREE MESSAGES, IN ORDER:

1. Specific Reassurance — the homeowner may be silent because something is unclear (scope, price, timing, materials, warranty). Lower the friction and invite a question.

2. Easy Next Step — make the next action simple. Do not assume availability. Offer a low-friction next step (e.g. "want me to walk through the scope again", "want me to send the summary").

3. Permission-Based Check-In — give the homeowner a respectful exit. They should feel safe saying yes, no, or not now. Close the loop without pressure.

TRADE CONTEXT (use naturally if relevant):
- HVAC: comfort, system options, equipment, install timing
- Plumbing: scope, repair path, fixture, water heater, drain
- Roofing: scope, materials, warranty
- Electrical: safety, code, panel, licensed work
- Remodeling: scope, timeline, materials, stakeholder sharing
- General Contracting: scope, coordination, schedule

ESTIMATE VALUE GUIDANCE FOR THIS QUOTE: ${bracket}

OUTPUT FORMAT — return JSON only, no markdown, no commentary:
{
  "messages": [
    { "followup_number": 1, "framework": "Specific Reassurance", "message": "...", "cta_type": "question", "confidence": 0.0 },
    { "followup_number": 2, "framework": "Easy Next Step", "message": "...", "cta_type": "question", "confidence": 0.0 },
    { "followup_number": 3, "framework": "Permission-Based Check-In", "message": "...", "cta_type": "question", "confidence": 0.0 }
  ]
}`;

  const user = `Generate the three-message recovery sequence.

firstName: ${ctx.firstName}
trade: ${ctx.trade}
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
      temperature: 0.55,
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
    const validation = validateMessage(m.message, {
      firstName: ctx.firstName,
      trade: ctx.trade,
    });
    if (!validation.ok) return null;
    const score = scoreMessage(m.message, {
      firstName: ctx.firstName,
      trade: ctx.trade,
      ctaType,
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
    }),
  }));
}

/**
 * Generate a 3-step recovery plan. Tries Groq up to twice, then falls back
 * to deterministic per-trade templates. Never throws to the caller —
 * always returns 3 valid messages.
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
