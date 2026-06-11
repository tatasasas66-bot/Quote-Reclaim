/**
 * Honest "how many months of Quote Reclaim does this dollar amount cover?"
 * phrasing. Above ~2 years the raw months number ("$12,000 covers 151 months")
 * reads as comedic and argues against monthly renewal — so above 24 months we
 * flip to an annual-multiple frame ("12x a full year of Quote Reclaim").
 *
 * Pure display math. Reads nothing from billing logic; the $79/month and
 * $948/year constants are duplicated here on purpose so a future pricing
 * change is intentional and explicit at every call site, not silently rippled.
 *
 * Always floors — never round up. Overclaim is the only failure mode that
 * matters in trust copy.
 */

const MONTHLY_PRICE_USD = 79;
const ANNUAL_PRICE_USD = MONTHLY_PRICE_USD * 12; // 948

export function roiFraming(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "less than 1 month of Quote Reclaim";
  }
  const months = Math.floor(amount / MONTHLY_PRICE_USD);
  if (months <= 0) return "less than 1 month of Quote Reclaim";
  if (months <= 24) return `${months} months of Quote Reclaim`;
  const yearMultiple = Math.floor(amount / ANNUAL_PRICE_USD);
  return `${yearMultiple}x a full year of Quote Reclaim`;
}

/**
 * The same decision boundary, exposed for callers that need to compose more
 * specific sentences (Win Moment's "covered Quote Reclaim Nx over for a full
 * year" vs the plain "12 months" line). Returns the structured pieces so the
 * call site can write its own natural sentence.
 */
export type RoiPieces =
  | { kind: "subMonth" }
  | { kind: "months"; months: number }
  | { kind: "years"; yearMultiple: number };

export function roiPieces(amount: number): RoiPieces {
  if (!Number.isFinite(amount) || amount <= 0) return { kind: "subMonth" };
  const months = Math.floor(amount / MONTHLY_PRICE_USD);
  if (months <= 0) return { kind: "subMonth" };
  if (months <= 24) return { kind: "months", months };
  const yearMultiple = Math.floor(amount / ANNUAL_PRICE_USD);
  return { kind: "years", yearMultiple };
}
