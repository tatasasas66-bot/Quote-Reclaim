import { titleCase } from "@/lib/utils/normalize";
import type { RecoveryMessage, RecoveryContext } from "./generate-recovery-plan";

/**
 * Deterministic fallback templates backed by:
 * Hatch 163,212-campaign study · Chris Voss (Never Split the Difference)
 * Oren Klaff Prize Frame (Pitch Anything) · Bryan Kreuzberger 76% template
 * Proven blue-collar contractor tone (ContractorTalk)
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
};

// Full "the X estimate" phrase used directly in message templates.
const PROJECT_LABELS: Record<string, string> = {
  roofing: "the roofing estimate",
  plumbing: "the plumbing estimate",
  hvac: "the HVAC estimate",
  electrical: "the electrical estimate",
  remodeling: "the remodel estimate",
  "general contracting": "the project estimate",
  painting: "the painting estimate",
  landscaping: "the landscaping estimate",
  other: "the estimate",
};

const FRAMEWORKS: Record<1 | 2 | 3, RecoveryMessage["framework"]> = {
  1: "Casual Pattern Interrupt",
  2: "Authority & Status Squeeze",
  3: "Professional Closeout",
};

function cleanName(value: string | null | undefined, fallback: string): string {
  const first = (value ?? "").trim().split(/\s+/)[0] ?? "";
  return titleCase(first.replace(/[.,]/g, "")) || fallback;
}

export function projectLabel(trade: string): string {
  const lower = trade.trim().toLowerCase();
  if (!lower) return "the estimate";

  if (PROJECT_LABELS[lower]) return PROJECT_LABELS[lower];

  const aliasMatch = ALIASES[lower];
  if (aliasMatch && PROJECT_LABELS[aliasMatch.toLowerCase()]) {
    return PROJECT_LABELS[aliasMatch.toLowerCase()];
  }

  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (lower.includes(alias) && PROJECT_LABELS[canonical.toLowerCase()]) {
      return PROJECT_LABELS[canonical.toLowerCase()];
    }
  }

  for (const [key, label] of Object.entries(PROJECT_LABELS)) {
    if (lower.includes(key)) return label;
  }

  return `the ${lower} estimate`;
}

export type VariantVars = {
  firstName: string;
  contractorFirstName: string;
  project: string;
};

/**
 * Four phrasings per day. Each preserves the per-day psychological frame but
 * varies verbs, structure, and opening so two different quotes do not read
 * identically (anti-repetition).
 *
 * INVARIANT: index 0 is the canonical research template and must stay
 * verbatim — the AI exact-match gate in generate-recovery-plan and the locked
 * fallback tests both pin it. Every variant must pass validateMessage:
 * under 220 chars, exactly one question mark, no exclamation, no emoji, no
 * banned phrase, and the per-day start pattern (Hey name / name comma / none).
 */
const DAY1_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  // v1 — Pattern Interrupt (canonical). Surfaces confusion + price anxiety.
  ({ firstName, contractorFirstName, project }) =>
    `Hey ${firstName} — ${contractorFirstName} here. Looked back at ${project}. Anything on it that didn't make sense, or any number you want me to walk through?`,
  ({ firstName, project }) =>
    `Hey ${firstName} — quick one on ${project}. Was the scope clear, or is there a line you want me to break down?`,
  ({ firstName, contractorFirstName, project }) =>
    `Hey ${firstName} — ${contractorFirstName}. Circling on ${project} — anything in the numbers or the timeline you'd want me to clarify?`,
  ({ firstName, project }) =>
    `Hey ${firstName} — about ${project}: did everything land right, or is there a detail you'd want me to walk through first?`,
];

const DAY3_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  // v1 — Authority/Prize Frame (canonical). Schedule scarcity + loss aversion.
  ({ firstName }) =>
    `${firstName}, putting next week's schedule together. Need to know if I'm holding a slot for you or releasing it. What works?`,
  ({ firstName }) =>
    `${firstName}, finalizing next week's bookings. Want me to keep your spot, or let it go to the next job? Your call.`,
  ({ firstName }) =>
    `${firstName}, locking in the schedule for the week. Should I hold your slot or open it up? Let me know either way.`,
  ({ firstName }) =>
    `${firstName}, mapping out next week's crew. Hold your spot or release it? Just need a direction.`,
];

const DAY7_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  // v1 — Voss Takeaway (canonical). No name, no greeting, binary close.
  ({ project }) =>
    `Have you given up on ${project}? If so, I'll close the file — no problem either way. Just need a yes or no so I can clear it from my list.`,
  ({ project }) =>
    `Should I close out ${project} for now? A yes or no is all I need — no pressure either way.`,
  ({ project }) =>
    `Are you moving in a different direction on ${project}? Either way is fine, I just need to clear my list.`,
  ({ project }) =>
    `Closing out files this week. Is ${project} still alive, or should I let it go? One word works.`,
];

/**
 * All variant builders keyed by day. Exported so tests can enumerate and
 * validate all 12 (3 days × 4 variants).
 */
export const SEQUENCE_VARIANTS: Record<
  1 | 3 | 7,
  ReadonlyArray<(v: VariantVars) => string>
> = {
  1: DAY1_VARIANTS,
  3: DAY3_VARIANTS,
  7: DAY7_VARIANTS,
};

/**
 * Deterministic variant index (0-3) for a quote + day. The same quote always
 * maps to the same phrasing (stable across reloads and regenerations); two
 * different quotes spread across the four phrasings.
 *
 * An empty/missing quoteId returns 0 — the canonical template — which keeps
 * server-side previews and the locked exact-match tests stable.
 */
export function pickVariant(quoteId: string | null | undefined, day: 1 | 3 | 7): number {
  if (!quoteId) return 0;
  let hash = 0;
  const seed = `${quoteId}:${day}`;
  for (let i = 0; i < seed.length; i++) {
    // FNV-ish rolling hash; >>> 0 keeps it an unsigned 32-bit int.
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 4;
}

export function researchSequenceMessages(ctx: RecoveryContext): {
  day1: string;
  day3: string;
  day7: string;
} {
  const vars: VariantVars = {
    firstName: cleanName(ctx.firstName, "there"),
    contractorFirstName: cleanName(ctx.contractorFirstName, "Contractor"),
    project: projectLabel(ctx.trade),
  };
  const quoteId = ctx.quoteId ?? "";

  return {
    day1: DAY1_VARIANTS[pickVariant(quoteId, 1)](vars),
    day3: DAY3_VARIANTS[pickVariant(quoteId, 3)](vars),
    day7: DAY7_VARIANTS[pickVariant(quoteId, 7)](vars),
  };
}

export function fallbackMessages(ctx: RecoveryContext): RecoveryMessage[] {
  const sequence = researchSequenceMessages(ctx);

  return [
    {
      followup_number: 1,
      framework: FRAMEWORKS[1],
      message: sequence.day1,
      cta_type: "question",
      source: "fallback",
      score: 0,
    },
    {
      followup_number: 2,
      framework: FRAMEWORKS[2],
      message: sequence.day3,
      cta_type: "question",
      source: "fallback",
      score: 0,
    },
    {
      followup_number: 3,
      framework: FRAMEWORKS[3],
      message: sequence.day7,
      cta_type: "question",
      source: "fallback",
      score: 0,
    },
  ];
}
