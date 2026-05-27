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

export function researchSequenceMessages(ctx: RecoveryContext): {
  day1: string;
  day3: string;
  day7: string;
} {
  const firstName = cleanName(ctx.firstName, "there");
  const contractorFirstName = cleanName(ctx.contractorFirstName, "Contractor");
  const project = projectLabel(ctx.trade);

  return {
    // Day 1 — Pattern Interrupt: "Hey" used only here. Peer-to-peer opener.
    // "Looked back at" = soft Prize Frame (contractor reviews = busy, demanded).
    // Surfaces two real objections: confusion + price anxiety.
    day1: `Hey ${firstName} — ${contractorFirstName} here. Looked back at ${project}. Anything on it that didn't make sense, or any number you want me to walk through?`,

    // Day 3 — Time Frame + Prize Frame: NO greeting, name only.
    // "Holding a slot or releasing it" = loss aversion + scarcity.
    // "What works?" = decisional question; their control.
    day3: `${firstName}, putting next week's schedule together. Need to know if I'm holding a slot for you or releasing it. What works?`,

    // Day 7 — Voss Takeaway Close: NO name, NO greeting, maximum detachment.
    // "Have you given up on" = no-oriented question (safe to answer "No").
    // "Close the file" = explicit withdrawal → loss aversion.
    // "No problem either way" paradoxically lowers defensiveness.
    // Kreuzberger reports 76% response rate on this exact structure.
    day7: `Have you given up on ${project}? If so, I'll close the file — no problem either way. Just need a yes or no so I can clear it from my list.`,
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
