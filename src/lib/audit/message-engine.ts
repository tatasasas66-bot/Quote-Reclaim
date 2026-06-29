/**
 * Decision-friction follow-up message engine.
 *
 * Generates homeowner follow-up messages based on the estimate's recovery
 * window and the most likely reason the homeowner went quiet. The goal is to
 * reduce decision friction — not to pressure the homeowner.
 *
 * Formula: project anchor + likely blocker + low-pressure alternate path + easy reply
 *
 * Deterministic, no AI calls. Trade-aware via project noun substitution.
 *
 * Window classification delegates to the centralized recovery-logic module.
 */

import {
  getOneTapOptions,
  getProjectNoun as centralizedGetProjectNoun,
  getRecommendedMessage,
  getRecoveryWindow,
  getWhyThisWorksForFamily,
} from "@/lib/recovery/recovery-logic";

export type MessageWindow = "warm" | "cooling" | "cold" | "closeout";

export type MessageFamily =
  | "quick_check"
  | "friction_diagnosis"
  | "open_revise_close"
  | "clean_closeout";

export type GeneratedMessage = {
  message: string;
  window: MessageWindow;
  messageFamily: MessageFamily;
  whyThisMessage: string;
  whyThisWorks: string;
  oneTapOptions: string[];
};

// ---------------------------------------------------------------------------
// Banned phrases — hard-banned from every generated message
// ---------------------------------------------------------------------------

export const BANNED_PHRASES: readonly string[] = [
  "just checking in",
  "any update",
  "following up again",
  "touching base",
  "circling back",
  "last chance",
  "limited time",
  "are you still interested",
  "we need to know",
  "don't miss out",
  "act now",
  "i haven't heard from you",
  "have you given up",
  "final notice",
  "sign today",
  "book now or lose your spot",
];

// ---------------------------------------------------------------------------
// Unsupported claim phrases — never generated unless contractor-provided
// ---------------------------------------------------------------------------

export const UNSUPPORTED_CLAIM_PHRASES: readonly string[] = [
  "crew nearby",
  "schedule opening",
  "discount",
  "delivery savings",
  "financing",
  "0% financing",
  "tax credit",
  "rebate",
  "warranty",
  "weather window",
  "neighborhood slot",
];

// ---------------------------------------------------------------------------
// Window classification — independent of recoveryWindowForDays (which uses
// different thresholds for the Quiet Signal feature). The message engine uses
// tighter bands that match the decision-friction model.
// ---------------------------------------------------------------------------

/**
 * Delegates to the centralized recovery-logic module.
 * Unknown age → warm (treat as fresh).
 */
export function messageWindowForDays(daysSilent: number | null): MessageWindow {
  const window = getRecoveryWindow(daysSilent);
  if (window === "unknown") return "warm";
  return window as MessageWindow;
}

// ---------------------------------------------------------------------------
// Trade-specific project nouns
// ---------------------------------------------------------------------------

/**
 * Delegates to the centralized recovery-logic module.
 */
export function projectNounForTrade(trade: string | null | undefined): string {
  return centralizedGetProjectNoun(trade);
}

// ---------------------------------------------------------------------------
// Message generation
// ---------------------------------------------------------------------------

export function generateFollowupMessage(input: {
  daysSilent: number | null;
  firstName?: string | null;
  trade?: string | null;
  projectType?: string | null;
}): GeneratedMessage {
  const window = messageWindowForDays(input.daysSilent);
  const name = input.firstName?.trim() || null;

  switch (window) {
    case "warm":
      return warmMessage(name, input.trade, input.projectType);
    case "cooling":
      return coolingMessage(name, input.trade, input.projectType);
    case "cold":
      return coldMessage(input.trade, input.projectType);
    case "closeout":
      return closeoutMessage(input.trade, input.projectType);
  }
}

function warmMessage(
  name: string | null,
  trade: string | null | undefined,
  projectType?: string | null,
): GeneratedMessage {
  return {
    message: getRecommendedMessage("Decision Friction", {
      firstName: name,
      trade,
      projectType,
    }),
    window: "warm",
    messageFamily: "quick_check",
    whyThisMessage:
      "The estimate is still fresh, so the goal is to reopen the conversation with one easy question.",
    whyThisWorks: getWhyThisWorksForFamily("Decision Friction"),
    oneTapOptions: getOneTapOptions("warm"),
  };
}

function coolingMessage(
  name: string | null,
  trade: string | null | undefined,
  projectType?: string | null,
): GeneratedMessage {
  return {
    message: getRecommendedMessage("Soft Decision Check", {
      firstName: name,
      trade,
      projectType,
    }),
    window: "cooling",
    messageFamily: "friction_diagnosis",
    whyThisMessage:
      "The homeowner may already have decided but feel awkward saying it. This message makes keep or close equally safe.",
    whyThisWorks: getWhyThisWorksForFamily("Soft Decision Check"),
    oneTapOptions: getOneTapOptions("cooling"),
  };
}

function coldMessage(
  trade: string | null | undefined,
  projectType?: string | null,
): GeneratedMessage {
  return {
    message: getRecommendedMessage("Open, Revise, or Close", {
      trade,
      projectType,
    }),
    window: "cold",
    messageFamily: "open_revise_close",
    whyThisMessage:
      "The quote is older, so the goal is not pressure. The message gives them a simple open, revise, or close choice.",
    whyThisWorks: getWhyThisWorksForFamily("Open, Revise, or Close"),
    oneTapOptions: getOneTapOptions("cold"),
  };
}

function closeoutMessage(
  trade: string | null | undefined,
  projectType?: string | null,
): GeneratedMessage {
  return {
    message: getRecommendedMessage("Clean Closeout", {
      trade,
      projectType,
    }),
    window: "closeout",
    messageFamily: "clean_closeout",
    whyThisMessage:
      "It removes the awkwardness of saying no and leaves the door open if the project becomes active later.",
    whyThisWorks: getWhyThisWorksForFamily("Clean Closeout"),
    oneTapOptions: getOneTapOptions("closeout"),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function containsBannedPhrase(message: string): boolean {
  const lower = message.toLowerCase();
  return BANNED_PHRASES.some((p) => lower.includes(p));
}

export function containsUnsupportedClaim(message: string): boolean {
  const lower = message.toLowerCase();
  return UNSUPPORTED_CLAIM_PHRASES.some((p) => lower.includes(p));
}

/**
 * Quality gate — returns true if the message passes all checks.
 * Fails if: banned phrase, unsupported claim, fake urgency, guarantee,
 * more than 3 sentences, or more than one main question.
 */
export function messagePassesQualityGate(message: string): {
  pass: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (containsBannedPhrase(message)) {
    reasons.push("Contains a banned phrase");
  }
  if (containsUnsupportedClaim(message)) {
    reasons.push("Contains an unsupported operational claim");
  }
  if (/guarantee/i.test(message)) {
    reasons.push("Contains 'guarantee'");
  }
  // Count sentences (rough: split on . ? ! followed by space or end)
  const sentences = message.split(/[.?!]+/).filter((s) => s.trim().length > 0);
  if (sentences.length > 3) {
    reasons.push(`Too long: ${sentences.length} sentences (max 3)`);
  }
  // Count question marks — more than 1 main question fails
  const questionMarks = (message.match(/\?/g) ?? []).length;
  if (questionMarks > 1) {
    reasons.push(`Asks ${questionMarks} questions (max 1 main question)`);
  }
  return { pass: reasons.length === 0, reasons };
}
