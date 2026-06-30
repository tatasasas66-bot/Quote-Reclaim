/**
 * Centralized recovery logic — the SINGLE source of truth for recovery windows,
 * multipliers, priority labels, message families, why-this-works explanations,
 * one-tap reply options, and quiet signals across the entire Quote Reclaim product.
 *
 * Every surface (audit, homepage, dashboard, quote detail, fallback messages,
 * AI prompt, reply playbook, one-tap reply, quiet signal, tests) must import
 * from this module — never duplicate thresholds or labels locally.
 *
 * Recovery window rules:
 *   0–7 days quiet   = Warm
 *   8–21 days quiet  = Cooling
 *   22–44 days quiet = Cold
 *   45+ days quiet   = Closeout
 *
 * Ranking score:
 *   expectedRecoverableValue = estimateAmount × recoveryMultiplier
 *
 * Multipliers:
 *   Warm     = 1.0
 *   Cooling  = 0.75
 *   Cold     = 0.4
 *   Closeout = 0.15
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecoveryWindow = "warm" | "cooling" | "cold" | "closeout" | "unknown";

export type PriorityLabel =
  | "Send today"
  | "Move today"
  | "Follow up next"
  | "Closeout touch"
  | "High";

export type MessageFamily =
  | "Estimate Check"
  | "Decision Friction"
  | "Scope Rescue"
  | "Soft Decision Check"
  | "Open, Revise, or Close"
  | "Clean Closeout"
  | "Reopen Later";

export type FollowupNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type QuietSignalLabel = "Early" | "Waiting" | "Cooling off" | "Closeout";

export type ReplyPlaybookPath = {
  id:
    | "still_interested"
    | "price_concern"
    | "bad_timing"
    | "scope_question"
    | "still_comparing"
    | "need_to_talk"
    | "spouse_approval"
    | "went_another_way"
    | "close_for_now"
    | "no_response_breakup"
    | "financing"
    | "do_it_for_less";
  label: string;
  trigger: string;
  response: string;
  whyThisWorks?: string;
};

export type RecoveryMessageContext = {
  firstName?: string | null;
  trade?: string | null;
  projectType?: string | null;
};

// ---------------------------------------------------------------------------
// Recovery window classification — THE single source of truth
// ---------------------------------------------------------------------------

export function getRecoveryWindow(daysQuiet: number | null): RecoveryWindow {
  if (daysQuiet == null) return "unknown";
  if (daysQuiet <= 7) return "warm";
  if (daysQuiet <= 21) return "cooling";
  if (daysQuiet < 45) return "cold";
  return "closeout";
}

export function getRecoveryWindowLabel(window: RecoveryWindow): string {
  switch (window) {
    case "warm": return "Warm";
    case "cooling": return "Cooling";
    case "cold": return "Cold";
    case "closeout": return "Closeout";
    default: return "Unknown";
  }
}

export function getRecoveryWindowDescription(window: RecoveryWindow): string {
  switch (window) {
    case "warm":
      return "Fresh enough for a simple low-pressure question.";
    case "cooling":
      return "Still recoverable, but the message should make the homeowner's reply easier.";
    case "cold":
      return "Older estimate. Use a direct, low-pressure message instead of chasing.";
    case "closeout":
      return "Old enough that a clean closeout may be the best move — leave the door open to reopen later.";
    default:
      return "Add days quiet when you know them for a clearer window.";
  }
}

// ---------------------------------------------------------------------------
// Recovery multiplier + expected recovery value
// ---------------------------------------------------------------------------

export function getRecoveryMultiplier(window: RecoveryWindow): number {
  switch (window) {
    case "warm": return 1.0;
    case "cooling": return 0.75;
    case "cold": return 0.4;
    case "closeout": return 0.15;
    default: return 1.0;
  }
}

export function getExpectedRecoveryValue(
  amount: number,
  daysQuiet: number | null,
): number {
  const window = getRecoveryWindow(daysQuiet);
  return amount * getRecoveryMultiplier(window);
}

// ---------------------------------------------------------------------------
// Priority label — derived from recovery window, NOT the window itself
// ---------------------------------------------------------------------------

export function getPriorityLabel(
  window: RecoveryWindow,
  isSelected = false,
): PriorityLabel {
  switch (window) {
    case "warm":
      return isSelected ? "Send today" : "Send today";
    case "cooling":
      return "Follow up next";
    case "cold":
      return "High";
    case "closeout":
      return "Closeout touch";
    default:
      return "Send today";
  }
}

// ---------------------------------------------------------------------------
// Message family — maps recovery window to the sequence family
// ---------------------------------------------------------------------------

export function getMessageFamily(window: RecoveryWindow): MessageFamily {
  switch (window) {
    case "warm": return "Decision Friction";
    case "cooling": return "Soft Decision Check";
    case "cold": return "Open, Revise, or Close";
    case "closeout": return "Clean Closeout";
    default: return "Decision Friction";
  }
}

/**
 * The 6-message sequence family names (by step number, 1-6).
 * This is the single source of truth for the sequence — fallback-messages.ts
 * and generate-recovery-plan.ts should import from here.
 */
export const SEQUENCE_FAMILIES: readonly MessageFamily[] = [
  "Decision Friction",
  "Scope Rescue",
  "Soft Decision Check",
  "Open, Revise, or Close",
  "Clean Closeout",
  "Reopen Later",
] as const;

export function getSequenceFamily(step: FollowupNumber): MessageFamily {
  return SEQUENCE_FAMILIES[step - 1]!;
}

// ---------------------------------------------------------------------------
// Why this works — per recovery window (for the command center + audit)
// ---------------------------------------------------------------------------

export function getWhyThisWorks(window: RecoveryWindow): string {
  return getWhyThisWorksForFamily(getMessageFamily(window));
}

export function getWhyThisWorksForFamily(family: MessageFamily): string {
  const explanations: Record<MessageFamily, string> = {
    "Estimate Check":
      "Early silence is normal. One low-pressure question is easier to answer than a decision.",
    "Decision Friction":
      "Homeowners stall because deciding feels like work. Named categories make replying cheap. If it's a pass, giving them permission to say 'no' makes them more likely to reply at all.",
    "Scope Rescue":
      "The full project can feel like too much. A trimmed scope unlocks a smaller yes.",
    "Soft Decision Check":
      "A direct keep-or-close choice lets homeowners answer without having to explain or reject you.",
    "Open, Revise, or Close":
      "At this age they need an exit ramp. Three one-word options remove the awkwardness.",
    "Clean Closeout":
      "Old estimates become mental clutter. A clean close frees both sides and leaves the door open.",
    "Reopen Later":
      "One later check catches changed timing without restarting a chase. No reply leaves the estimate closed.",
  };
  return explanations[family];
}

/**
 * Per-step why-this-works for the 6-message sequence.
 */
export function getWhyThisWorksForStep(step: FollowupNumber): string {
  return getWhyThisWorksForFamily(getSequenceFamily(step));
}

// ---------------------------------------------------------------------------
// One-Tap Reply options — per recovery window
// ---------------------------------------------------------------------------

export function getOneTapOptions(window: RecoveryWindow): string[] {
  switch (window) {
    case "cooling":
      return [
        "Let's do it",
        "Price is the hold-up",
        "Timing's off",
        "Still comparing",
        "Need to talk it over",
        "Can we talk?",
        "Went another way",
      ];
    case "cold":
      return ["Keep open", "Revise it", "Close it for now", "Went another direction"];
    case "closeout":
      return ["Reopen later", "Close it", "Still possible", "Went another direction"];
    case "warm":
    case "unknown":
      return ["Have one question", "Still reviewing", "Timing is the issue", "Not right now"];
  }
}

// ---------------------------------------------------------------------------
// Quiet signal — per recovery window
// ---------------------------------------------------------------------------

export function getQuietSignal(window: RecoveryWindow): {
  signal: QuietSignalLabel;
  stallReason: string;
  evidence: string[];
  recommendedMove: string;
  shameLine: string;
} {
  switch (window) {
    case "warm":
      return {
        signal: "Early",
        stallReason: "Normal early silence",
        evidence: [
          "The quote is still fresh.",
          "There is not enough reply history to call a specific stall reason.",
        ],
        recommendedMove: "Send one clear, low-pressure question today.",
        shameLine:
          "Homeowners often go quiet early because answering feels like committing. This message makes replying safe.",
      };
    case "cooling":
      return {
        signal: "Waiting",
        stallReason: "Decision friction",
        evidence: [
          "The homeowner may be stuck on timing, budget, scope, or comparison.",
        ],
        recommendedMove: "Use a message that gives them easy categories to answer with.",
        shameLine:
          "Homeowners often go quiet because saying 'I can't afford it' feels embarrassing. This message gives them a way to say 'budget' without the shame.",
      };
    case "cold":
      return {
        signal: "Cooling off",
        stallReason: "Stalled decision",
        evidence: [
          "The estimate is older and pressure may reduce replies.",
        ],
        recommendedMove: "Send an open, revise, or close message today.",
        shameLine:
          "At this age, the silence is usually about not knowing how to say no. Three one-word exits make it easy.",
      };
    case "closeout":
      return {
        signal: "Closeout",
        stallReason: "Likely inactive",
        evidence: [
          "The estimate is old enough that a clean closeout may be the best move.",
        ],
        recommendedMove:
          "Close it professionally while leaving the door open to reopen later.",
        shameLine:
          "Old quotes become mental clutter for both sides. A clean close frees everyone.",
      };
    default:
      return {
        signal: "Early",
        stallReason: "Normal early silence",
        evidence: ["The quote is still fresh."],
        recommendedMove: "Send one clear, low-pressure question today.",
        shameLine:
          "Homeowners often go quiet early because answering feels like committing. This message makes replying safe.",
      };
  }
}

// ---------------------------------------------------------------------------
// Recommended messages — one deterministic family library for every surface
// ---------------------------------------------------------------------------

type WindowRecommendationInput = {
  daysQuiet: number | null;
  firstName?: string | null;
  trade?: string | null;
  projectType?: string | null;
};

type WindowRecommendation = {
  message: string;
  window: RecoveryWindow;
  messageFamily: MessageFamily;
  whyThisWorks: string;
  oneTapOptions: string[];
};

export function getRecommendedMessage(
  family: MessageFamily,
  context: RecoveryMessageContext,
): string;
export function getRecommendedMessage(
  input: WindowRecommendationInput,
): WindowRecommendation;
export function getRecommendedMessage(
  familyOrInput: MessageFamily | WindowRecommendationInput,
  context?: RecoveryMessageContext,
): string | WindowRecommendation {
  if (typeof familyOrInput === "string") {
    const name = cleanFirstName(context?.firstName);
    const noun = getProjectNoun(context?.trade, context?.projectType);
    const estimateReference =
      noun === "estimate" ? "estimate" : `${noun} estimate`;
    const messages: Record<MessageFamily, string> = {
      "Estimate Check":
        `Any question on the ${noun} I can clear up? Scope, timing, or price — reply with which one.`,
      "Decision Friction":
        `Any question on the ${noun} I can clear up? Scope, timing, or price — reply with which one.`,
      "Scope Rescue":
        `Hi ${name} — no pressure on the ${noun}. If it's timing, budget, or scope, reply with which one and I'll sharpen it. If it's a pass, 'no' works too.`,
      "Soft Decision Check":
        `Should I keep the ${noun} on my active list, or close it out? Either is fine — just tell me which.`,
      "Open, Revise, or Close":
        `I can keep the ${noun} open, revise it, or close it out. Which helps most?`,
      "Clean Closeout":
        `I'll close out the ${noun} on my side so it's off your plate. If the timing changes later, text me here and I'll send a fresh number — no re-quote needed.`,
      "Reopen Later":
        `Saw this ${estimateReference} from a while back. If the timing is better now, I can send a fresh number in 60 seconds. If not, no worries — I'll leave it closed.`,
    };
    return messages[familyOrInput];
  }

  const window = getRecoveryWindow(familyOrInput.daysQuiet);
  const messageFamily = getMessageFamily(window);
  return {
    message: getRecommendedMessage(messageFamily, familyOrInput),
    window,
    messageFamily,
    whyThisWorks: getWhyThisWorks(window),
    oneTapOptions: getOneTapOptions(window),
  };
}

function cleanFirstName(value: string | null | undefined): string {
  const first = value?.trim().split(/\s+/)[0] ?? "";
  return first || "there";
}

// ---------------------------------------------------------------------------
// Project noun suggestions and explicit homeowner-facing nouns
// ---------------------------------------------------------------------------

export const PROJECT_NOUNS: ReadonlyMap<string, string> = new Map<string, string>([
  ["concrete", "driveway"],
  ["driveway", "driveway"],
  ["roofing", "roof"],
  ["roofer", "roof"],
  ["hvac", "system"],
  ["plumbing", "job"],
  ["painting", "project"],
  ["painter", "project"],
  ["landscaping", "project"],
  ["remodeling", "project"],
  ["fencing", "fence"],
  ["fence", "fence"],
  ["flooring", "floor"],
  ["windows & doors", "install"],
  ["windows and doors", "install"],
  ["siding", "siding"],
  ["drywall", "work"],
  ["tree service", "removal"],
  ["electrical", "work"],
  ["general contracting", "project"],
  ["other", "estimate"],
]);

export const PROJECT_TYPE_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  concrete: ["Driveway", "Patio", "Slab", "Repair", "Resurfacing", "Walkway"],
  roofing: ["Roof", "Roof repair", "Roof replacement"],
  hvac: ["AC replacement", "AC repair", "Furnace", "System"],
  painting: ["Exterior", "Interior", "Cabinet refinish", "Trim"],
  landscaping: ["Backyard", "Front yard", "Patio", "Turf", "Planting"],
  fencing: ["Fence", "Gate", "Repair", "Replacement"],
  plumbing: ["Repair", "Install", "Replacement"],
  electrical: ["Panel", "Wiring", "Fixture", "Repair"],
  remodeling: ["Kitchen", "Bathroom", "Basement", "Addition"],
  other: ["Project", "Estimate"],
} as const;

export function getProjectTypeOptions(
  trade: string | null | undefined,
): readonly string[] {
  const key = trade?.trim().toLowerCase() ?? "other";
  return PROJECT_TYPE_OPTIONS[key] ?? PROJECT_TYPE_OPTIONS.other;
}

export function getProjectNoun(
  trade: string | null | undefined,
  projectType?: string | null,
): string {
  const specific = projectType?.trim().replace(/^the\s+/i, "");
  if (specific) return specific.toLowerCase();
  if (projectType === "") return "estimate";
  if (!trade) return "estimate";
  const key = trade.trim().toLowerCase();
  return PROJECT_NOUNS.get(key) ?? "estimate";
}

export function getReplyPlaybook(
  trade: string | null | undefined,
  estimateAmount?: number | null,
  projectType?: string | null,
): ReplyPlaybookPath[] {
  const noun = getProjectNoun(trade, projectType);
  const paths: ReplyPlaybookPath[] = [
    {
      id: "still_interested",
      label: "Still interested",
      trigger: "Let's do it — what's next?",
      response:
        "Good news. Want me to hold the dates, or do you need to adjust timing first? Either way I'll have it ready.",
    },
    {
      id: "price_concern",
      label: "Price concern",
      trigger: "Price is the hold-up",
      response: `Totally fair. I can break the ${noun} into must-do, optional, and later — so you see exactly what drives the total and pick the piece that fits. Want me to send that breakdown?`,
    },
    {
      id: "bad_timing",
      label: "Bad timing",
      trigger: "Timing's off",
      response: `No problem. Want me to hold the ${noun} and check back in a few weeks, or close it out for now? Either is fine — just tell me which.`,
    },
    {
      id: "scope_question",
      label: "Scope question",
      trigger: "Part feels unclear",
      response:
        "Sure — which part feels unclear? I'll break just that piece down so you can see what you're paying for.",
    },
    {
      id: "still_comparing",
      label: "Still comparing",
      trigger: "Comparing estimates",
      response:
        "Makes sense — apples to apples matters. One thing to check: are the other estimates covering the same scope, or did anyone trim it to come in lower? I can send a quick side-by-side if it helps.",
    },
    {
      id: "need_to_talk",
      label: "Need to talk",
      trigger: "Can we talk?",
      response:
        "Absolutely. I can call when it works for you. Send me a good time and I'll keep it short.",
    },
    {
      id: "spouse_approval",
      label: "Need spouse or partner approval",
      trigger: "Need to talk it over",
      response:
        "Makes sense — it's a big decision. Want me to send a quick summary you can forward to them? Just the scope, the total, and what's included.",
    },
    {
      id: "went_another_way",
      label: "Went another way",
      trigger: "Went another way",
      response: `Thanks for letting me know. I'll close the ${noun} on my end and keep the door open if anything changes.`,
    },
    {
      id: "close_for_now",
      label: "Close it for now",
      trigger: "Not right now",
      response: `No problem — I'll close it out on my side. If the timing changes later, text me here and I'll pull the ${noun} back up. No re-quote needed.`,
    },
    {
      id: "no_response_breakup",
      label: "No response",
      trigger: "Persistent silence",
      response: `I'll stop following up on this one so it's not cluttering your inbox. If the ${noun} comes back to mind, text me here anytime — no awkward restart.`,
    },
    {
      id: "do_it_for_less",
      label: "Can you do it for less?",
      trigger: "Can you do it for less?",
      response:
        "Honest answer: I can't cut the price without cutting the work behind it. What I CAN do is trim the scope to a smaller version — same quality, smaller number. Want me to send that option?",
      whyThisWorks:
        "Discounting kills margin. Trimming scope protects both the price and the quality.",
    },
  ];
  if (Number(estimateAmount ?? 0) > 5_000) {
    paths.splice(paths.length - 1, 0, {
      id: "financing",
      label: "Financing",
      trigger: "Payment timing",
      response: `If payment timing is the hold-up, I can split the ${noun} into a deposit + milestone payments so the total doesn't hit all at once. Want me to send how that would look?`,
      whyThisWorks:
        "Big totals stall on cash flow, not disinterest. Splitting it removes the payment fear.",
    });
  }
  return paths;
}

export function buildPaymentPlanMessage(
  trade: string | null | undefined,
  projectType?: string | null,
): string {
  const noun = getProjectNoun(trade, projectType);
  return `Here's how we can split the ${noun}: 30% deposit to start, 40% at midpoint, 30% on completion. That keeps the total from hitting all at once. Want me to set that up?`;
}

const SCOPE_COMPARISON_ITEMS: Readonly<Record<string, readonly string[]>> = {
  concrete: [
    "Demo + haul-off",
    "Base prep",
    "Rebar",
    "Pour",
    "Finish",
    "Cleanup",
  ],
  roofing: [
    "Tear-off",
    "Underlayment",
    "Shingles",
    "Flashing",
    "Vent pipe boots",
    "Cleanup",
  ],
  hvac: ["Equipment", "Ductwork", "Thermostat", "Permit", "Removal of old unit"],
  painting: ["Prep", "Patch", "Prime", "Two coats", "Trim", "Cleanup"],
  fencing: ["Tear-out", "Posts", "Rails", "Pickets/panels", "Gates", "Cleanup"],
  flooring: ["Demo", "Subfloor prep", "Material", "Install", "Trim", "Cleanup"],
  "windows & doors": [
    "Removal",
    "Install",
    "Flashing/seal",
    "Trim",
    "Cleanup",
  ],
};

const FALLBACK_SCOPE_ITEMS = [
  "Scope",
  "Materials",
  "Labor",
  "Cleanup",
  "Timeline",
] as const;

export function getScopeComparisonItems(
  trade: string | null | undefined,
): readonly string[] {
  const key = trade?.trim().toLowerCase() ?? "";
  return SCOPE_COMPARISON_ITEMS[key] ?? FALLBACK_SCOPE_ITEMS;
}

export function buildScopeComparisonMessage(
  trade: string | null | undefined,
): string {
  const items = getScopeComparisonItems(trade);
  const commonTrimItem = items[Math.max(0, items.length - 2)] ?? "cleanup";
  return `Here's what's included in my estimate: ${items.join(", ")}. One thing to check on the other bids — are they including ${commonTrimItem}? I can send a quick side-by-side if it helps.`;
}

// ---------------------------------------------------------------------------
// Banned phrases — the single source of truth
// ---------------------------------------------------------------------------

export const BANNED_PHRASES: readonly string[] = [
  "any update",
  "just checking in",
  "are you still interested",
  "wanted to follow up",
  "touching base",
  "circling back",
  "hope you're doing well",
  "let me know if you have any questions",
  "following up on my previous email",
  "did you get my last message",
  "just wanted to see if you had a chance to review",
  "reaching out to see where you're at",
  "feel free to reach out",
  "sorry to bother you",
  "i'd love to earn your business",
  "special discount",
  "limited time offer",
  "match the other bid",
  "following up again",
  "last chance",
  "have you given up",
  "final notice",
  "act now",
  "guaranteed",
  "proven to win",
  "force a reply",
];

export function containsBannedPhrase(message: string): boolean {
  const lower = message.toLowerCase();
  return BANNED_PHRASES.some((p) => lower.includes(p));
}

// ---------------------------------------------------------------------------
// Cadence — the 6-message sequence schedule (single source of truth)
// ---------------------------------------------------------------------------

export const CADENCE_DAYS: Readonly<Record<FollowupNumber, number>> = {
  1: 1,
  2: 5,
  3: 10,
  4: 14,
  5: 21,
  6: 60,
} as const;
