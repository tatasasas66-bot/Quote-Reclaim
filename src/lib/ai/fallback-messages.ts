import { titleCase } from "@/lib/utils/normalize";
import type { RecoveryMessage, RecoveryContext } from "./generate-recovery-plan";

/**
 * Deterministic fallback templates. Voice target: a real, experienced
 * contractor — calm, direct, specific, no sales psychology language in the
 * message itself. The labels surfaced to the user are plain English
 * (Estimate Check / Schedule Check / Close-the-Loop / Options Check /
 * Final Closeout). Variation is seeded from the quote so the same quote
 * always renders the same phrasing while different quotes spread across
 * the four variants per day.
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

// Full "the X estimate" noun phrase — used where a message wants the complete
// reference ("looked back over the roofing estimate").
const PROJECT_LABELS: Record<string, string> = {
  roofing: "the roofing estimate",
  plumbing: "the plumbing estimate",
  hvac: "the HVAC estimate",
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

const FRAMEWORKS: Record<1 | 2 | 3 | 4 | 5, RecoveryMessage["framework"]> = {
  1: "Estimate Check",
  2: "Schedule Check",
  3: "Close-the-Loop",
  4: "Options Check",
  5: "Final Closeout",
};

function cleanName(value: string | null | undefined, fallback: string): string {
  const first = (value ?? "").trim().split(/\s+/)[0] ?? "";
  return titleCase(first.replace(/[.,]/g, "")) || fallback;
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

export function projectLabel(trade: string): string {
  const lower = trade.trim().toLowerCase();
  if (!lower) return "the estimate";
  return resolveTrade(trade, PROJECT_LABELS, `the ${lower} estimate`);
}

export function tradeWord(trade: string): string {
  const lower = trade.trim().toLowerCase();
  if (!lower) return "estimate";
  return resolveTrade(trade, TRADE_WORDS, lower);
}

export type VariantVars = {
  firstName: string;
  contractorFirstName: string;
  /** Full "the X estimate" noun phrase. */
  project: string;
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
const DAY1_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ firstName, contractorFirstName, project }) =>
    `Hey ${firstName} — ${contractorFirstName} here. I looked back over ${project}. Was there a number, timing question, or detail you wanted me to break down?`,
  ({ firstName, project }) =>
    `Hey ${firstName} — I went back through ${project}. Anything in the scope, timing, or total you want me to clarify?`,
  ({ firstName, project }) =>
    `Hey ${firstName}, I reviewed ${project} again on my end. Was anything unclear, or is there a part you want me to walk through?`,
  ({ firstName, project }) =>
    `Hey ${firstName}, I looked over ${project} again. Any questions on the work, timing, or total before you make a call?`,
];

// DAY 3 — Schedule Check. "{FirstName}, ..." opener, no greeting word.
// Operational, never claims the contractor is releasing or holding a slot.
const DAY3_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ firstName, tradeWord }) =>
    `${firstName}, I'm lining up the ${tradeWord} schedule. Should I keep this on the active list, or move it off for now?`,
  ({ firstName, tradeWord }) =>
    `${firstName}, I'm sorting the next round of ${tradeWord} work. Should I keep your estimate active, or set it aside for now?`,
  ({ firstName, project }) =>
    `${firstName}, should I keep ${project} on my list for the next opening, or pause it for now?`,
  ({ firstName, tradeWord }) =>
    `${firstName}, I'm organizing upcoming ${tradeWord} work. Do you still want me to keep this one active?`,
];

// DAY 7 — Close-the-Loop. No greeting word. Name optional (v0–v3 omit it).
// Easy yes/no, no pressure.
const DAY7_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ project }) =>
    `Should I keep ${project} open, or close it out for now? Either way is fine.`,
  ({ project }) =>
    `Do you want me to keep ${project} active, or should I close it out on my end for now?`,
  ({ project }) =>
    `Should I leave ${project} open, or mark it closed for now? No pressure either way.`,
  ({ project }) =>
    `Do you still want me to keep ${project} on the board, or should I close it out for now?`,
];

// DAY 14 — Options Check. Useful, never discounting. Phasing/scope frame.
const DAY14_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ firstName, project }) =>
    `${firstName}, if the total, timing, or scope on ${project} is what's holding this up, I can walk through options without cutting corners. Worth a look?`,
  ({ firstName, project }) =>
    `${firstName}, if ${project} is stuck on timing, scope, or total, want me to walk through the options without changing the quality of the work?`,
  ({ firstName, project }) =>
    `${firstName}, sometimes these estimates stall over timing or details. If that's the case here, want me to walk through ${project} with you?`,
  ({ firstName, project }) =>
    `${firstName}, if there's one part of ${project} holding things up, want me to walk through it so you know where it stands?`,
];

// DAY 30 — Final Closeout. Respectful, detached. Declarative. No question.
const DAY30_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ firstName, project }) =>
    `${firstName}, I'll close out ${project} after this. No hard feelings. If anything changes later, reach out and I'll pick it back up.`,
  ({ firstName, project }) =>
    `${firstName}, I'm going to close ${project} on my end for now. If you decide to revisit it later, just reach out.`,
  ({ firstName, project }) =>
    `${firstName}, I'll mark ${project} closed for now. No problem either way — if it comes back up later, I can reopen it.`,
  ({ firstName, project }) =>
    `${firstName}, I'll step back on ${project} after this. If the timing changes down the road, I'm happy to pick it back up.`,
];

/**
 * All variant builders keyed by day. Exported so tests can enumerate and
 * validate all 20 (5 days × 4 variants).
 */
export const SEQUENCE_VARIANTS: Record<
  1 | 3 | 7 | 14 | 30,
  ReadonlyArray<(v: VariantVars) => string>
> = {
  1: DAY1_VARIANTS,
  3: DAY3_VARIANTS,
  7: DAY7_VARIANTS,
  14: DAY14_VARIANTS,
  30: DAY30_VARIANTS,
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
 * Deterministic variant index (0-3) for a seed + day. The same quote always
 * maps to the same phrasing (stable across reloads and regenerations); two
 * different quotes spread across the four phrasings.
 *
 * An empty seed returns 0 — the canonical template — which keeps server-side
 * previews and the locked exact-match tests stable.
 */
export function pickVariant(
  seed: string | null | undefined,
  day: CadenceDay,
): number {
  if (!seed) return 0;
  return hashString(`${seed}:${day}`) % 4;
}

export function researchSequenceMessages(ctx: RecoveryContext): {
  day1: string;
  day3: string;
  day7: string;
  day14: string;
  day30: string;
} {
  const vars: VariantVars = {
    firstName: cleanName(ctx.firstName, "there"),
    contractorFirstName: cleanName(ctx.contractorFirstName, "Contractor"),
    project: projectLabel(ctx.trade),
    tradeWord: tradeWord(ctx.trade),
  };
  const seed = variantSeed(ctx);

  return {
    day1: DAY1_VARIANTS[pickVariant(seed, 1)](vars),
    day3: DAY3_VARIANTS[pickVariant(seed, 3)](vars),
    day7: DAY7_VARIANTS[pickVariant(seed, 7)](vars),
    day14: DAY14_VARIANTS[pickVariant(seed, 14)](vars),
    day30: DAY30_VARIANTS[pickVariant(seed, 30)](vars),
  };
}

export function fallbackMessages(ctx: RecoveryContext): RecoveryMessage[] {
  const seq = researchSequenceMessages(ctx);
  const rows: Array<[1 | 2 | 3 | 4 | 5, string]> = [
    [1, seq.day1],
    [2, seq.day3],
    [3, seq.day7],
    [4, seq.day14],
    [5, seq.day30],
  ];
  return rows.map(([n, message]) => ({
    followup_number: n,
    framework: FRAMEWORKS[n],
    message,
    cta_type: n === 5 ? "statement" : "question",
    source: "fallback",
    score: 0,
  }));
}
