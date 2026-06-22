/**
 * Deterministic lead scoring — pure, no I/O.
 *
 * Score is 0-100 (capped). The breakdown is returned so the admin UI can
 * show WHY a lead scored where it did. Status assignment:
 *   score >= 70  → approved
 *   score 50-69  → review
 *   score < 50   → rejected
 *   no email     → rejected (not sendable)
 *   suppressed   → set elsewhere (never overridden here)
 */
import type { LeadInput, ScoredLead } from "./types";

const TRADE_FIT: ReadonlyMap<string, number> = new Map([
  ["concrete", 30],
  ["driveway", 30],
  ["fencing", 22],
  ["painting", 18],
  ["painter", 18],
  ["hvac", 16],
  ["roofing", 15],
  ["roofer", 15],
]);

const HIGH_TICKET_TRADES = new Set(["concrete", "driveway", "roofing", "roofer", "hvac"]);
const MID_TICKET_TRADES = new Set(["fencing", "painting", "painter"]);

const SUN_BELT_CITIES = new Set([
  "phoenix", "dallas", "houston", "austin", "san antonio",
  "atlanta", "denver", "las vegas", "tucson", "mesa", "scottsdale",
  "arlington", "fort worth", "plano", "garland", "irving",
]);

const QUOTE_LANGUAGE_RE = /\b(quote|estimate|free estimate|free quote)\b/i;
const PUBLIC_SIGNAL_RE = /\b(now booking|schedule filling|crew|opening|availability|booking into)\b/i;
const OWNER_OPERATOR_RE = /\b(owner|founder|proprietor|llc|inc|co)\b/i;

function normalizeTrade(trade: string): string {
  return trade.trim().toLowerCase();
}

function scoreTradeFit(trade: string): number {
  const t = normalizeTrade(trade);
  for (const [key, pts] of Array.from(TRADE_FIT)) {
    if (t.includes(key)) return pts;
  }
  return 8; // other quote-heavy trade
}

function scoreEmailQuality(email: string | null): number {
  if (!email || !email.trim()) return 0;
  const e = email.trim().toLowerCase();
  // Named/owner email: mike@, john@, owner@, founder@
  if (/^(mike|john|owner|founder|jane|dave|mark|chris|steve|tom|jim|bob|bill|joe|tony|rick|scott|kevin|brian|jason|matt|ryan|eric|nick|paul|jeff|dan|rob|greg|tim|kyle|adam|sean|alex|brandon|justin|aaron|jake|nate|cory|dustin|tyler|derek|cody|lance|troy|craig|neil|kurt|luke|seth|phil|dale|wayne|carl|roy|guy|juan|carlos|diego|miguel|angel|jose)/.test(e.split("@")[0] ?? "")) {
    return 20;
  }
  if (/^(info|contact|sales|hello|office|admin|support|mail)/.test(e.split("@")[0] ?? "")) {
    return 10;
  }
  // Default: named-ish (not a generic role mailbox)
  return 20;
}

function scoreReviewCount(count: number | null): number {
  if (count == null || !Number.isFinite(count)) return 0;
  if (count < 10) return 2;
  if (count <= 100) return 15;
  if (count <= 300) return 8;
  return 3;
}

function scoreWebsiteQuality(website: string | null): number {
  return website && website.trim() ? 10 : 0;
}

function scoreQuoteLanguage(notes: string | null, website: string | null): number {
  const hay = `${notes ?? ""} ${website ?? ""}`;
  return QUOTE_LANGUAGE_RE.test(hay) ? 10 : 0;
}

function scoreSeasonality(
  trade: string,
  city: string | null,
  publicSignal: string | null,
): number {
  const t = normalizeTrade(trade);
  const c = (city ?? "").trim().toLowerCase();
  const isSunBelt = c && SUN_BELT_CITIES.has(c);
  const isSummerTrade = ["concrete", "driveway", "fencing", "painting", "painter"].some((k) => t.includes(k));
  if ((isSummerTrade && isSunBelt) || (t.includes("hvac") && publicSignal)) {
    return 10;
  }
  if (t.includes("hvac")) return 8;
  return 3;
}

function scorePublicSignal(publicSignal: string | null, notes: string | null): number {
  const hay = `${publicSignal ?? ""} ${notes ?? ""}`;
  return PUBLIC_SIGNAL_RE.test(hay) ? 10 : 0;
}

function scoreOwnerOperator(notes: string | null, firstName: string | null): number {
  // If we have a first name OR owner-operator language in notes, treat as owner-operated.
  if (firstName && firstName.trim()) return 8;
  if (notes && OWNER_OPERATOR_RE.test(notes)) return 8;
  return 0;
}

function scoreTicketSize(trade: string): number {
  const t = normalizeTrade(trade);
  if (Array.from(HIGH_TICKET_TRADES).some((k) => t.includes(k))) return 8;
  if (Array.from(MID_TICKET_TRADES).some((k) => t.includes(k))) return 6;
  return 2;
}

export function scoreLead(input: LeadInput): ScoredLead {
  const tradeFit = scoreTradeFit(input.trade);
  const emailQuality = scoreEmailQuality(input.email);
  const reviewCount = scoreReviewCount(input.reviewCount);
  const websiteQuality = scoreWebsiteQuality(input.website);
  const quoteLanguage = scoreQuoteLanguage(input.notes, input.website);
  const seasonality = scoreSeasonality(input.trade, input.city, input.publicSignal);
  const publicSignal = scorePublicSignal(input.publicSignal, input.notes);
  const ownerOperator = scoreOwnerOperator(input.notes, null); // firstName passed separately
  const ticketSize = scoreTicketSize(input.trade);

  const raw =
    tradeFit + emailQuality + reviewCount + websiteQuality + quoteLanguage +
    seasonality + publicSignal + ownerOperator + ticketSize;
  const score = Math.min(100, Math.max(0, Math.round(raw)));

  // No email → not sendable, rejected regardless of score.
  if (!input.email || !input.email.trim()) {
    return {
      score,
      status: "rejected",
      sendable: false,
      breakdown: { tradeFit, emailQuality, reviewCount, websiteQuality, quoteLanguage, seasonality, publicSignal, ownerOperator, ticketSize },
    };
  }

  let status: ScoredLead["status"];
  if (score >= 70) status = "approved";
  else if (score >= 50) status = "review";
  else status = "rejected";

  return {
    score,
    status,
    sendable: status === "approved",
    breakdown: { tradeFit, emailQuality, reviewCount, websiteQuality, quoteLanguage, seasonality, publicSignal, ownerOperator, ticketSize },
  };
}

/** Overload that accepts an explicit first_name for owner-operator detection. */
export function scoreLeadWithFirstName(
  input: LeadInput,
  firstName: string | null,
): ScoredLead {
  const base = scoreLead(input);
  // Recompute ownerOperator with firstName and re-tally.
  const ownerOperator = firstName && firstName.trim() ? 8 : base.breakdown.ownerOperator;
  const raw =
    base.breakdown.tradeFit + base.breakdown.emailQuality + base.breakdown.reviewCount +
    base.breakdown.websiteQuality + base.breakdown.quoteLanguage + base.breakdown.seasonality +
    base.breakdown.publicSignal + ownerOperator + base.breakdown.ticketSize;
  const score = Math.min(100, Math.max(0, Math.round(raw)));
  let status: ScoredLead["status"];
  if (!input.email || !input.email.trim()) {
    return { ...base, score, status: "rejected", sendable: false };
  }
  if (score >= 70) status = "approved";
  else if (score >= 50) status = "review";
  else status = "rejected";
  return {
    score,
    status,
    sendable: status === "approved",
    breakdown: { ...base.breakdown, ownerOperator },
  };
}
