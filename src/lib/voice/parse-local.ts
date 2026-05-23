import { TRADES, type Trade } from "@/lib/quotes/schema";
import { titleCaseName } from "@/lib/utils/title-case";
import type { VoiceParseResult } from "./types";

const TRADE_ALIASES: Record<string, Trade> = {
  hvac: "HVAC",
  "h v a c": "HVAC",
  heating: "HVAC",
  cooling: "HVAC",
  "heating and cooling": "HVAC",
  ac: "HVAC",
  furnace: "HVAC",
  plumbing: "Plumbing",
  plumber: "Plumbing",
  roofing: "Roofing",
  roof: "Roofing",
  electrical: "Electrical",
  electrician: "Electrical",
  electric: "Electrical",
  remodeling: "Remodeling",
  remodel: "Remodeling",
  renovation: "Remodeling",
  reno: "Remodeling",
  "general contracting": "General Contracting",
  general: "General Contracting",
  contractor: "General Contracting",
};

const SMALL_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

const CITY_REGEX_BY_STATE: Record<string, RegExp> = {
  FL: /\b(miami|orlando|tampa|jacksonville|tallahassee|fort lauderdale|st\.? petersburg)\b/i,
  CA: /\b(los angeles|san francisco|san diego|sacramento|fresno|oakland|long beach|san jose)\b/i,
  TX: /\b(houston|dallas|austin|san antonio|fort worth|el paso|arlington)\b/i,
  NY: /\b(new york|brooklyn|buffalo|albany|rochester|syracuse)\b/i,
};

/**
 * Pure regex/keyword fallback used when the Groq parser is unavailable or
 * disagrees. Never blocks — returns partial results with nulls for fields it
 * could not extract.
 *
 * Critical rules from the brief:
 *   - "${N} days" must populate days_silent, NEVER estimate_amount.
 *   - "eighty five hundred" / "twenty four hundred" parse as 8500 / 2400.
 *   - "${N} thousand ${M} hundred" parses as N*1000 + M*100.
 *   - A phone-like pattern becomes client_phone, not estimate_amount.
 */
export function parseSpeechLocal(transcript: string): VoiceParseResult {
  const text = transcript.trim();
  const lower = text.toLowerCase();

  const result: VoiceParseResult = {
    client_name: null,
    trade: null,
    estimate_amount: null,
    days_silent: null,
    city: null,
    state: null,
    client_phone: null,
    client_email: null,
    job_description: null,
    _key: String(Date.now()),
  };

  // ---- Phone (extract first so the digits don't bleed into estimate) ----
  const phoneMatch = lower.match(
    /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/,
  );
  if (phoneMatch) {
    result.client_phone = phoneMatch[0].replace(/[^\d+]/g, "");
  }

  // ---- Days silent ----
  const daysSilent = extractDaysSilent(lower);
  if (daysSilent != null) result.days_silent = daysSilent;

  // ---- Estimate amount ----
  // Search outside any days-silent fragment to avoid double-counting.
  const lowerForAmount = stripDaysSilentFragments(lower);
  const amount = extractEstimateAmount(lowerForAmount);
  if (amount != null) result.estimate_amount = amount;

  // ---- Trade ----
  for (const [alias, canonical] of Object.entries(TRADE_ALIASES)) {
    const re = new RegExp(`\\b${alias.replace(/ /g, "\\s+")}\\b`, "i");
    if (re.test(lower)) {
      result.trade = canonical;
      break;
    }
  }
  // Last-chance: exact match of any canonical name.
  if (!result.trade) {
    for (const t of TRADES) {
      if (new RegExp(`\\b${t}\\b`, "i").test(text)) {
        result.trade = t;
        break;
      }
    }
  }

  // ---- State ----
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(lower)) {
      result.state = code;
      break;
    }
  }
  // Or trailing 2-letter code like "Miami FL".
  if (!result.state) {
    const code = text.match(/\b([A-Z]{2})\b/);
    if (code && /^[A-Z]{2}$/.test(code[1])) {
      result.state = code[1];
    }
  }

  // ---- City ----
  if (result.state && CITY_REGEX_BY_STATE[result.state]) {
    const cityMatch = lower.match(CITY_REGEX_BY_STATE[result.state]);
    if (cityMatch) {
      result.city = titleCaseName(cityMatch[1]);
    }
  }

  // ---- Client name (first word that isn't a trade/state/number) ----
  const firstNameMatch = extractFirstName(text, result);
  if (firstNameMatch) result.client_name = firstNameMatch;

  // ---- Missing required ----
  const missing: string[] = [];
  if (!result.client_name) missing.push("client_name");
  if (!result.trade) missing.push("trade");
  if (result.estimate_amount == null) missing.push("estimate_amount");
  if (result.days_silent == null) missing.push("days_silent");
  result.missing_required = missing;

  return result;
}

function extractDaysSilent(lower: string): number | null {
  // Digit form: "10 days", "10 days silent", "10 days ago"
  const digit = lower.match(
    /\b(\d{1,3})\s*(?:days?|day)\s*(?:silent|ago)?\b/,
  );
  if (digit) return Number(digit[1]);

  // Yesterday
  if (/\byesterday\b/.test(lower)) return 1;

  // "${N} weeks" or "a week"
  const weeks = lower.match(/\b(\d{1,2})\s*weeks?\b/);
  if (weeks) return Number(weeks[1]) * 7;
  if (/\ba week ago\b/.test(lower)) return 7;

  // Word form: "ten days"
  const word = lower.match(
    /\b([a-z\-]+)\s+(?:days?|day)\s*(?:silent|ago)?\b/,
  );
  if (word) {
    const n = wordsToNumber(word[1]);
    if (n != null && n >= 0 && n < 365) return n;
  }
  return null;
}

function stripDaysSilentFragments(lower: string): string {
  return lower
    .replace(/\b\d{1,3}\s*(?:days?|day)\s*(?:silent|ago)?\b/g, " ")
    .replace(/\b[a-z\-]+\s+(?:days?|day)\s*(?:silent|ago)?\b/g, " ")
    .replace(/\byesterday\b/g, " ")
    .replace(/\b\d{1,2}\s*weeks?\b/g, " ");
}

function extractEstimateAmount(lowerNoDays: string): number | null {
  // 1. Bare dollar amount, e.g. "$8,500" or "$8500.00"
  const dollar = lowerNoDays.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (dollar) {
    const n = Number(dollar[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }

  // 2. "${N} dollars"
  const digitsDollars = lowerNoDays.match(
    /\b([\d,]+(?:\.\d{1,2})?)\s*dollars?\b/,
  );
  if (digitsDollars) {
    const n = Number(digitsDollars[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }

  // 3. Word form: "eighty five hundred", "forty two hundred", etc.
  const compoundHundred = lowerNoDays.match(
    /\b((?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)\s+hundred\b/,
  );
  if (compoundHundred) {
    const tens = compoundHundred[1].replace(/-/g, " ");
    const n = wordsToNumber(tens);
    if (n != null) return n * 100;
  }

  // 4. "${N} thousand ${M} hundred"
  const thouHund = lowerNoDays.match(
    /\b((?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)\s+thousand(?:\s+(?:one|two|three|four|five|six|seven|eight|nine)\s+hundred)?\b/,
  );
  if (thouHund) {
    const n = wordsToNumber(thouHund[0]);
    if (n != null && n >= 100) return n;
  }

  // 5. Last resort: a 3-7 digit run that isn't a phone fragment.
  const digits = lowerNoDays.match(/\b(\d{3,7})\b/);
  if (digits) {
    const n = Number(digits[1]);
    if (Number.isFinite(n) && n >= 100 && n <= 1_000_000) return n;
  }
  return null;
}

function wordsToNumber(input: string): number | null {
  const tokens = input.trim().toLowerCase().replace(/-/g, " ").split(/\s+/);
  let total = 0;
  let current = 0;
  for (const t of tokens) {
    if (t === "hundred") {
      if (current === 0) current = 1;
      current *= 100;
    } else if (t === "thousand") {
      if (current === 0) current = 1;
      total += current * 1000;
      current = 0;
    } else if (SMALL_NUMBER_WORDS[t] != null) {
      current += SMALL_NUMBER_WORDS[t];
    } else if (/^\d+$/.test(t)) {
      current += Number(t);
    } else {
      // Unknown token — bail and let the caller decide.
      return null;
    }
  }
  total += current;
  return total > 0 ? total : null;
}

function extractFirstName(
  original: string,
  ctx: VoiceParseResult,
): string | null {
  const tradeWords = new Set(
    Object.keys(TRADE_ALIASES).flatMap((a) => a.split(" ")),
  );
  const stateWords = new Set(
    Object.keys(STATE_NAME_TO_CODE).flatMap((s) => s.split(" ")),
  );
  for (const raw of original.split(/\s+/)) {
    const word = raw.replace(/[^A-Za-z'\-]/g, "");
    if (!word) continue;
    const lower = word.toLowerCase();
    if (tradeWords.has(lower)) continue;
    if (stateWords.has(lower)) continue;
    if (SMALL_NUMBER_WORDS[lower] != null) continue;
    if (
      lower === "quote" ||
      lower === "phone" ||
      lower === "dollars" ||
      lower === "days" ||
      lower === "day" ||
      lower === "silent" ||
      lower === "hundred" ||
      lower === "thousand" ||
      lower === "yesterday" ||
      lower === "ago" ||
      lower === "and" ||
      lower === "for" ||
      lower === "in"
    ) {
      continue;
    }
    if (ctx.trade && lower === ctx.trade.toLowerCase()) continue;
    if (/^\d+$/.test(word)) continue;
    if (word.length < 2) continue;
    // First lookable name token wins.
    return titleCaseName(word);
  }
  return null;
}
