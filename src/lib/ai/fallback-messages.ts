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

const FRAMEWORKS: Record<1 | 2 | 3 | 4 | 5, RecoveryMessage["framework"]> = {
  1: "Casual Pattern Interrupt",
  2: "Authority & Status Squeeze",
  3: "Professional Closeout",
  4: "Value Re-frame",
  5: "Final Breakup",
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
  // v0 (canonical — exact-match gate). Surfaces real objections, helper frame.
  ({ firstName, contractorFirstName, project }) =>
    `Hey ${firstName} — ${contractorFirstName} here. Looked back at ${project}. Anything on it that didn't make sense, or any number you want me to walk through?`,
  // v1 — "Before you decide" was rewritten as "for you" to keep the helper
  // frame without tripping the locked banned-phrase list (recovery-messages
  // test pins "before you decide" in BANNED_PHRASES).
  ({ firstName, contractorFirstName, project }) =>
    `Hey ${firstName} — ${contractorFirstName}. Re-read ${project} on my end. Was there a number or a detail you'd want me to break down for you?`,
  ({ firstName, contractorFirstName, project }) =>
    `Hey ${firstName} — ${contractorFirstName} here. Want to be sure ${project} fit what you pictured. Anything feel off, or a line you'd want explained?`,
  ({ firstName, contractorFirstName, project }) =>
    `Hey ${firstName} — ${contractorFirstName}. Before this sits too long: was ${project} clear, or is there something on it you're still weighing?`,
];

const DAY3_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  // v0 (canonical). Real schedule scarcity, no fabricated countdown.
  ({ firstName }) =>
    `${firstName}, putting next week's schedule together. Need to know if I'm holding a slot for you or releasing it. What works?`,
  ({ firstName }) =>
    `${firstName}, booking out next week's jobs. Keep your spot on the board or open it to the next house? Either way works — just need to know.`,
  ({ firstName }) =>
    `${firstName}, laying out the crew's week. I can hold your slot a bit longer or release it — which way do you want me to go?`,
  ({ firstName }) =>
    `${firstName}, locking the schedule today. Pencil you in or let the slot go? A quick yes or no tells me how to plan.`,
];

const DAY7_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  // v0 (canonical). No name, no greeting — pure Voss takeaway.
  ({ project }) =>
    `Have you given up on ${project}? If so, I'll close the file — no problem either way. Just need a yes or no so I can clear it from my list.`,
  ({ firstName, project }) =>
    `${firstName}, should I take ${project} off my board? A no keeps it open, a yes closes it — either is fine, I just need to know where it stands.`,
  ({ project }) =>
    `Are you leaning a different direction on ${project}? No hard feelings if so — I just don't want to hold a spot if you've moved on.`,
  ({ firstName, project }) =>
    `${firstName}, is ${project} dead or just on pause? Tell me to close it or hold it — either way I'll respect it. Just need one word.`,
];

const DAY14_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  // Value Re-frame. Silence is usually price shock, not rejection — reopen
  // with phasing/scope, never a discount.
  ({ firstName, project }) =>
    `${firstName}, sometimes ${project} stalls on budget, not interest. If that's it, I can phase the work or trim scope. Want me to put an option together?`,
  ({ firstName, project }) =>
    `${firstName}, if the number on ${project} was the holdup, just say so — I'd rather find a version that fits than lose it. Want me to rework it?`,
  ({ firstName, project }) =>
    `${firstName}, no pressure on ${project}. But if budget or timing is the issue, there's usually a way to phase it. Want a leaner option?`,
  ({ firstName, project }) =>
    `${firstName}, folks often go quiet on ${project} over the total, not the work. If that's you, I can show a phased path. Worth a look?`,
];

const DAY30_VARIANTS: ReadonlyArray<(v: VariantVars) => string> = [
  // Final Breakup. Withdraw the offer. Declarative, no question by design.
  ({ firstName, project }) =>
    `${firstName}, last one from me on ${project} — closing the file so I stop crowding your inbox. If it ever comes back around, you know where I am.`,
  ({ firstName, project }) =>
    `${firstName}, I'll let ${project} go after this. No hard feelings. If anything changes down the road, reach out and I'll pick it right back up.`,
  ({ firstName, project }) =>
    `${firstName}, closing ${project} out today — figure you've moved on, and that's fine. Door's open if you ever want to revisit it.`,
  ({ firstName, project }) =>
    `${firstName}, this is me officially closing ${project}. I won't reach out again. If the timing's just off, save my number and get in touch.`,
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

/**
 * Deterministic variant index (0-3) for a quote + day. The same quote always
 * maps to the same phrasing (stable across reloads and regenerations); two
 * different quotes spread across the four phrasings.
 *
 * An empty/missing quoteId returns 0 — the canonical template — which keeps
 * server-side previews and the locked exact-match tests stable.
 */
export function pickVariant(
  quoteId: string | null | undefined,
  day: CadenceDay,
): number {
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
  day14: string;
  day30: string;
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
    day14: DAY14_VARIANTS[pickVariant(quoteId, 14)](vars),
    day30: DAY30_VARIANTS[pickVariant(quoteId, 30)](vars),
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
