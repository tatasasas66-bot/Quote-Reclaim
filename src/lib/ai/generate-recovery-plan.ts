import { z } from "zod";
import { AIUnavailableError, callAI, type ChatMessage } from "./call-ai";
import { getSequenceFamily } from "@/lib/recovery/recovery-logic";
import {
  fallbackMessages,
  projectLabel,
  researchSequenceMessages,
} from "./fallback-messages";
import { isWriterAvailable } from "./router";
import { scoreMessage, MIN_AI_SCORE } from "./score-message";
import { validateMessage } from "./validate-message";
import { titleCase } from "@/lib/utils/normalize";

// Plain-English labels surfaced to the contractor. The contractor-only
// "Why this works" rationale on the quote detail page is intentionally NOT
// renamed and continues to live in WHY_THIS_WORKS as separate explanatory
// copy — it is rationale text for the contractor, not customer copy.
export type RecoveryFramework =
  | "Estimate Check"
  | "Decision Friction"
  | "Scope Rescue"
  | "Open, Revise, or Close"
  | "Clean Closeout";

export type RecoveryMessage = {
  followup_number: 1 | 2 | 3 | 4 | 5;
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
  // Seeds deterministic variant selection so the same quote always renders the
  // same phrasing while different quotes vary. Optional so server-side
  // previews and unit tests fall back to the canonical template (v0).
  quoteId?: string | null;
  // Fallback-seed inputs used when quoteId is absent (server-side preview /
  // audit page). variantSeed composes them deterministically.
  daysSilent?: number | null;
};

/** Delegates to the centralized recovery-logic module's SEQUENCE_FAMILIES. */
function FRAMEWORK_BY_NUMBER(n: 1 | 2 | 3 | 4 | 5): RecoveryFramework {
  return getSequenceFamily(n);
}

const aiResponseSchema = z.object({
  messages: z
    .array(
      z.object({
        followup_number: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
        ]),
        framework: z.string().optional(),
        message: z.string().min(1),
        cta_type: z.string().optional(),
        confidence: z.number().optional(),
      }),
    )
    .length(5),
});

function expectedMessage(
  ctx: RecoveryContext,
  followupNumber: 1 | 2 | 3 | 4 | 5,
): string {
  const sequence = researchSequenceMessages(ctx);
  if (followupNumber === 1) return sequence.day1;
  if (followupNumber === 2) return sequence.day3;
  if (followupNumber === 3) return sequence.day7;
  if (followupNumber === 4) return sequence.day14;
  return sequence.day30;
}

function buildPrompt(ctx: RecoveryContext): ChatMessage[] {
  const project = projectLabel(ctx.trade);
  const contractorFirstName =
    (ctx.contractorFirstName ?? "").trim().split(/\s+/)[0] || "Contractor";
  const name = titleCase(ctx.firstName ?? "");

  const system = `You write email follow-ups for US home-service contractors chasing quiet estimates. The contractor is the person sending these — not a sales coach, not an AI assistant. Write like an experienced foreman who is calm, direct, and respects the homeowner's time. The customer should never sense psychology or a script.

VARIATION:
Vary phrasing across different quotes. Same quote always renders the same message; two different quotes should not read like the same template. Vary verbs, sentence structure, and openings — keep each day's intent identical.

VOICE:
- Plain English. Short sentences. Confident, not pushy.
- Specific to the trade and the estimate. No corporate or SaaS vocabulary.
- When the job is known (e.g. water heater, panel upgrade, kitchen, metal roof, driveway), name it naturally — "the roofing estimate for the metal roof". Referencing the exact job proves you remember it and is the single biggest quality signal. When it is not known, use the plain trade phrasing.
- Never desperate, never apologetic, never sales-y, never robotic.
- No fake urgency, no fake scarcity, no fabricated deadlines.
- Never name a psychology tactic, framework, or sales technique in the message.

FORMAT (non-negotiable):
- Under 220 characters.
- No exclamation marks. No emoji.
- Keep the trade or project keyword in every message (Day 1–Day 30, no exceptions).
- Contractor first name only — no company name, no signature block, no tracking links.

DAY 1 — Estimate Check (clarity):
Open with "Hey {firstName} —". Mention the trade/project once. Offer to break down a number, timing, or scope detail. One open question.

DAY 3 — Decision Friction (active list):
Open with "{firstName},". Operational tone. Ask whether to keep the job on the active list / on the schedule / on your list, or move it off / pause it / set it aside. Reference the trade once. Do NOT claim you are holding a slot, releasing a slot, locking the schedule, or running out of openings — the app does not know that and it reads as fake scarcity.

DAY 7 — Scope Rescue (lower-commitment path):
No greeting word. Omit the customer's name. Reference the trade/project. If the full estimate may be too much as written, offer to separate must-do work from later pieces, phase the scope, or map the part holding it up. One question. Never imply discounting, cheap work, or cutting corners.

DAY 14 — Open, Revise, or Close (active / paused / closed):
Open with "{firstName},". Give a fast choice: keep the estimate active, pause it for later, or close it out for now. One question. Calm. Never imply a price drop, discount, sale, or coupon. Never use the word "cheaper".

DAY 30 — Clean Closeout (respectful):
Open with "{firstName},". Declarative — no question mark. Close it out for now, no hard feelings, leave the door open if anything changes. No begging, no guilt language, no "last chance" or "final notice".

BANNED PHRASES (do not produce these — they read as either spammy or as a sales coach talking):
"just checking in", "just following up", "checking in", "following up", "touching base", "circling back", "circle back", "hope this finds you well", "hope you're doing great", "make the next step simple", "before you decide", "leave it hanging", "dead or just on pause", "just need one word", "locking the schedule today", "releasing it", "let the slot go", "makes you the prize", "loss aversion", "reactance", "trigger", "squeeze", "breakup", "discount", "cheaper", "price drop", "guaranteed", "urgent", "last chance", "final notice", "AI", "CRM", "lead nurturing", "pipeline optimization", "workflow", "automate your sales".

Return JSON only — no markdown, no commentary. Use these exact framework labels:
{
  "messages": [
    { "followup_number": 1, "framework": "Estimate Check", "message": "...", "cta_type": "question", "confidence": 1 },
    { "followup_number": 2, "framework": "Decision Friction", "message": "...", "cta_type": "question", "confidence": 1 },
    { "followup_number": 3, "framework": "Scope Rescue", "message": "...", "cta_type": "question", "confidence": 1 },
    { "followup_number": 4, "framework": "Open, Revise, or Close", "message": "...", "cta_type": "question", "confidence": 1 },
    { "followup_number": 5, "framework": "Clean Closeout", "message": "...", "cta_type": "statement", "confidence": 1 }
  ]
}

If you cannot produce a message that fits all of the above for a given day, return nothing — the system will fall back to a deterministic template.`;

  const user = `Generate the exact five-message recovery sequence.

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
  if (
    numbers[0] !== 1 ||
    numbers[1] !== 2 ||
    numbers[2] !== 3 ||
    numbers[3] !== 4 ||
    numbers[4] !== 5
  ) {
    return null;
  }

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
      framework: FRAMEWORK_BY_NUMBER(m.followup_number),
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
