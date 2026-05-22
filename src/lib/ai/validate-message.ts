/**
 * Hard validation rules for recovery messages. Anything failing these rules
 * must never be stored or sent. Validation is intentionally strict — false
 * positives are acceptable; false negatives are not.
 */

export type ValidationContext = {
  firstName?: string;
  trade?: string;
};

export type ValidationResult = {
  ok: boolean;
  reasons: string[];
};

export const MAX_MESSAGE_CHARS = 320;

export const BANNED_PHRASES: readonly string[] = [
  "just following up",
  "just checking in",
  "checking back",
  "touching base",
  "circling back",
  "wanted to follow up",
  "checking in to see",
  "quick reminder",
  "final reminder",
  "one final follow-up",
  "one final followup",
  "last chance",
  "act now",
  "don't miss out",
  "don’t miss out",
  "ai-generated",
  "our system",
  "optimize",
  "leverage",
  "please don't hesitate",
  "please don’t hesitate",
  "looking forward to hearing",
  "happy to help",
  "on file",
  "no problem whenever you're ready",
  "no problem whenever you’re ready",
  "whenever you're ready",
  "whenever you’re ready",
];

const FAKE_AVAILABILITY_PHRASES: readonly string[] = [
  "i have an opening",
  "i have a slot",
  "we have a slot",
  "i have a crew available",
  "we have a crew available",
  "open this week",
  "open next week",
  "free this week",
  "free next week",
  "this slot",
  "the appointment",
  "the window i have",
];

const CORPORATE_WORDS: readonly string[] = [
  "synergy",
  "ecosystem",
  "actionable",
  "stakeholder alignment",
  "value proposition",
];

// Detect emoji without the `/u` flag for TS target compatibility:
//   - any UTF-16 surrogate pair lands a character in U+10000..U+10FFFF
//     (covers all modern emoji blocks 1F000-1FFFF)
//   - U+2600..U+27BF covers basic-plane misc symbols / dingbats
const EMOJI_REGEX = /[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]/;

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "of",
  "to",
  "in",
  "on",
  "or",
  "an",
  "a",
]);

/**
 * Break a free-text trade string into the words a message should reference.
 * "Roofing" -> ["roofing"]; "general contracting" -> ["general", "contracting"];
 * "HVAC" -> ["hvac"]; "Roofing & gutters" -> ["roofing", "gutters"].
 */
export function tradeKeywords(trade: string): string[] {
  const words = trade
    .toLowerCase()
    .split(/[\s/&,\-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  if (words.length > 0) return words;
  const fallback = trade.toLowerCase().trim();
  return fallback ? [fallback] : [];
}

export function containsBannedPhrase(message: string): string | null {
  const lower = message.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  return null;
}

export function validateMessage(
  message: string,
  ctx: ValidationContext = {},
): ValidationResult {
  const reasons: string[] = [];
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.length === 0) {
    return { ok: false, reasons: ["empty message"] };
  }

  if (trimmed.length > MAX_MESSAGE_CHARS) {
    reasons.push(
      `exceeds ${MAX_MESSAGE_CHARS} chars (got ${trimmed.length})`,
    );
  }

  const banned = containsBannedPhrase(trimmed);
  if (banned) reasons.push(`banned phrase: "${banned}"`);

  // Hard pressure framings
  if (/\bfinal\b/i.test(trimmed)) reasons.push("uses 'final' framing");
  if (/last chance/i.test(trimmed)) reasons.push("uses 'last chance' framing");
  if (/\b(urgent|asap|immediately|right now|act now)\b/i.test(trimmed)) {
    reasons.push("uses pressure language");
  }

  // CTA / question count
  const questions = (trimmed.match(/\?/g) ?? []).length;
  if (questions > 1) reasons.push(`more than one question (${questions})`);

  // Exclamations
  const exclamations = (trimmed.match(/!/g) ?? []).length;
  if (exclamations > 1) {
    reasons.push(`more than one exclamation mark (${exclamations})`);
  }

  // Emojis
  if (EMOJI_REGEX.test(trimmed)) reasons.push("contains emoji");

  // Fake availability
  for (const phrase of FAKE_AVAILABILITY_PHRASES) {
    if (lower.includes(phrase)) {
      reasons.push(`fake availability: "${phrase}"`);
      break;
    }
  }

  // Corporate / robotic words
  for (const word of CORPORATE_WORDS) {
    if (lower.includes(word)) {
      reasons.push(`corporate language: "${word}"`);
    }
  }

  // Client first name
  if (ctx.firstName && ctx.firstName.length > 0) {
    if (!lower.includes(ctx.firstName.toLowerCase())) {
      reasons.push("missing client first name");
    }
  }

  // Trade / context anchor
  if (ctx.trade && ctx.trade.length > 0) {
    const kws = tradeKeywords(ctx.trade);
    const hasAny = kws.some((k) => lower.includes(k));
    if (!hasAny) reasons.push("missing trade/job context");
  }

  return { ok: reasons.length === 0, reasons };
}
