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
  switch (window) {
    case "warm":
      return ["Have one question", "Still reviewing", "Timing is the issue", "Not right now"];
    case "cooling":
      return ["Budget", "Timing", "Scope question", "Still comparing"];
    case "cold":
      return ["Keep open", "Revise it", "Close it for now", "Went another direction"];
    case "closeout":
      return ["Reopen later", "Close it", "Still possible", "Went another direction"];
    default:
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
  const project = noun === "estimate" ? "estimate" : `${noun} estimate`;

  let message: string;
  switch (window) {
    case "warm":
      message = name
        ? `Hi ${name} — quick check on the ${project} — any question on scope, timing, or price I can clear up here?`
        : `Quick check on the ${project} — any question on scope, timing, or price I can clear up here?`;
      break;
    case "cooling":
      message = name
        ? `Hi ${name} — when a quote goes quiet, it's usually timing, budget, or one part of the scope. If one of those is the hold-up on the ${project}, reply with which one and I'll make it easier.`
        : `When a quote goes quiet, it's usually timing, budget, or one part of the scope. If one of those is the hold-up on the ${project}, reply with which one and I'll make it easier.`;
      break;
    case "cold":
      message = `I can keep the ${project} open, revise it, or close it out for now. Which helps most?`;
      break;
    case "closeout":
      message = `I'm going to close out the ${project} on my side for now so I'm not sending follow-ups you don't need. If you want to reopen it later, reply here and I'll pull it back up.`;
      break;
    default:
      message = name
        ? `Hi ${name} — quick check on the ${project} — any question on scope, timing, or price I can clear up here?`
        : `Quick check on the ${project} — any question on scope, timing, or price I can clear up here?`;
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

const PROJECT_NOUNS: ReadonlyMap<string, string> = new Map<string, string>([
  ["concrete", "driveway"],
  ["driveway", "driveway"],
  ["fencing", "fence"],
  ["fence", "fence"],
  ["painting", "painting"],
  ["painter", "painting"],
  ["hvac", "AC"],
  ["roofing", "roof"],
  ["roofer", "roof"],
]);

export function getProjectNoun(trade: string | null | undefined): string {
  if (!trade) return "estimate";
  const key = trade.trim().toLowerCase();
  return PROJECT_NOUNS.get(key) ?? "estimate";
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
