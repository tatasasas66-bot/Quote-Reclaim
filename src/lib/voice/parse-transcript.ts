import { TRADES, US_STATES } from "@/lib/utils/normalize";
import { titleCaseName } from "@/lib/utils/title-case";

/**
 * Voice intake is an ENHANCEMENT. This parser does a best-effort extraction
 * from a free-spoken transcript and fills only what it is confident about —
 * every unknown field is left blank for manual entry. It never throws.
 */
export type VoicePrefill = {
  client_name: string;
  trade: string;
  estimate_amount: string;
  days_silent: string;
  city: string;
  state: string;
};

export const EMPTY_PREFILL: VoicePrefill = {
  client_name: "",
  trade: "",
  estimate_amount: "",
  days_silent: "",
  city: "",
  state: "",
};

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
const NUMWORD_TOKENS = [
  ...Object.keys(ONES),
  ...Object.keys(TENS),
  "hundred",
  "thousand",
  "and",
];
const NUMWORD = `(?:${NUMWORD_TOKENS.join("|")})`;

function wordsToNumber(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let used = false;
  for (const w of tokens) {
    if (w in ONES) {
      current += ONES[w];
      used = true;
    } else if (w in TENS) {
      current += TENS[w];
      used = true;
    } else if (w === "hundred") {
      current = (current === 0 ? 1 : current) * 100;
      used = true;
    } else if (w === "thousand") {
      total += (current === 0 ? 1 : current) * 1000;
      current = 0;
      used = true;
    }
    // "and" and anything unknown are skipped.
  }
  return used ? total + current : null;
}

// Trade aliases → canonical TRADES value. Longer phrases first.
const TRADE_ALIASES: Array<[RegExp, string]> = [
  [/\bconcrete\b|\bdriveway\b|\bslab\b/, "Concrete"],
  [/\bfenc(?:e|ing)\b/, "Fencing"],
  [/\bfloor(?:ing)?\b/, "Flooring"],
  [/\bwindows?\b|\bdoors?\b/, "Windows & Doors"],
  [/\bsiding\b/, "Siding"],
  [/\bdrywall\b|\bsheetrock\b/, "Drywall"],
  [/\btree service\b|\btree removal\b|\barborist\b/, "Tree Service"],
  [/\bgeneral contract(?:ing|or)?\b/, "General Contracting"],
  [/\bhvac\b/, "HVAC"],
  [/\b(?:heating|cooling|air condition(?:ing|er)?|a\/?c)\b/, "HVAC"],
  [/\broof(?:ing|er)?\b/, "Roofing"],
  [/\bplumb(?:ing|er)?\b/, "Plumbing"],
  [/\belectric(?:al|ian)?\b/, "Electrical"],
  [/\bremodel(?:ing|er)?\b|\brenovation?s?\b/, "Remodeling"],
  [/\bpaint(?:ing|er)?\b/, "Painting"],
  [/\blandscap(?:ing|er)?\b|\blawn\b/, "Landscaping"],
];

function matchTrade(lower: string): string {
  for (const [re, canonical] of TRADE_ALIASES) {
    if (re.test(lower)) return canonical;
  }
  // Direct match against the canonical list (covers "Other").
  for (const t of TRADES) {
    if (new RegExp(`\\b${t.toLowerCase()}\\b`).test(lower)) return t;
  }
  return "";
}

function extractDays(lower: string): { value: string; matched: string } {
  const digit = lower.match(/(\d{1,3})\s*days?\b/);
  if (digit) {
    const n = Number(digit[1]);
    if (n >= 0 && n <= 365) return { value: String(n), matched: digit[0] };
  }
  // Number words immediately before "day(s)". Comma/non-space breaks the run,
  // so "...hundred, eight days" only captures "eight".
  const wordRe = new RegExp(`((?:${NUMWORD}[ \\t]+)+)days?\\b`);
  const word = lower.match(wordRe);
  if (word) {
    const n = wordsToNumber(word[1].trim().split(/[\s-]+/));
    if (n !== null && n >= 0 && n <= 365) {
      return { value: String(n), matched: word[0] };
    }
  }
  return { value: "", matched: "" };
}

function extractAmount(work: string): string {
  const candidates: number[] = [];

  // Digit amounts: $8,500 / 8500 / 8,500.00
  const digitRe = /\$?\s?(\d{1,3}(?:,\d{3})+|\d{2,})(?:\.\d{1,2})?/g;
  let m: RegExpExecArray | null;
  while ((m = digitRe.exec(work)) !== null) {
    const n = Number(`${m[1].replace(/,/g, "")}${m[0].includes(".") ? m[0].slice(m[0].indexOf(".")) : ""}`);
    if (Number.isFinite(n) && n > 0) candidates.push(n);
  }

  // Spoken number-word runs: "eighty five hundred", "eight thousand five hundred"
  const wordRunRe = new RegExp(`\\b${NUMWORD}(?:[ \\t]+${NUMWORD})*\\b`, "g");
  let w: RegExpExecArray | null;
  while ((w = wordRunRe.exec(work)) !== null) {
    const n = wordsToNumber(w[0].split(/[\s-]+/));
    if (n !== null && n > 0) candidates.push(n);
  }

  if (candidates.length === 0) return "";
  const amount = Math.max(...candidates);
  return amount > 0 && amount <= 1_000_000 ? String(amount) : "";
}

const STATE_BY_NAME: Array<[string, string]> = US_STATES.map(
  ([code, name]): [string, string] => [name.toLowerCase(), code],
)
  // Longest names first so "west virginia" wins over "virginia".
  .sort((a, b) => b[0].length - a[0].length);

const STATE_CODES = new Set<string>(US_STATES.map(([code]) => code));

const CITY_STOPWORDS = new Set([
  "days", "day", "quiet", "silent", "dollars", "dollar", "for", "in", "the",
  "a", "an", "and", "quote", "estimate", "about", "around", "roughly",
  ...NUMWORD_TOKENS,
]);

function extractStateAndCity(
  lower: string,
  original: string,
  name: string,
): { state: string; city: string } {
  let stateCode = "";
  let preceding = "";

  for (const [name_, code] of STATE_BY_NAME) {
    const idx = lower.indexOf(name_);
    if (idx >= 0 && /\b/.test(lower[idx] ?? "")) {
      stateCode = code;
      preceding = lower.slice(0, idx);
      break;
    }
  }

  if (!stateCode) {
    // Two-letter code spoken in caps, e.g. "Miami FL".
    const codeMatch = original.match(/\b([A-Z]{2})\b/);
    if (codeMatch && STATE_CODES.has(codeMatch[1])) {
      stateCode = codeMatch[1];
      preceding = lower.slice(0, original.toLowerCase().indexOf(codeMatch[1].toLowerCase()));
    }
  }

  if (!stateCode) return { state: "", city: "" };

  // City = the 1-2 trailing words of the segment before the state, skipping
  // stopwords / the client name.
  const segment = preceding.split(",").pop() ?? "";
  const words = segment
    .split(/\s+/)
    .map((x) => x.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  const cityWords: string[] = [];
  for (let i = words.length - 1; i >= 0 && cityWords.length < 2; i--) {
    const word = words[i];
    if (CITY_STOPWORDS.has(word)) break;
    if (name && word === name.toLowerCase()) break;
    cityWords.unshift(word);
  }
  const city = cityWords.length > 0 ? titleCaseName(cityWords.join(" ")) : "";
  return { state: stateCode, city };
}

function extractName(lower: string): string {
  const tokens = lower.split(/[\s,]+/).filter(Boolean);
  const tradeWords = new Set(
    TRADES.flatMap((t) => t.toLowerCase().split(/\s+/)),
  );
  for (const token of tokens) {
    const word = token.replace(/[^a-z]/g, "");
    if (!word) continue;
    if (CITY_STOPWORDS.has(word)) continue;
    if (tradeWords.has(word)) continue;
    if (STATE_BY_NAME.some(([n]) => n === word)) continue;
    if (/roof|plumb|electric|hvac|paint|landscap|remodel|renovat|contract|heating|cooling/.test(word)) {
      continue;
    }
    return titleCaseName(word);
  }
  return "";
}

export function parseVoiceTranscript(transcript: string): VoicePrefill {
  const original = transcript.trim();
  if (!original) return { ...EMPTY_PREFILL };

  // Normalize hyphenated numbers ("eighty-five" -> "eighty five") but keep
  // commas as boundaries between spoken fields.
  const lower = original.toLowerCase().replace(/[-]/g, " ");

  const name = extractName(lower);
  const trade = matchTrade(lower);
  const { value: days, matched: daysMatched } = extractDays(lower);

  // Remove the days phrase so the amount extractor never grabs the days count.
  const work = daysMatched ? lower.replace(daysMatched, " ") : lower;
  const amount = extractAmount(work);

  const { state, city } = extractStateAndCity(lower, original, name);

  return {
    client_name: name,
    trade,
    estimate_amount: amount,
    days_silent: days,
    city,
    state,
  };
}
