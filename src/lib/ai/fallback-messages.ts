import type { RecoveryMessage, RecoveryContext } from "./generate-recovery-plan";

/**
 * Deterministic fallback templates from:
 * "Engineering a 3-Step SMS Sequence for High-Ticket Home Service Contractors:
 * Research Dossier & Framework"
 *
 * This file is the source of truth when AI is unavailable or rejected.
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

const CANONICAL_PROJECTS = [
  "roofing",
  "plumbing",
  "HVAC",
  "electrical",
  "remodeling",
  "general contracting",
  "painting",
  "landscaping",
] as const;

const FRAMEWORKS: Record<1 | 2 | 3, RecoveryMessage["framework"]> = {
  1: "Casual Pattern Interrupt",
  2: "Authority & Status Squeeze",
  3: "Professional Closeout",
};

function cleanName(value: string | null | undefined, fallback: string): string {
  const first = (value ?? "").trim().split(/\s+/)[0] ?? "";
  return first.replace(/[.,]/g, "") || fallback;
}

export function projectLabel(trade: string): string {
  const raw = trade.trim();
  const lower = raw.toLowerCase();
  if (!lower) return "project";
  // "Other" has no industry noun — fall back to neutral "project" phrasing.
  if (lower === "other") return "project";

  for (const canonical of CANONICAL_PROJECTS) {
    if (lower === canonical.toLowerCase()) return canonical;
  }

  if (ALIASES[lower]) return ALIASES[lower];
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  for (const canonical of CANONICAL_PROJECTS) {
    if (lower.includes(canonical.toLowerCase())) return canonical;
  }

  return lower;
}

export function researchSequenceMessages(ctx: RecoveryContext): {
  day1: string;
  day3: string;
  day7: string;
} {
  const firstName = cleanName(ctx.firstName, "there");
  const contractorFirstName = cleanName(ctx.contractorFirstName, "Contractor");
  const project = projectLabel(ctx.trade);

  return {
    day1: `Hey ${firstName} — ${contractorFirstName} here. Looked back at your ${project} estimate. Anything on it that didn't make sense, or any number you want me to walk through?`,
    day3: `${firstName}, putting next week's ${project} install schedule together. Need to know if I'm holding a slot for you or releasing it. What works?`,
    day7: `Have you given up on the ${project}? If so, I'll close out the file — no problem either way. Just need a yes or no so I can clear it from my list.`,
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
