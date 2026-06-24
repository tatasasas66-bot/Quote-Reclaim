/**
 * Reply classification — deterministic, pure, no I/O.
 *
 * The order matters: suppression checks (unsubscribe/not_interested/angry)
 * run FIRST and are NEVER overridden by a later, softer classification.
 * This is the safety rail: an email containing "stop" and "interested"
 * still suppresses, because the suppression words win.
 *
 * AI classification (when OPENAI_API_KEY is configured) may run AFTER
 * deterministic suppression checks, but only on replies that fall through
 * to low_confidence. AI can never override a suppression.
 */
import type { ReplyClassification } from "./types";
import { SUPPRESSING_CLASSIFICATIONS, DRAFTABLE_CLASSIFICATIONS } from "./types";

const UNSUBSCRIBE_WORDS = [
  "unsubscribe", "stop", "remove me", "take me off", "do not email",
  "opt out", "opt-out", "no longer", "don't email", "dont email",
];
const NOT_INTERESTED_WORDS = [
  "no thanks", "not interested", "not for us", "not a fit",
  "no thank you", "no thanks", "pass", "hard pass",
];
const ANGRY_WORDS = [
  "spam", "lawsuit", "reported", "illegal", "harassment", "sue",
  "attorney", "lawyer", "cease and desist", "how did you get",
  "where did you get my",
];
const PRICE_WORDS = ["price", "cost", "how much", "monthly", "subscription", "per month", "pricing"];
const HOW_WORDS = ["how does it work", "what is this", "explain", "how it works", "what does it do"];
const LEAD_GEN_WORDS = ["lead", "leads", "angi", "homeadvisor", "thumbtack", "marketing agency", "ad agency"];
const CRM_WORDS = ["jobber", "housecall", "servicetitan", "crm", "already use", "already have"];
const INTERESTED_WORDS = ["interested", "sounds good", "send info", "tell me more", "let's try", "lets try", "yes", "sure", "ok", "okay"];
const DEMO_WORDS = ["demo", "show me", "see it", "walkthrough", "screen share", "see a demo", "book a call"];
const OOO_WORDS = ["out of office", "out of the office", "ooo", "away from", "on vacation", "returning on", "back in the office", "auto-reply", "automatic reply"];
const BOUNCE_WORDS = ["undeliverable", "bounced", "delivery failed", "mailbox full", "no such user", "does not exist", "recipient not found"];

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function matchesAny(text: string, words: readonly string[]): boolean {
  return words.some((w) => text.includes(w));
}

/**
 * Classify a reply body deterministically.
 *
 * Returns the classification + a confidence (1.0 for deterministic hits,
 * 0.5 for low_confidence fallback). Suppression checks always win.
 */
export function classifyReply(replyBody: string): {
  classification: ReplyClassification;
  confidence: number;
} {
  const text = normalize(replyBody ?? "");

  // 1. Suppression checks FIRST — these can never be overridden.
  if (matchesAny(text, UNSUBSCRIBE_WORDS)) {
    return { classification: "unsubscribe", confidence: 1.0 };
  }
  if (matchesAny(text, ANGRY_WORDS)) {
    return { classification: "angry", confidence: 1.0 };
  }
  if (matchesAny(text, NOT_INTERESTED_WORDS)) {
    return { classification: "not_interested", confidence: 1.0 };
  }

  // Bare "no" alone on a line → not_interested (suppression).
  if (/^(no|n\/a|na)\b\.?$/m.test(text) || text === "no") {
    return { classification: "not_interested", confidence: 1.0 };
  }

  // 2. Bounce check (before interested — bounce emails are system-generated).
  if (matchesAny(text, BOUNCE_WORDS)) {
    return { classification: "bounced", confidence: 1.0 };
  }

  // 3. Out-of-office check (before interested — OOO is system-generated).
  if (matchesAny(text, OOO_WORDS)) {
    return { classification: "out_of_office", confidence: 1.0 };
  }

  // 4. Interested check (before the softer question/objection checks,
  //    because "interested, how much?" should classify as interested).
  if (matchesAny(text, INTERESTED_WORDS)) {
    return { classification: "interested", confidence: 1.0 };
  }

  // 5. Demo request check.
  if (matchesAny(text, DEMO_WORDS)) {
    return { classification: "wants_demo", confidence: 1.0 };
  }

  // 6. Question / objection checks.
  if (matchesAny(text, PRICE_WORDS)) {
    return { classification: "asks_price", confidence: 1.0 };
  }
  if (matchesAny(text, HOW_WORDS)) {
    return { classification: "asks_how_it_works", confidence: 1.0 };
  }
  if (matchesAny(text, LEAD_GEN_WORDS)) {
    return { classification: "lead_gen_confusion", confidence: 1.0 };
  }
  if (matchesAny(text, CRM_WORDS)) {
    return { classification: "existing_crm_objection", confidence: 1.0 };
  }

  // 7. Wrong-person signals.
  if (/\b(wrong person|not me|doesn't handle|don't handle|no longer there|left the company)\b/.test(text)) {
    return { classification: "wrong_person", confidence: 1.0 };
  }

  // 8. Fall through — needs human review (AI may classify later).
  return { classification: "low_confidence", confidence: 0.5 };
}

/** True if this classification must trigger immediate, permanent suppression. */
export function isSuppressing(c: ReplyClassification): boolean {
  return SUPPRESSING_CLASSIFICATIONS.has(c);
}

/** True if this classification should generate a safe draft reply. */
export function isDraftable(c: ReplyClassification): boolean {
  return DRAFTABLE_CLASSIFICATIONS.has(c);
}

/**
 * Generate a safe draft reply for a draftable classification.
 * Returns null for suppressing or low_confidence classifications.
 */
export function draftReplyFor(
  classification: ReplyClassification,
  companyName?: string | null,
): string | null {
  const AUDIT_URL = "https://www.quotereclaim.com/audit";
  switch (classification) {
    case "interested":
      return `Thanks — the free audit is here:\n${AUDIT_URL}\n\nIt takes about 60 seconds. No signup, no card, no customer names.`;
    case "asks_price":
      return `It is $79/month after the free audit.\n\nBut the audit is free first:\n${AUDIT_URL}\n\nNo signup, no card, no customer names.`;
    case "asks_how_it_works":
      return `You enter a few sent estimates: amount + days quiet.\n\nQuote Reclaim shows which one to follow up first and what message to send today.\n\nFree audit:\n${AUDIT_URL}`;
    case "wants_demo":
      return `Happy to show you. The quickest way to see it is the free audit — it takes 60 seconds and shows the whole system:\n${AUDIT_URL}\n\nNo signup, no card, no customer names.`;
    case "lead_gen_confusion":
      return `This is not lead generation.\n\nQuote Reclaim works the estimates you already sent — the ones that went quiet.\n\nFree audit:\n${AUDIT_URL}`;
    case "existing_crm_objection":
      return `Not a CRM. Not estimating software.\n\nQuote Reclaim sits beside what you already use and helps with the quotes that went quiet.\n\nFree audit:\n${AUDIT_URL}`;
    case "wrong_person":
      return `Thanks — who handles quote follow-up at ${companyName ?? "your company"}?`;
    default:
      return null;
  }
}

/** Suppression reason for a suppressing classification. */
export function suppressionReason(c: ReplyClassification): string | null {
  if (!isSuppressing(c)) return null;
  return `reply_${c}`;
}
