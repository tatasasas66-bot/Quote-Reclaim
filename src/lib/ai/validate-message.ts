/**
 * Hard validation rules for recovery messages. Anything failing these rules
 * must never be stored or sent. Validation is intentionally strict: false
 * positives are acceptable; false negatives are not.
 */

export type ValidationContext = {
  firstName?: string;
  trade?: string;
  followupNumber?: 1 | 2 | 3 | 4 | 5;
};

export type ValidationResult = {
  ok: boolean;
  reasons: string[];
};

export const MAX_MESSAGE_CHARS = 320;

// Multi-word and discriminative banned phrases. Multi-word entries are checked
// as case-insensitive substrings; single tokens that match /^[a-z0-9]+$/ are
// upgraded to whole-word matches inside containsBannedPhrase (so "ai" only
// matches the standalone word, not "available").
//
// This list now also encodes the contractor-native rewrite contract: it rejects
// sales-coach vocabulary ("makes you the prize", "loss aversion", "reactance",
// "squeeze", "breakup"), fake-scarcity claims the app cannot actually back
// ("locking the schedule today", "releasing it", "let the slot go"), and
// SaaS jargon ("CRM", "lead nurturing", "pipeline optimization", "workflow",
// "automate your sales").
export const BANNED_PHRASES: readonly string[] = [
  "hi {name}, just checking in",
  "just following up",
  "just checking in",
  "following up",
  "checking back",
  "touching base",
  "circle back",
  "circling back",
  "wanted to follow up",
  "checking in to see",
  "quick reminder",
  "final reminder",
  "one final follow-up",
  "one final followup",
  "last chance",
  "final notice",
  "act now",
  "don't miss out",
  "ai-generated",
  "our system",
  "optimize",
  "leverage",
  "please don't hesitate",
  "looking forward to hearing",
  "happy to help",
  "on file",
  "no problem whenever you're ready",
  "whenever you're ready",
  "hope this finds you well",
  "hope you're doing great",
  "leave it hanging",
  "make the next step simple",
  "before you decide",
  "haven't heard back",
  "have not heard back",
  "did i do something wrong",
  "the team at",
  "tracking link",
  "price-drop",
  "price drop",
  "today only",
  "discount",
  "send now",
  "bid",
  // Sales-psychology vocabulary that should never appear in the customer-facing
  // message body (the WHY_THIS_WORKS rationale on the contractor's dashboard is
  // a separate, contractor-only surface and is intentionally left untouched).
  "makes you the prize",
  "loss aversion",
  "reactance",
  "trigger",
  "squeeze",
  "breakup",
  // Fake-scarcity claims the app cannot actually back.
  "dead or just on pause",
  "just need one word",
  "locking the schedule today",
  "releasing it",
  "let the slot go",
  // Discount/urgency language banned outright in the body.
  "cheaper",
  "guaranteed",
  "urgent",
  // SaaS / AI jargon — the customer should never sense this is automation.
  "ai",
  "crm",
  "lead nurturing",
  "pipeline optimization",
  "workflow",
  "automate your sales",
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

// Some project labels deliberately use different words than the raw trade keyword
// (e.g., "Remodeling" → "the remodel estimate"; "General Contracting" → "the project
// estimate"). This map lets the trade check pass when a recognised synonym appears.
const TRADE_KEYWORD_SYNONYMS: Record<string, string[]> = {
  remodeling: ["remodel", "project"],
  "general contracting": ["project"],
  other: ["estimate"],
  general: ["project"],
  contracting: ["project"],
  concrete: ["driveway"],
  roofing: ["roof"],
  hvac: ["system"],
  plumbing: ["job"],
  electrical: ["work"],
  painting: ["project"],
  landscaping: ["project"],
  fencing: ["fence"],
  flooring: ["floor"],
  windows: ["install"],
  doors: ["install"],
  siding: ["siding"],
  drywall: ["work"],
  tree: ["removal"],
  service: ["removal"],
};

// Detect emoji without the `/u` flag for TS target compatibility:
//   - surrogate pairs cover modern emoji blocks
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

function normalizeForScan(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeWord(haystack: string, needle: string): boolean {
  return new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i").test(haystack);
}

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
  const lower = normalizeForScan(message);
  for (const phrase of BANNED_PHRASES) {
    const scanned = normalizeForScan(phrase);
    if (/^[a-z0-9]+$/i.test(scanned)) {
      if (containsWholeWord(lower, scanned)) return phrase;
    } else if (lower.includes(scanned)) {
      return phrase;
    }
  }
  return null;
}

export function validateMessage(
  message: string,
  ctx: ValidationContext = {},
): ValidationResult {
  const reasons: string[] = [];
  const trimmed = message.trim();
  const lower = normalizeForScan(trimmed);

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
  if (/\b(discount|price drop|price-drop|today only)\b/i.test(trimmed)) {
    reasons.push("uses discount or manufactured urgency");
  }
  if (/\bhttps?:\/\//i.test(trimmed) || /\bwww\./i.test(trimmed)) {
    reasons.push("contains tracking/link-like URL");
  }

  // CTA / question count
  const questions = (trimmed.match(/\?/g) ?? []).length;
  // Day 30 (followupNumber 5) is the Final Breakup — intentionally a
  // declarative withdrawal of the offer with no question. Every other day
  // still requires exactly one.
  if (ctx.followupNumber === 5) {
    if (questions !== 0) {
      reasons.push(`day 30 must be declarative (no question, got ${questions})`);
    }
  } else if (questions !== 1) {
    reasons.push(`must have exactly one question (${questions})`);
  }

  // Exclamations
  const exclamations = (trimmed.match(/!/g) ?? []).length;
  if (exclamations > 0) {
    reasons.push(`contains exclamation mark (${exclamations})`);
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

  const firstName = (ctx.firstName ?? "").trim();
  const firstNameLower = normalizeForScan(firstName);

  if (ctx.followupNumber === 3) {
    // Day 7 (Voss Takeaway). The canonical v0 omits the name entirely; v1/v3
    // lead with the name. Both are valid — the rule is "no greeting", not
    // "no name".
    if (/^(hi|hey)\b/i.test(trimmed)) {
      reasons.push("day 3 must not start with a greeting");
    }
  } else if (firstNameLower && !containsWholeWord(lower, firstNameLower)) {
    reasons.push("missing client first name");
  }

  // Trade / context anchor — every day (Day 1 through Day 30) must reference
  // the trade or its synonym. Day 3 previously slipped this check because it
  // leaned on a generic "slot" frame; the rewrite anchors it on the actual
  // trade (e.g., "the roofing schedule", "upcoming HVAC work") so the rule
  // now applies uniformly.
  if (ctx.trade && ctx.trade.length > 0) {
    const kws = tradeKeywords(ctx.trade);
    const hasAny = kws.some(
      (k) =>
        lower.includes(k) ||
        (TRADE_KEYWORD_SYNONYMS[k] ?? []).some((s) => lower.includes(s)),
    );
    if (!hasAny) reasons.push("missing trade/job context");
  }

  return { ok: reasons.length === 0, reasons };
}
