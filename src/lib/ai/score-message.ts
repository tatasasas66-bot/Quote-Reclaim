import {
  containsBannedPhrase,
  tradeKeywords,
  MAX_MESSAGE_CHARS,
} from "./validate-message";

export type ScoringContext = {
  firstName?: string;
  trade?: string;
  ctaType?: string;
  followupNumber?: 1 | 2 | 3;
};

/**
 * Minimum score for an AI-generated message to be kept. Below this, retry
 * once and then fall back to the deterministic template.
 */
export const MIN_AI_SCORE = 75;

/**
 * Minimum score the deterministic fallback templates are expected to hit.
 * Used by tests to lock in the floor; not a runtime gate.
 */
export const FALLBACK_FLOOR_SCORE = 85;

const CALM_PHRASES = [
  "either way",
  "no rush",
  "no pressure",
  "if it works",
  "want me to",
  "what works",
];

const SPECIFICITY_NOUNS: Record<string, readonly string[]> = {
  roofing: ["shingles", "warranty", "materials", "scope", "decking"],
  plumbing: ["fixture", "repair", "water heater", "drain", "scope", "leak"],
  hvac: ["system", "install", "comfort", "equipment", "tonnage"],
  electrical: ["panel", "safety", "code", "wiring", "circuit"],
  remodeling: ["scope", "timeline", "materials", "finishes"],
  contracting: ["scope", "schedule", "coordination", "timeline"],
  general: ["scope", "schedule", "coordination", "timeline"],
};

const PRESSURE_WORDS = [
  "urgent",
  "asap",
  "immediately",
  "right now",
  "act now",
  "hurry",
];

const ROBOTIC_WORDS = [
  "synergy",
  "ecosystem",
  "actionable",
  "circle back",
  "going forward",
];

/**
 * Score a recovery message on a 0-100 scale. Hard failures zero out the score
 * so callers never confuse structural failures with tone issues.
 */
export function scoreMessage(
  message: string,
  ctx: ScoringContext = {},
): number {
  const trimmed = message.trim();
  if (trimmed.length === 0) return 0;
  const lower = trimmed.toLowerCase();

  // Hard zero conditions
  if (containsBannedPhrase(trimmed)) return 0;
  if (/\bfinal\b/i.test(trimmed)) return 0;
  if (/last chance/i.test(trimmed)) return 0;
  if (/[!]/.test(trimmed)) return 0;
  if (/[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]/.test(trimmed)) return 0;
  if (/\bhttps?:\/\//i.test(trimmed) || /\bwww\./i.test(trimmed)) return 0;
  if (trimmed.length > MAX_MESSAGE_CHARS + 40) return 0;

  let score = 100;

  // Length
  if (trimmed.length > MAX_MESSAGE_CHARS) score -= 25;
  if (trimmed.length < 40) score -= 15;

  // Client first name is intentionally absent from Day 7 / followup 3.
  if (ctx.firstName && ctx.firstName.length > 0 && ctx.followupNumber !== 3) {
    if (!lower.includes(ctx.firstName.toLowerCase())) score -= 20;
  }

  // Trade / context
  if (ctx.trade && ctx.trade.length > 0) {
    const kws = tradeKeywords(ctx.trade);
    if (!kws.some((k) => lower.includes(k))) score -= 15;
  }

  // CTA count
  const questions = (trimmed.match(/\?/g) ?? []).length;
  if (questions === 0) score -= 8;
  if (questions > 1) score -= 25;

  // Pressure
  for (const w of PRESSURE_WORDS) {
    if (lower.includes(w)) score -= 12;
  }

  // Robotic / corporate
  for (const w of ROBOTIC_WORDS) {
    if (lower.includes(w)) score -= 10;
  }

  // Calm, direct tone bonus
  let calmHits = 0;
  for (const p of CALM_PHRASES) {
    if (lower.includes(p)) {
      calmHits += 1;
      if (calmHits >= 2) break;
    }
  }
  if (calmHits >= 1) score += 3;
  if (calmHits >= 2) score += 2;

  // Specificity bonus per trade
  if (ctx.trade) {
    const kws = tradeKeywords(ctx.trade);
    const nouns = new Set<string>();
    for (const k of kws) {
      const list = SPECIFICITY_NOUNS[k];
      if (list) for (const n of list) nouns.add(n);
    }
    const nounList = Array.from(nouns);
    if (nounList.length > 0) {
      let nounHits = 0;
      for (let i = 0; i < nounList.length; i++) {
        if (lower.includes(nounList[i])) {
          nounHits += 1;
          if (nounHits >= 2) break;
        }
      }
      if (nounHits >= 1) score += 4;
      if (nounHits >= 2) score += 2;
    }
  }

  if (score < 0) return 0;
  if (score > 100) return 100;
  return score;
}
