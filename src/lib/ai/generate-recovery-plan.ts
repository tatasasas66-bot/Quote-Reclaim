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
  | "Professional Closeout"
  | "Value Re-frame"
  | "Final Breakup";

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
  // same phrasing while different quotes vary (anti-repetition). Optional so
  // server-side previews and unit tests fall back to the canonical template.
  quoteId?: string | null;
};

const FRAMEWORK_BY_NUMBER: Record<1 | 2 | 3 | 4 | 5, RecoveryFramework> = {
  1: "Casual Pattern Interrupt",
  2: "Authority & Status Squeeze",
  3: "Professional Closeout",
  4: "Value Re-frame",
  5: "Final Breakup",
};

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

  const system = `You generate SMS follow-up messages for US home-service contractors chasing silent estimates. Each message must:

VARIATION (anti-repetition):
Generate a DIFFERENT phrasing each time while strictly preserving each day's psychological frame (Day 1 Pattern Interrupt, Day 3 Authority/Prize Frame, Day 7 Voss Takeaway, Day 14 Value Re-frame, Day 30 Final Breakup). Never reuse the exact same sentence across clients. Vary verbs, sentence structure, and opening — keep the strategy identical.

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

DAY 3 — Authority/Prize Frame:
Start with "{firstName}," (name only, no greeting word).
Invoke your schedule/calendar as the scarce resource.
Create a binary choice: hold their slot or release it.
End with "What works?" or equivalent decisional question.
Target: 120-150 characters.
NEVER offer a discount. NEVER apologize for the timeline.

DAY 7 — Voss Takeaway Close:
NO greeting word. Use Chris Voss no-oriented structure: "Have you given up on..." or "Should I close...".
Either omit the name OR lead with "{firstName},"; both are valid.
Explicitly withdraw: "I'll close the file" / "take it off my board".
Offer relief: "no problem either way" / "no hard feelings".
Force binary: "yes or no" / "one word".
Target: 140-165 characters.
This must feel like a foreman clearing a job board — zero emotion.

DAY 14 — Value Re-frame (phasing/scope, NEVER a price drop):
Start with "{firstName},". Acknowledge that silence usually means price shock, not rejection.
Offer a path forward via phasing the work or trimming scope — never a discount, never a sale.
End with a low-pressure open question ("Want me to put an option together?").
Target: 150-175 characters.
NEVER use the words "discount", "sale", "deal", or any specific percentage off.

DAY 30 — Final Breakup (withdraw the offer):
Start with "{firstName},". This is the takeaway — declarative, no question mark.
Explicitly close the file: "closing", "let it go", "won't reach out again".
Leave the door open: "if anything changes", "save my number", "door's open".
No begging, no apology, no guilt language.
Target: 140-170 characters.
This is the highest-leverage touch in the sequence — keep it calm and final.

NEVER use: "just checking in", "following up", "touching base", "circling back", "hope this finds you well", "hope you're doing great", "leave it hanging", "make the next step simple", "before you decide", emojis, exclamation marks, unsolicited discounts, guilt language, generic company signatures, tracking links.

Return JSON only, no markdown, no commentary:
{
  "messages": [
    { "followup_number": 1, "framework": "Casual Pattern Interrupt", "message": "...", "cta_type": "question", "confidence": 1 },
    { "followup_number": 2, "framework": "Authority & Status Squeeze", "message": "...", "cta_type": "question", "confidence": 1 },
    { "followup_number": 3, "framework": "Professional Closeout", "message": "...", "cta_type": "question", "confidence": 1 },
    { "followup_number": 4, "framework": "Value Re-frame", "message": "...", "cta_type": "question", "confidence": 1 },
    { "followup_number": 5, "framework": "Final Breakup", "message": "...", "cta_type": "statement", "confidence": 1 }
  ]
}`;

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
