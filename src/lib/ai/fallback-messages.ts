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
    [/\b(tear[- ]?off|re-?roof|reroof|new roof|full roof|replace)\b/, "roof replacement"],
    [/\b(leak|repair)\b/, "roof repair"],
  ],
  plumbing: [
    [/\b(water heater|tankless)\b/, "water heater"],
    [/\bre-?pipe\b/, "repipe"],
    [/\bsewer\b/, "sewer line"],
    [/\bdrain\b/, "drain work"],
    [/\b(faucet|fixture|sink|toilet|shower)\b/, "fixture work"],
    [/\bleak\b/, "leak repair"],
  ],
  hvac: [
    [/\bheat pump\b/, "heat pump"],
    [/\bmini[- ]?split\b/, "mini-split"],
    [/\bfurnace\b/, "furnace"],
    [/\b(a\/c|\bac\b|air ?condition)\b/, "AC"],
    [/\bduct/, "ductwork"],
  ],
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

/** Resolve a freeform trade string to the canonical JOB_NOUNS / PROJECT_LABELS key. */
function canonicalTradeKey(trade: string): string {
  const lower = trade.trim().toLowerCase();
  if (!lower) return "other";
  if (PROJECT_LABELS[lower]) return lower;
  const aliasMatch = ALIASES[lower];
  if (aliasMatch) return aliasMatch.toLowerCase();
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (lower.includes(alias)) return canonical.toLowerCase();
  }
  for (const key of Object.keys(PROJECT_LABELS)) {
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
   * job specificity converts (Day 1, Day 14, Day 30).
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
const DAY1_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ firstName, contractorFirstName, projectDetail }) =>
    `Hey ${firstName} — ${contractorFirstName} here. I looked back over ${projectDetail}. Was there a number, timing question, or detail you wanted me to break down?`,
  ({ firstName, projectDetail }) =>
    `Hey ${firstName} — I went back through ${projectDetail}. Anything in the scope, timing, or total you want me to clarify?`,
  ({ firstName, projectDetail }) =>
    `Hey ${firstName}, I reviewed ${projectDetail} again on my end. Was anything unclear, or is there a part you want me to walk through?`,
  ({ firstName, projectDetail }) =>
    `Hey ${firstName}, I had another look at ${projectDetail}. If a number or a detail is in the way, I can break it down — what is the holdup?`,
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

// DAY 14 — Options Check. Useful, never discounting. Options/scope frame.
// Job-aware via projectDetail. v1 deliberately drops the list-of-three for a
// single concrete offer so the four variants do not share one shape.
const DAY14_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ firstName, projectDetail }) =>
    `${firstName}, if the total, timing, or scope on ${projectDetail} is what's holding this up, I can walk through options without cutting corners. Worth a look?`,
  ({ firstName, projectDetail }) =>
    `${firstName}, if it's the number on ${projectDetail} giving you pause, I can lay out a couple of ways to handle it without cutting corners. Worth a look?`,
  ({ firstName, projectDetail }) =>
    `${firstName}, sometimes these stall over timing or one detail. If that's the case with ${projectDetail}, want me to walk through the options with you?`,
  ({ firstName, projectDetail }) =>
    `${firstName}, if there's one part of ${projectDetail} holding things up, want me to walk through it so you know exactly where it stands?`,
];

// DAY 30 — Final Closeout. Respectful, detached. Declarative. No question.
// Job-aware via projectDetail so the final touch still names the exact job.
const DAY30_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  ({ firstName, projectDetail }) =>
    `${firstName}, I'll close out ${projectDetail} after this. No hard feelings. If anything changes later, reach out and I'll pick it back up.`,
  ({ firstName, projectDetail }) =>
    `${firstName}, I'm going to close ${projectDetail} on my end for now. If you decide to revisit it later, just reach out.`,
  ({ firstName, projectDetail }) =>
    `${firstName}, I'll mark ${projectDetail} closed for now. No problem either way — if it comes back up later, I can reopen it.`,
  ({ firstName, projectDetail }) =>
    `${firstName}, I'll step back on ${projectDetail} after this. If the timing changes down the road, I'm happy to pick it back up.`,
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
  const project = projectLabel(ctx.trade);
  const detail = jobDetail(ctx.trade, ctx.jobDescription);
  const vars: VariantVars = {
    firstName: cleanName(ctx.firstName, "there"),
    contractorFirstName: cleanName(ctx.contractorFirstName, "Contractor"),
    project,
    projectDetail: projectDetailPhrase(project, detail),
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
