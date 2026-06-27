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
  | "Open, Revise, or Close"
  | "Clean Closeout";

export type QuietSignalLabel = "Early" | "Waiting" | "Cooling off" | "Closeout";

export type ReplyPlaybookPath = {
  id:
    | "still_interested"
    | "price_concern"
    | "bad_timing"
    | "scope_question"
    | "still_comparing"
    | "need_to_talk"
    | "went_another_way"
    | "close_for_now";
  label: string;
  trigger: string;
  response: string;
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
// Message family — maps recovery window to the 5-step sequence family
// ---------------------------------------------------------------------------

export function getMessageFamily(window: RecoveryWindow): MessageFamily {
  switch (window) {
    case "warm": return "Estimate Check";
    case "cooling": return "Decision Friction";
    case "cold": return "Open, Revise, or Close";
    case "closeout": return "Clean Closeout";
    default: return "Estimate Check";
  }
}

/**
 * The 5-message sequence family names (by step number, 1-5).
 * This is the single source of truth for the sequence — fallback-messages.ts
 * and generate-recovery-plan.ts should import from here.
 */
export const SEQUENCE_FAMILIES: readonly MessageFamily[] = [
  "Estimate Check",
  "Decision Friction",
  "Scope Rescue",
  "Open, Revise, or Close",
  "Clean Closeout",
] as const;

export function getSequenceFamily(step: 1 | 2 | 3 | 4 | 5): MessageFamily {
  return SEQUENCE_FAMILIES[step - 1]!;
}

// ---------------------------------------------------------------------------
// Why this works — per recovery window (for the command center + audit)
// ---------------------------------------------------------------------------

export function getWhyThisWorks(window: RecoveryWindow): string {
  switch (window) {
    case "warm":
      return "The estimate is still fresh, so one clear question is easier to answer than forcing a full decision.";
    case "cooling":
      return "It gives the homeowner simple categories to answer with instead of making them explain the whole situation.";
    case "cold":
      return "It avoids pressure and gives a simple open, revise, or close path.";
    case "closeout":
      return "It removes the awkwardness of saying no while leaving the door open to reopen later.";
    default:
      return "It asks a specific question, not 'any update?'. That makes it easier for the homeowner to answer.";
  }
}

/**
 * Per-step why-this-works for the 5-message sequence (used in the Recovery Plan page).
 * Step 3 (Scope Rescue) is not window-specific — it always uses the scope-rescue explanation.
 */
export function getWhyThisWorksForStep(step: 1 | 2 | 3 | 4 | 5): string {
  switch (step) {
    case 1:
      return "The estimate is still fresh, so one clear question is easier to answer than forcing a full decision.";
    case 2:
      return "It gives the homeowner simple categories to answer with instead of making them explain the whole situation.";
    case 3:
      return "If total cost or scope is the blocker, a smaller path gives them a way back without asking for a discount.";
    case 4:
      return "It turns silence into a simple status choice: keep open, revise, or close.";
    case 5:
      return "It removes the awkwardness of saying no while leaving the door open to reopen later.";
  }
}

// ---------------------------------------------------------------------------
// One-Tap Reply options — per recovery window
// ---------------------------------------------------------------------------

export function getOneTapOptions(window: RecoveryWindow): string[] {
  void window;
  return [
    "Let's do it — what's next?",
    "Price is the hold-up",
    "Timing's off",
    "Can we talk?",
    "Went another way",
  ];
}

// ---------------------------------------------------------------------------
// Quiet signal — per recovery window
// ---------------------------------------------------------------------------

export function getQuietSignal(window: RecoveryWindow): {
  signal: QuietSignalLabel;
  stallReason: string;
  evidence: string[];
  recommendedMove: string;
} {
  switch (window) {
    case "warm":
      return {
        signal: "Early",
        stallReason: "Normal early silence",
        evidence: [
          "This estimate is still fresh.",
          "There is not enough reply history to call a specific stall reason.",
        ],
        recommendedMove: "Send one clear, low-pressure question today.",
      };
    case "cooling":
      return {
        signal: "Waiting",
        stallReason: "Decision friction",
        evidence: [
          "The homeowner may be stuck on timing, budget, scope, or comparison.",
        ],
        recommendedMove: "Use a message that gives them easy categories to answer with.",
      };
    case "cold":
      return {
        signal: "Cooling off",
        stallReason: "Stalled decision",
        evidence: [
          "The estimate is older and pressure may reduce replies.",
        ],
        recommendedMove: "Send an open, revise, or close message today.",
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
      };
    default:
      return {
        signal: "Early",
        stallReason: "Normal early silence",
        evidence: ["This estimate is still fresh."],
        recommendedMove: "Send one clear, low-pressure question today.",
      };
  }
}

// ---------------------------------------------------------------------------
// Recommended message — per recovery window (deterministic, no AI)
// ---------------------------------------------------------------------------

export function getRecommendedMessage(input: {
  daysQuiet: number | null;
  firstName?: string | null;
  trade?: string | null;
}): {
  message: string;
  window: RecoveryWindow;
  messageFamily: MessageFamily;
  whyThisWorks: string;
  oneTapOptions: string[];
} {
  const window = getRecoveryWindow(input.daysQuiet);
  const name = input.firstName?.trim() || null;
  const noun = getProjectNoun(input.trade);
  const greeting = name ? `Hi ${name} — ` : "";

  let message: string;
  switch (window) {
    case "warm":
      message = name
        ? `${greeting}any question on scope, timing, or price I can clear up here?`
        : "Any question on scope, timing, or price I can clear up here?";
      break;
    case "cooling":
      message = `${greeting}no pressure on the ${noun}. If it's timing, budget, or one part of the scope that's holding it up, reply with which one and I'll sharpen that piece. If it's a pass, 'no' works too — no awkward follow-up from me.`;
      break;
    case "cold":
      message = `I can keep this ${noun} open, revise it, or close it out. Which helps most?`;
      break;
    case "closeout":
      message = `I'll close out the ${noun} on my side so it's off your plate. If the timing changes later, text me here and I'll send a fresh number — no restart, no re-quote, no awkward conversation.`;
      break;
    default:
      message = name
        ? `${greeting}any question on scope, timing, or price I can clear up here?`
        : "Any question on scope, timing, or price I can clear up here?";
  }

  return {
    message,
    window,
    messageFamily: getMessageFamily(window),
    whyThisWorks: getWhyThisWorks(window),
    oneTapOptions: getOneTapOptions(window),
  };
}

// ---------------------------------------------------------------------------
// Project noun — trade-specific (used by message engine + audit)
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

export function getProjectNoun(trade: string | null | undefined): string {
  if (!trade) return "estimate";
  const key = trade.trim().toLowerCase();
  return PROJECT_NOUNS.get(key) ?? "estimate";
}

export function getReplyPlaybook(
  trade: string | null | undefined,
): ReplyPlaybookPath[] {
  const noun = getProjectNoun(trade);
  return [
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
      response:
        "Totally fair. I can break it into must-do, optional, and later — so you see exactly what drives the total and pick the piece that fits. Want me to send that breakdown?",
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
  ];
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
  "circling back",
  "touching base",
  "are you still interested",
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
// Cadence — the 5-message sequence schedule (single source of truth)
// ---------------------------------------------------------------------------

export const CADENCE_DAYS: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
} as const;
