import type { RecoveryMessage, RecoveryContext } from "./generate-recovery-plan";
import {
  getRecommendedMessage,
  getProjectNoun,
  getSequenceFamily,
  type FollowupNumber,
} from "@/lib/recovery/recovery-logic";

/**
 * Deterministic fallback templates. Voice target: a real, experienced
 * contractor — calm, direct, specific, no sales psychology language in the
 * message itself. The labels surfaced to the user are plain English.
 * Variation is seeded from the quote so the same quote
 * always renders the same phrasing while different quotes spread across
 * the variants per day (4–5 per day).
 *
 * Cadence: Day 1 / 5 / 10 / 14 / 21 / 60. The wider early spacing avoids
 * pestering, Day 21 closes cleanly, and Day 60 is one final reopen-later touch.
 *
 * Strategic arc per touch (every message is a real-contractor sentence
 * disguising the intent — never naming the psychology):
 *   1 Decision Friction — clear up scope, timing, or price.
 *   2 Scope Rescue — make budget, timing, scope, or a clean no easy to say.
 *   3 Soft Decision Check — keep active or close without pressure.
 *   4 Open, Revise, or Close — three simple paths.
 *   5 Clean Closeout — respectful withdrawal; declarative; door open.
 *   6 Reopen Later — one later check, then no further chase.
 */

const ALIASES: Record<string, string> = {
  roof: "roofing",
  roofs: "roofing",
  shingles: "roofing",
  plumber: "plumbing",
  plumbers: "plumbing",
  "water heater": "plumbing",
  heating: "HVAC",
  cooling: "HVAC",
  ac: "HVAC",
  "a/c": "HVAC",
  hvacr: "HVAC",
  electrician: "electrical",
  electric: "electrical",
  remodel: "remodeling",
  renovation: "remodeling",
  renovations: "remodeling",
  contractor: "general contracting",
  "general contractor": "general contracting",
  gc: "general contracting",
  painter: "painting",
  painters: "painting",
  paint: "painting",
  landscaper: "landscaping",
  landscapers: "landscaping",
  landscape: "landscaping",
  lawn: "landscaping",
  concrete: "concrete",
  driveway: "concrete",
  slab: "concrete",
  patio: "concrete",
};

const PROJECT_LABELS: Record<string, string> = {
  roofing: "the roofing estimate",
  plumbing: "the plumbing estimate",
  hvac: "the HVAC replacement estimate",
  electrical: "the electrical estimate",
  remodeling: "the remodel estimate",
  "general contracting": "the project estimate",
  painting: "the painting estimate",
  landscaping: "the landscaping estimate",
  concrete: "the concrete estimate",
  other: "the estimate",
};

// Bare trade modifier — used when the surrounding sentence supplies its own
// noun ("the roofing schedule", "upcoming roofing work"). Kept aligned with
// the validator tradeKeywords + TRADE_KEYWORD_SYNONYMS so every message
// still passes the trade-keyword check.
const TRADE_WORDS: Record<string, string> = {
  roofing: "roofing",
  plumbing: "plumbing",
  hvac: "HVAC",
  electrical: "electrical",
  remodeling: "remodel",
  "general contracting": "project",
  painting: "painting",
  landscaping: "landscaping",
  concrete: "concrete",
  other: "estimate",
};

/** Delegates to the centralized recovery-logic module SEQUENCE_FAMILIES. */
function FRAMEWORKS(n: FollowupNumber): RecoveryMessage["framework"] {
  return getSequenceFamily(n);
}

function resolveTrade(
  trade: string,
  table: Record<string, string>,
  fallback: string,
): string {
  const lower = trade.trim().toLowerCase();
  if (!lower) return fallback;
  if (table[lower]) return table[lower];

  const aliasMatch = ALIASES[lower];
  if (aliasMatch && table[aliasMatch.toLowerCase()]) {
    return table[aliasMatch.toLowerCase()];
  }
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (lower.includes(alias) && table[canonical.toLowerCase()]) {
      return table[canonical.toLowerCase()];
    }
  }
  for (const key of Object.keys(table)) {
    if (lower.includes(key)) return table[key];
  }
  return fallback;
}

export function projectLabel(
  trade: string,
  projectType?: string | null,
): string {
  if (projectType?.trim()) {
    const noun = getProjectNoun(trade, projectType);
    return noun === "estimate" ? "the estimate" : `the ${noun} estimate`;
  }
  const lower = trade.trim().toLowerCase();
  if (!lower) return "the estimate";
  return resolveTrade(trade, PROJECT_LABELS, `the ${lower} estimate`);
}

export function oneTapProjectLabel(
  trade: string,
  projectType?: string | null,
): string {
  return projectType?.trim() ? projectLabel(trade, projectType) : "the estimate";
}

export function tradeWord(trade: string): string {
  const lower = trade.trim().toLowerCase();
  if (!lower) return "estimate";
  return resolveTrade(trade, TRADE_WORDS, lower);
}

/**
 * Per-trade job-noun dictionary. Each entry is an ordered list of
 * [pattern, label]. The label is a hand-curated noun phrase that reads
 * naturally in "the {trade} estimate for the {label}" — e.g. "water heater",
 * "panel upgrade", "metal roof". Ordering matters: the most specific /
 * primary scope wins, so list the headline noun first.
 *
 * This is intentionally high-precision and fail-closed: jobDetail only returns
 * a label when a curated pattern matches, otherwise null. A missing detail
 * simply falls back to the generic (already strong) trade phrasing, so the
 * generator can never emit an awkward auto-extracted fragment.
 */
const JOB_NOUNS: Record<string, ReadonlyArray<[RegExp, string]>> = {
  roofing: [
    [/\bmetal\b/, "metal roof"],
    [/\b(flat roof|tpo|epdm)\b/, "flat roof"],
    [/\bgutter/, "gutters"],
    [/\bshingle/, "shingle roof"],
    // "new roof" / "repair" avoid the "roofing estimate for the roof
    // replacement" double-"roof" redundancy the previous labels produced.
    [/\b(tear[- ]?off|re-?roof|reroof|new roof|full roof|replace)\b/, "new roof"],
    [/\b(leak|repair)\b/, "repair"],
  ],
  plumbing: [
    [/\b(water heater|tankless)\b/, "water heater"],
    [/\bre-?pipe\b/, "repipe"],
    [/\bsewer\b/, "sewer line"],
    [/\bdrain\b/, "drain work"],
    [/\b(faucet|fixture|sink|toilet|shower)\b/, "fixture work"],
    [/\bleak\b/, "leak repair"],
  ],
  // HVAC intentionally has no per-job detail map: equipment nouns (furnace,
  // AC, heat pump) stack awkwardly behind "the HVAC … estimate". The richer
  // "the HVAC replacement estimate" label already carries the specificity, so
  // jobDetail("HVAC", …) returns null and the plain label is used everywhere.
  electrical: [
    [/\bpanel\b/, "panel upgrade"],
    [/\bre-?wir|wiring\b/, "rewire"],
    [/\bgenerator\b/, "generator"],
    [/\b(ev\b|charger)/, "EV charger"],
    [/\b(outlet|circuit|breaker)\b/, "outlet work"],
  ],
  remodeling: [
    [/\bkitchen\b/, "kitchen"],
    [/\bbath/, "bathroom"],
    [/\bbasement\b/, "basement"],
    [/\bmaster\b/, "master suite"],
  ],
  "general contracting": [
    [/\bdeck\b/, "deck"],
    [/\bsunroom\b/, "sunroom"],
    [/\bgarage\b/, "garage"],
    [/\bporch\b/, "porch"],
    [/\baddition\b/, "addition"],
  ],
  painting: [
    [/\bexterior\b/, "exterior"],
    [/\binterior\b/, "interior"],
    [/\bcabinet/, "cabinets"],
    [/\bfence\b/, "fence"],
    [/\btrim\b/, "trim"],
  ],
  landscaping: [
    [/\bretaining\b/, "retaining wall"],
    [/\bpatio\b/, "patio"],
    [/\bpaver/, "pavers"],
    [/\b(irrigation|sprinkler)\b/, "irrigation"],
    [/\b(sod|lawn|grass)\b/, "lawn"],
  ],
  concrete: [
    [/\bdriveway\b/, "driveway"],
    [/\bpatio\b/, "patio"],
    [/\bfoundation\b/, "foundation"],
    [/\bslab\b/, "slab"],
    [/\b(walkway|sidewalk)\b/, "walkway"],
    [/\b(step|stair)\b/, "steps"],
  ],
};

/** Resolve a freeform trade string to the canonical JOB_NOUNS key. */
function canonicalTradeKey(trade: string): string {
  const lower = trade.trim().toLowerCase();
  if (!lower) return "other";
  if (JOB_NOUNS[lower]) return lower;
  const aliasMatch = ALIASES[lower];
  if (aliasMatch) return aliasMatch.toLowerCase();
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (lower.includes(alias)) return canonical.toLowerCase();
  }
  for (const key of Object.keys(JOB_NOUNS)) {
    if (lower.includes(key)) return key;
  }
  return "other";
}

/**
 * Extract a specific, natural job noun from the contractor-entered job
 * description (e.g. "Replace water heater" -> "water heater"; "Panel upgrade
 * to 200A" -> "panel upgrade"). Pure, deterministic, and fail-closed: returns
 * null whenever nothing curated matches, so callers degrade to the generic
 * trade phrasing instead of risking an awkward fragment.
 */
export function jobDetail(
  trade: string,
  jobDescription: string | null | undefined,
): string | null {
  const desc = (jobDescription ?? "").toLowerCase().trim();
  if (!desc) return null;
  const patterns = JOB_NOUNS[canonicalTradeKey(trade)];
  if (!patterns) return null;
  for (const [pattern, label] of patterns) {
    if (pattern.test(desc)) return label;
  }
  return null;
}

/**
 * The detail-aware project phrase. When a specific job noun is known, it reads
 * "the roofing estimate for the metal roof" — keeping the trade keyword (so the
 * validator passes unchanged) while proving the contractor remembers the exact
 * job. Falls back to the plain project phrase when no detail is available.
 */
export function projectDetailPhrase(
  project: string,
  detail: string | null,
): string {
  return detail ? `${project} for the ${detail}` : project;
}

export type VariantVars = {
  firstName: string;
  contractorFirstName: string;
  /** Full "the X estimate" noun phrase. */
  project: string;
  /**
   * Detail-aware project phrase: "the X estimate for the {job noun}" when the
   * job is known, otherwise identical to `project`. Used on the touches where
   * job specificity converts (Day 1, Day 14, Day 60).
   */
  projectDetail: string;
  /** Bare trade modifier ("roofing", "HVAC", "project", "concrete"). */
  tradeWord: string;
};

/**
 * Four phrasings per day. INVARIANT: index 0 is the canonical variant the
 * deterministic seed falls back to when no quoteId is supplied. The AI
 * exact-match gate compares against whatever researchSequenceMessages returns
 * for the same ctx, so v0 doubles as the test fixture.
 *
 * Tone: plain, contractor-native, calm, no sales psychology in the visible
 * copy. No fake scarcity. Trade keyword in every message. Asymmetric openings
 * across the day arc so the sequence does not read like one formula.
 */

// DAY 1 — Estimate Check. Helpful, direct. "Hey {FirstName} — ..." opener.
// Uses projectDetail so a known job ("the roofing estimate for the metal roof")
// shows the contractor remembers the specific job on the very first touch.
// Sender identity renders ONLY when the contractor first name is known —
// there is no "Contractor here" placeholder. Unknown sender = no identity
// clause at all, which still reads like a natural text.
const DAY1_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ projectDetail }) =>
    `Any question on ${projectDetail} I can clear up? Scope, timing, or price — reply with which one.`,
  ({ projectDetail }) =>
    `Is there one question on ${projectDetail} I can clear up — scope, timing, or price?`,
  ({ projectDetail }) =>
    `Was anything unclear in ${projectDetail}: scope, timing, or price?`,
  ({ projectDetail }) =>
    `Which part of ${projectDetail} needs a clearer answer — scope, timing, or price?`,
];

// DAY 10 — Soft Decision Check.
const DAY10_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ project }) =>
    `Should I keep ${project} on my active list, or close it out? Either is fine — just tell me which.`,
  ({ project }) =>
    `Should ${project} stay active, or should I close it out for now? Either answer is fine.`,
  ({ project }) =>
    `Do you want me to keep ${project} open, or close it out on my side?`,
  ({ project }) =>
    `Should I leave ${project} active, or mark it closed for now?`,
];

// DAY 5 — Scope Rescue and a shame-free exit.
const DAY5_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ firstName, project }) =>
    `Hi ${firstName} — no pressure on ${project}. If it's timing, budget, or scope, reply with which one and I'll sharpen it. If it's a pass, 'no' works too.`,
  ({ firstName, project }) =>
    `Hi ${firstName} — if ${project} is stuck on timing, budget, or scope, tell me which one and I'll tighten that piece. If it's a no, that's fine too.`,
  ({ firstName, project }) =>
    `Hi ${firstName} — no pressure on ${project}. Is the hold-up timing, budget, or scope? A simple no works too.`,
  ({ firstName, project }) =>
    `Hi ${firstName} — if ${project} needs a change, is it timing, budget, or scope? If it's a pass, just say no.`,
];

// DAY 14 — Open, Revise, or Close. Useful, never discounting. The point is not another
// "any update?" — it gives the customer a fast active / paused / closed choice.
// Job-aware via projectDetail so the estimate still feels remembered.
const DAY14_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ projectDetail }) =>
    `I can keep ${projectDetail} open, revise it, or close it out. Which helps most?`,
  ({ projectDetail }) =>
    `Should I keep ${projectDetail} open, revise one part, or close it out?`,
  ({ projectDetail }) =>
    `Which helps most with ${projectDetail}: keep it open, revise it, or close it?`,
  ({ projectDetail }) =>
    `Do you want ${projectDetail} left open, revised, or closed out?`,
];

// DAY 21 — Clean Closeout. Respectful, detached. Declarative. No question.
// Job-aware via projectDetail so the final touch still names the exact job.
const DAY21_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ projectDetail }) =>
    `I'll close out ${projectDetail} on my side so it's off your plate. If the timing changes later, text me here and I'll send a fresh number — no re-quote needed.`,
  ({ projectDetail }) =>
    `I'll mark ${projectDetail} closed for now. If timing changes later, text me here and I'll pull it back up — no awkward restart.`,
  ({ projectDetail }) =>
    `I'm closing ${projectDetail} on my side. If it comes back to mind later, text me here and I'll send a fresh number.`,
  ({ projectDetail }) =>
    `I'll leave ${projectDetail} closed after this. If the timing changes, text me here and we can reopen it without starting over.`,
];

// DAY 60 — one reopen-later touch, then no further chase.
const DAY60_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ projectDetail }) =>
    `Saw ${projectDetail} from a while back. If the timing is better now, I can send a fresh number in 60 seconds. If not, no worries — I'll leave it closed.`,
  ({ projectDetail }) =>
    `I came across ${projectDetail} from a while back. If timing is better now, I can refresh the number quickly. Otherwise, I'll leave it closed.`,
  ({ projectDetail }) =>
    `This is the one later check on ${projectDetail}. If timing changed, I can send a fresh number quickly. If not, it stays closed.`,
  ({ projectDetail }) =>
    `I saw ${projectDetail} from earlier. If the timing works now, I can refresh the number quickly. Otherwise, no worries — it stays closed.`,
];

/**
 * All variant builders keyed by day. Exported so tests can enumerate and
 * validate all 24 variants (four for each cadence day).
 */
export const SEQUENCE_VARIANTS: Record<
  1 | 5 | 10 | 14 | 21 | 60,
  ReadonlyArray<(v: VariantVars) => string>
> = {
  1: DAY1_VARIANTS,
  5: DAY5_VARIANTS,
  10: DAY10_VARIANTS,
  14: DAY14_VARIANTS,
  21: DAY21_VARIANTS,
  60: DAY60_VARIANTS,
};

export type CadenceDay = keyof typeof SEQUENCE_VARIANTS;

function hashString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    // FNV-ish rolling hash; >>> 0 keeps it an unsigned 32-bit int.
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Build the deterministic seed for variant selection. quoteId is preferred —
 * it makes the message stable across reloads and regenerations. When it is
 * missing (server-side previews, audit page, unit tests), fall back to a
 * composite of clientName + trade + amount + daysSilent. When NONE of those
 * are available either, return the empty string so pickVariant resolves to
 * the canonical v0.
 */
export function variantSeed(ctx: RecoveryContext): string {
  if (ctx.quoteId) return ctx.quoteId;
  const parts = [
    (ctx.firstName ?? "").trim(),
    (ctx.trade ?? "").trim(),
    ctx.estimateAmount ? String(ctx.estimateAmount) : "",
    ctx.daysSilent != null ? String(ctx.daysSilent) : "",
  ];
  const joined = parts.filter((p) => p.length > 0).join("|");
  return joined;
}

/**
 * Deterministic variant index for a seed + day. The same quote always maps to
 * the same phrasing (stable across reloads and regenerations); two different
 * quotes spread across the available phrasings for that day.
 *
 * An empty seed returns 0 — the canonical template — which keeps server-side
 * previews and the locked exact-match tests stable. The modulus uses the
 * actual variant count per day (not a hard-coded 4) so adding evidence-backed
 * future variant-count changes do not drift selection.
 */
export function pickVariant(
  seed: string | null | undefined,
  day: CadenceDay,
): number {
  if (!seed) return 0;
  const len = SEQUENCE_VARIANTS[day].length;
  return hashString(`${seed}:${day}`) % len;
}

export function researchSequenceMessages(ctx: RecoveryContext): {
  day1: string;
  day5: string;
  day10: string;
  day14: string;
  day21: string;
  day60: string;
} {
  const messageContext = {
    firstName: ctx.firstName,
    trade: ctx.trade,
    projectType: ctx.projectType,
  };
  return {
    day1: getRecommendedMessage("Decision Friction", messageContext),
    day5: getRecommendedMessage("Scope Rescue", messageContext),
    day10: getRecommendedMessage("Soft Decision Check", messageContext),
    day14: getRecommendedMessage("Open, Revise, or Close", messageContext),
    day21: getRecommendedMessage("Clean Closeout", messageContext),
    day60: getRecommendedMessage("Reopen Later", messageContext),
  };
}

export function fallbackMessages(ctx: RecoveryContext): RecoveryMessage[] {
  const seq = researchSequenceMessages(ctx);
  const rows: Array<[FollowupNumber, string]> = [
    [1, seq.day1],
    [2, seq.day5],
    [3, seq.day10],
    [4, seq.day14],
    [5, seq.day21],
    [6, seq.day60],
  ];
  return rows.map(([n, message]) => ({
    followup_number: n,
    framework: FRAMEWORKS(n),
    message,
    cta_type: n >= 5 ? "statement" : "question",
    source: "fallback",
    score: 0,
  }));
}
