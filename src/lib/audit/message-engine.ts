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
 */

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

export function messageWindowForDays(daysSilent: number | null): MessageWindow {
  if (daysSilent == null) return "warm"; // unknown age → treat as fresh
  if (daysSilent <= 7) return "warm";
  if (daysSilent <= 21) return "cooling";
  if (daysSilent <= 45) return "cold";
  return "closeout";
}

// ---------------------------------------------------------------------------
// Trade-specific project nouns
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

export function projectNounForTrade(trade: string | null | undefined): string {
  if (!trade) return "estimate";
  const key = trade.trim().toLowerCase();
  return PROJECT_NOUNS.get(key) ?? "estimate";
}

// ---------------------------------------------------------------------------
// Message generation
// ---------------------------------------------------------------------------

export function generateFollowupMessage(input: {
  daysSilent: number | null;
  firstName?: string | null;
  trade?: string | null;
}): GeneratedMessage {
  const window = messageWindowForDays(input.daysSilent);
  const noun = projectNounForTrade(input.trade);
  const project = noun === "estimate" ? "estimate" : `${noun} estimate`;
  const name = input.firstName?.trim() || null;

  switch (window) {
    case "warm":
      return warmMessage(name, project);
    case "cooling":
      return coolingMessage(name, project);
    case "cold":
      return coldMessage(name, project);
    case "closeout":
      return closeoutMessage(name, project);
  }
}

function warmMessage(name: string | null, project: string): GeneratedMessage {
  const greeting = name ? `Hi ${name} — ` : "";
  return {
    message: `${greeting}quick check on the ${project} — any question on scope, timing, or price I can clear up here?`,
    window: "warm",
    messageFamily: "quick_check",
    whyThisMessage:
      "The estimate is still fresh, so the goal is to reopen the conversation with one easy question.",
    whyThisWorks:
      "It asks for one small question instead of forcing the homeowner to make a full decision.",
    oneTapOptions: [
      "Have one question",
      "Still reviewing",
      "Timing is the issue",
      "Not right now",
    ],
  };
}

function coolingMessage(name: string | null, project: string): GeneratedMessage {
  const greeting = name ? `Hi ${name} — ` : "";
  return {
    message: `${greeting}when a quote goes quiet, it's usually timing, budget, or one part of the scope. If one of those is the hold-up on the ${project}, reply with which one and I'll make it easier.`,
    window: "cooling",
    messageFamily: "friction_diagnosis",
    whyThisMessage:
      "The homeowner may be stuck on timing, budget, or scope. This message gives them easy categories to answer with.",
    whyThisWorks:
      "It gives the homeowner easy categories to answer with, instead of making them explain the whole situation.",
    oneTapOptions: [
      "Budget",
      "Timing",
      "Scope question",
      "Still comparing",
    ],
  };
}

function coldMessage(_name: string | null, project: string): GeneratedMessage {
  return {
    message: `I can keep the ${project} open, revise it, or close it out for now. Which helps most?`,
    window: "cold",
    messageFamily: "open_revise_close",
    whyThisMessage:
      "The quote is older, so the goal is not pressure. The message gives them a simple open, revise, or close choice.",
    whyThisWorks:
      "It gives the homeowner control and turns silence into a simple status choice.",
    oneTapOptions: [
      "Keep open",
      "Revise it",
      "Close it for now",
      "Went another direction",
    ],
  };
}

function closeoutMessage(_name: string | null, project: string): GeneratedMessage {
  return {
    message: `I'm going to close out the ${project} on my side for now so I'm not sending follow-ups you don't need. If you want to reopen it later, reply here and I'll pull it back up.`,
    window: "closeout",
    messageFamily: "clean_closeout",
    whyThisMessage:
      "It removes the awkwardness of saying no and leaves the door open if the project becomes active later.",
    whyThisWorks:
      "It removes the guilt of saying no and gives the homeowner a safe way to reopen later.",
    oneTapOptions: [
      "Reopen later",
      "Close it",
      "Still possible",
      "Went another direction",
    ],
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
