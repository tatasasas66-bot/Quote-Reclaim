import { callAI } from "./call-ai";
import { getFastConfig } from "./router";

/**
 * The five reply intents Reply Radar recognises. Kept deliberately small and
 * action-oriented — each maps to one research-backed response tactic in
 * suggest-response.ts.
 */
export type ReplyIntent =
  | "positive"
  | "price_objection"
  | "needs_time"
  | "not_interested"
  | "question";

export const REPLY_INTENTS: readonly ReplyIntent[] = [
  "positive",
  "price_objection",
  "needs_time",
  "not_interested",
  "question",
];

export function isReplyIntent(value: unknown): value is ReplyIntent {
  return typeof value === "string" && (REPLY_INTENTS as readonly string[]).includes(value);
}

// Substring rules, checked in priority order. The substantive intents
// (not_interested / price / needs_time) win over the generic "question" and
// "positive" buckets so "can you do it cheaper?" reads as a price objection,
// not a bare question.
const NOT_INTERESTED: readonly string[] = [
  "not interested",
  "no thanks",
  "no thank you",
  "went with",
  "going with someone",
  "go with someone",
  "found someone",
  "decided to go",
  "decided not",
  "we'll pass",
  "we will pass",
  "i'll pass",
  "i will pass",
  "no longer need",
  "changed our mind",
  "changed my mind",
  "different direction",
  "another contractor",
  "someone else",
];

const PRICE: readonly string[] = [
  "too expensive",
  "expensive",
  "too much",
  "out of budget",
  "over budget",
  "out of our budget",
  "can't afford",
  "cannot afford",
  "cant afford",
  "cheaper",
  "lower the price",
  "lower price",
  "price is",
  "the price",
  "on price",
  "pricey",
  "more than i",
  "more than we",
  "more than expected",
  "budget",
  "cost is",
  "costs too",
];

const NEEDS_TIME: readonly string[] = [
  "think about it",
  "think it over",
  "thinking it over",
  "need time",
  "need some time",
  "give me time",
  "get back to you",
  "few weeks",
  "couple weeks",
  "next month",
  "not ready",
  "hold off",
  "down the road",
  "circle back",
  "touch base later",
  "busy right now",
  "reach out later",
  "check back",
];

const POSITIVE: readonly string[] = [
  "sounds good",
  "looks good",
  "let's do",
  "lets do",
  "let's get",
  "lets get",
  "go ahead",
  "go for it",
  "book it",
  "sign me up",
  "move forward",
  "let's schedule",
  "lets schedule",
  "when can you start",
  "ready to go",
  "ready to start",
  "ready to move",
  "proceed",
  "perfect",
  "yes please",
];

const QUESTION_WORDS = /\b(what|when|how|can you|could you|would you|do you|does|did you|is there|are you|why|which|where)\b/i;

function matchesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Deterministic keyword classifier. Always available (no network), so it
 * doubles as the test oracle and as the fallback when the fast model is
 * unconfigured or errors. Returns null when nothing matches.
 */
export function classifyReplyHeuristic(text: string): ReplyIntent | null {
  const t = text.trim().toLowerCase().replace(/[‘’]/g, "'");
  if (!t) return null;

  if (matchesAny(t, NOT_INTERESTED)) return "not_interested";
  if (matchesAny(t, PRICE)) return "price_objection";
  if (matchesAny(t, NEEDS_TIME)) return "needs_time";

  // Affirmative scheduling language before the generic question bucket so
  // "yes, when can you start?" reads as positive momentum.
  if (matchesAny(t, POSITIVE) || /\b(yes|yeah|yep|yup)\b/.test(t)) {
    return "positive";
  }

  if (t.includes("?") || QUESTION_WORDS.test(t)) return "question";

  return null;
}

function isFastModelAvailable(): boolean {
  return Boolean(getFastConfig().apiKey);
}

async function classifyViaAI(text: string): Promise<ReplyIntent | null> {
  const system = `You classify a homeowner's SMS reply to a contractor's estimate follow-up into exactly one intent.

Intents:
- positive: ready to move forward, wants to schedule, says yes
- price_objection: pushes back on cost, says it's expensive or over budget
- needs_time: wants to think, decide later, or is not ready yet
- not_interested: declining, went with someone else, no longer wants the work
- question: asking for information (scope, timeline, warranty, materials)

Return JSON only: {"intent":"<one of: positive|price_objection|needs_time|not_interested|question>"}`;

  let raw: string;
  try {
    raw = await callAI(
      [
        { role: "system", content: system },
        { role: "user", content: text.slice(0, 1000) },
      ],
      {
        config: getFastConfig(),
        temperature: 0,
        jsonMode: true,
        maxTokens: 20,
      },
    );
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { intent?: unknown };
    return isReplyIntent(parsed.intent) ? parsed.intent : null;
  } catch {
    return null;
  }
}

/**
 * Classify an inbound reply. Uses the Groq fast model when configured and
 * falls back to the deterministic heuristic when the model is unavailable,
 * errors, or returns an unrecognised label. Never throws.
 */
export async function classifyReply(text: string): Promise<ReplyIntent | null> {
  const heuristic = classifyReplyHeuristic(text);
  if (!isFastModelAvailable()) return heuristic;

  const aiIntent = await classifyViaAI(text);
  return aiIntent ?? heuristic;
}
