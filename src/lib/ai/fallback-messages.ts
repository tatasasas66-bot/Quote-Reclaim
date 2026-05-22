import type { RecoveryMessage, RecoveryContext } from "./generate-recovery-plan";

/**
 * Deterministic fallback templates. Used when:
 *   - GROQ_API_KEY is absent
 *   - the AI call fails
 *   - the AI output fails validation or scoring twice
 *
 * Every template here must:
 *   - pass validateMessage()
 *   - score >= FALLBACK_FLOOR_SCORE (85)
 *   - stay under 320 chars
 *   - include {firstName} and a trade keyword
 *   - avoid every banned phrase
 *
 * Trades not in this table fall through to the GENERIC set which uses the
 * literal trade word the contractor supplied — so any custom trade still gets
 * a personalised plan, just less industry-specific.
 */

type TradeTemplates = {
  reassurance: (firstName: string) => string;
  nextStep: (firstName: string) => string;
  checkIn: (firstName: string) => string;
};

const TEMPLATES: Record<string, TradeTemplates> = {
  roofing: {
    reassurance: (n) =>
      `Hi ${n}, I sent the roofing estimate over. If scope, materials, or warranty details are unclear, I can clean that up quickly. Any questions before you decide?`,
    nextStep: (n) =>
      `Hi ${n}, if the roofing work is still on your list, I can make the next step simple. Want me to walk through a couple scheduling options?`,
    checkIn: (n) =>
      `Hi ${n}, should I keep this roofing estimate active, or close it out for now? Either way is fine — I just don't want to leave it hanging.`,
  },
  plumbing: {
    reassurance: (n) =>
      `Hi ${n}, I sent the plumbing estimate over. If the scope, repair path, or timing is unclear, I can clean that up quickly. Any questions before you decide?`,
    nextStep: (n) =>
      `Hi ${n}, if the plumbing work is still on your list, I can make the next step simple. Want me to send the scope summary again?`,
    checkIn: (n) =>
      `Hi ${n}, should I keep this plumbing estimate active, or close it out for now? Either way is fine — I just don't want to leave it hanging.`,
  },
  hvac: {
    reassurance: (n) =>
      `Hi ${n}, I sent the HVAC estimate over. If the system options, install timing, or equipment choice are unclear, I can clean that up quickly. Any questions before you decide?`,
    nextStep: (n) =>
      `Hi ${n}, if the HVAC work is still on your list, I can make the next step simple. Want me to walk through the system options once more?`,
    checkIn: (n) =>
      `Hi ${n}, should I keep this HVAC estimate active, or close it out for now? Either way is fine — I just don't want to leave it hanging.`,
  },
  electrical: {
    reassurance: (n) =>
      `Hi ${n}, I sent the electrical estimate over. If the scope, panel work, or safety details are unclear, I can clean that up quickly. Any questions before you decide?`,
    nextStep: (n) =>
      `Hi ${n}, if the electrical work is still on your list, I can make the next step simple. Want me to walk through the scope again?`,
    checkIn: (n) =>
      `Hi ${n}, should I keep this electrical estimate active, or close it out for now? Either way is fine — I just don't want to leave it hanging.`,
  },
  remodeling: {
    reassurance: (n) =>
      `Hi ${n}, I sent the remodeling estimate over. If scope, timeline, or materials are unclear, I can clean that up quickly. Any questions before you decide?`,
    nextStep: (n) =>
      `Hi ${n}, if the remodeling work is still on your list, I can make the next step simple. Want me to share a one-page summary you can pass to anyone helping decide?`,
    checkIn: (n) =>
      `Hi ${n}, should I keep this remodeling estimate active, or close it out for now? Either way is fine — I just don't want to leave it hanging.`,
  },
  "general contracting": {
    reassurance: (n) =>
      `Hi ${n}, I sent the general contracting estimate over. If scope, schedule, or coordination details are unclear, I can clean that up quickly. Any questions before you decide?`,
    nextStep: (n) =>
      `Hi ${n}, if the general contracting work is still on your list, I can make the next step simple. Want me to walk through the scope and timeline once more?`,
    checkIn: (n) =>
      `Hi ${n}, should I keep this general contracting estimate active, or close it out for now? Either way is fine — I just don't want to leave it hanging.`,
  },
};

const ALIASES: Record<string, string> = {
  roof: "roofing",
  roofs: "roofing",
  shingles: "roofing",
  plumber: "plumbing",
  plumbers: "plumbing",
  "water heater": "plumbing",
  heating: "hvac",
  cooling: "hvac",
  ac: "hvac",
  "a/c": "hvac",
  hvacr: "hvac",
  electrician: "electrical",
  electric: "electrical",
  remodel: "remodeling",
  renovation: "remodeling",
  renovations: "remodeling",
  "general contractor": "general contracting",
  gc: "general contracting",
  "general contracting": "general contracting",
};

function normalizeTrade(trade: string): string | null {
  const t = trade.toLowerCase().trim();
  if (!t) return null;
  if (TEMPLATES[t]) return t;
  if (ALIASES[t]) return ALIASES[t];
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (t.includes(alias)) return canonical;
  }
  for (const canonical of Object.keys(TEMPLATES)) {
    if (t.includes(canonical)) return canonical;
  }
  return null;
}

function genericReassurance(firstName: string, trade: string): string {
  return `Hi ${firstName}, I sent the ${trade} estimate over. If scope, timing, or materials are unclear, I can clean that up quickly. Any questions before you decide?`;
}

function genericNextStep(firstName: string, trade: string): string {
  return `Hi ${firstName}, if the ${trade} work is still on your list, I can make the next step simple. Want me to walk through the scope again?`;
}

function genericCheckIn(firstName: string, trade: string): string {
  return `Hi ${firstName}, should I keep this ${trade} estimate active, or close it out for now? Either way is fine — I just don't want to leave it hanging.`;
}

const FRAMEWORKS: Record<1 | 2 | 3, RecoveryMessage["framework"]> = {
  1: "Specific Reassurance",
  2: "Easy Next Step",
  3: "Permission-Based Check-In",
};

export function fallbackMessages(ctx: RecoveryContext): RecoveryMessage[] {
  const firstName = ctx.firstName;
  const canonical = normalizeTrade(ctx.trade);
  const tpl = canonical ? TEMPLATES[canonical] : null;

  const m1 = tpl ? tpl.reassurance(firstName) : genericReassurance(firstName, ctx.trade);
  const m2 = tpl ? tpl.nextStep(firstName) : genericNextStep(firstName, ctx.trade);
  const m3 = tpl ? tpl.checkIn(firstName) : genericCheckIn(firstName, ctx.trade);

  return [
    {
      followup_number: 1,
      framework: FRAMEWORKS[1],
      message: m1,
      cta_type: "question",
      source: "fallback",
      score: 0, // caller will fill via scoreMessage if needed
    },
    {
      followup_number: 2,
      framework: FRAMEWORKS[2],
      message: m2,
      cta_type: "question",
      source: "fallback",
      score: 0,
    },
    {
      followup_number: 3,
      framework: FRAMEWORKS[3],
      message: m3,
      cta_type: "question",
      source: "fallback",
      score: 0,
    },
  ];
}
