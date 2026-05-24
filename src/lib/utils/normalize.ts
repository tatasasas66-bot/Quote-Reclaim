/**
 * String normalization used at write time (server-side) and as defensive
 * fallback at render time. Keep all UI-facing normalization in one place so
 * the Recovery Window Alert, Queue rows, and SequenceModal cannot drift apart.
 */

export function titleCase(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const TRADE_OPTIONS = [
  "HVAC",
  "Plumbing",
  "Roofing",
  "Electrical",
  "Remodeling",
  "General Contracting",
  "Other",
] as const;
export type Trade = (typeof TRADE_OPTIONS)[number];
export const TRADES = TRADE_OPTIONS;

export function normalizeTrade(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (trimmed.toUpperCase() === "HVAC") return "HVAC";
  const titled = titleCase(trimmed);
  const match = TRADE_OPTIONS.find(
    (t) => t.toLowerCase() === titled.toLowerCase(),
  );
  return match ?? titled;
}

export function normalizeCity(input: string | null | undefined): string {
  return titleCase(input);
}

export function normalizeState(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim().slice(0, 2).toUpperCase();
}

export const US_STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
] as const;

export const US_STATE_CODES: ReadonlySet<string> = new Set(
  US_STATES.map(([code]) => code),
);
