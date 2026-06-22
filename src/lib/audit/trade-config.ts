/**
 * Trade-specific copy + sample data for the /audit page.
 *
 * The audit page reads `utm_trade` from the URL (set by the cold email) and
 * uses this config to personalize the hero, example line, sample rows, and
 * result header in real time. One page, infinite trade personalization.
 *
 * If utm_trade is missing or unrecognized, falls back to `default` (generic
 * contractor language). This keeps the page safe for direct/organic traffic.
 */

export type TradeConfig = {
  /** Lowercase key used in utm_trade. */
  trade: string;
  /** Display label for the hero + result. */
  label: string;
  /** Bridge line under the H1 — the "you did the work" sunk-labor frame. */
  bridgeLine: string;
  /** Example line shown in the helper card. */
  exampleLine: string;
  /** Sample rows preloaded when "Try sample numbers" is clicked. */
  sampleRows: ReadonlyArray<{ amount: string; days: string; label: string }>;
  /** Result-header eyebrow — the "what to do today" line. */
  resultEyebrow: string;
};

const CONCRETE: TradeConfig = {
  trade: "concrete",
  label: "concrete",
  bridgeLine:
    "You did the drive, the measure, and the price. Don't let the quote die in silence.",
  exampleLine:
    "Example: $3,200 driveway quiet for 14 days, $5,800 patio quiet for 24 days, $2,400 walkway quiet for 7 days.",
  sampleRows: [
    { amount: "3200", days: "14", label: "Driveway" },
    { amount: "5800", days: "24", label: "Patio" },
    { amount: "2400", days: "7", label: "Walkway" },
  ],
  resultEyebrow: "Your 60-second concrete estimate audit",
};

const FENCING: TradeConfig = {
  trade: "fencing",
  label: "fence",
  bridgeLine:
    "You walked the line, measured the footage, and priced the job. Don't let the quote die in silence.",
  exampleLine:
    "Example: $2,800 backyard fence quiet for 14 days, $4,500 side fence quiet for 24 days, $1,900 gate repair quiet for 7 days.",
  sampleRows: [
    { amount: "2800", days: "14", label: "Backyard fence" },
    { amount: "4500", days: "24", label: "Side fence" },
    { amount: "1900", days: "7", label: "Gate repair" },
  ],
  resultEyebrow: "Your 60-second fence estimate audit",
};

const PAINTING: TradeConfig = {
  trade: "painting",
  label: "painting",
  bridgeLine:
    "You did the walkthrough, the measurements, and the price. Don't let the quote die in silence.",
  exampleLine:
    "Example: $3,200 interior repaint quiet for 14 days, $5,800 exterior quiet for 24 days, $2,400 touch-up quiet for 7 days.",
  sampleRows: [
    { amount: "3200", days: "14", label: "Interior repaint" },
    { amount: "5800", days: "24", label: "Exterior" },
    { amount: "2400", days: "7", label: "Touch-up" },
  ],
  resultEyebrow: "Your 60-second painting estimate audit",
};

const HVAC: TradeConfig = {
  trade: "hvac",
  label: "HVAC",
  bridgeLine:
    "You did the load calc, the equipment spec, and the price. Don't let the quote die in silence.",
  exampleLine:
    "Example: $8,500 AC replacement quiet for 14 days, $12,000 furnace quiet for 24 days, $6,500 mini-split quiet for 7 days.",
  sampleRows: [
    { amount: "8500", days: "14", label: "AC replacement" },
    { amount: "12000", days: "24", label: "Furnace" },
    { amount: "6500", days: "7", label: "Mini-split" },
  ],
  resultEyebrow: "Your 60-second HVAC estimate audit",
};

const ROOFING: TradeConfig = {
  trade: "roofing",
  label: "roofing",
  bridgeLine:
    "You climbed it, measured it, and priced it. Don't let the quote die in silence.",
  exampleLine:
    "Example: $9,500 shingle replacement quiet for 14 days, $14,000 metal roof quiet for 24 days, $6,000 repair quiet for 7 days.",
  sampleRows: [
    { amount: "9500", days: "14", label: "Shingle replacement" },
    { amount: "14000", days: "24", label: "Metal roof" },
    { amount: "6000", days: "7", label: "Repair" },
  ],
  resultEyebrow: "Your 60-second roof estimate audit",
};

const DEFAULT: TradeConfig = {
  trade: "default",
  label: "contractor",
  bridgeLine:
    "You did the drive, the measure, and the price. Don't let the quote die in silence.",
  exampleLine:
    "Example: $3,200 quiet for 14 days, $5,800 quiet for 24 days, $2,400 quiet for 7 days.",
  sampleRows: [
    { amount: "3200", days: "14", label: "Estimate" },
    { amount: "5800", days: "24", label: "Estimate" },
    { amount: "2400", days: "7", label: "Estimate" },
  ],
  resultEyebrow: "Your 60-second estimate audit",
};

const TRADE_MAP: ReadonlyMap<string, TradeConfig> = new Map<string, TradeConfig>([
  ["concrete", CONCRETE],
  ["driveway", CONCRETE],
  ["fencing", FENCING],
  ["fence", FENCING],
  ["painting", PAINTING],
  ["painter", PAINTING],
  ["hvac", HVAC],
  ["roofing", ROOFING],
  ["roofer", ROOFING],
]);

/**
 * Resolve a trade config from a utm_trade value (or any trade string).
 * Falls back to DEFAULT for unknown/missing trades.
 */
export function resolveTradeConfig(utmTrade: string | null | undefined): TradeConfig {
  if (!utmTrade) return DEFAULT;
  const key = utmTrade.trim().toLowerCase();
  return TRADE_MAP.get(key) ?? DEFAULT;
}
