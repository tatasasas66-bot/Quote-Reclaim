import { titleCaseName } from "@/lib/utils/title-case";

/**
 * Display label for a trade. titleCaseName chews "HVAC" into "Hvac", which
 * reads as a typo to a contractor. This table preserves acronyms and gives
 * the canonical display casing for each known trade. Unknown trades fall
 * through to titleCaseName so legacy/freeform values still render cleanly.
 *
 * The table is keyed by lower-cased input, but matches case-insensitively
 * so callers can pass either the canonical value or whatever the database
 * stored without thinking about it.
 */
const TRADE_DISPLAY: Record<string, string> = {
  hvac: "HVAC",
  roofing: "Roofing",
  plumbing: "Plumbing",
  electrical: "Electrical",
  remodeling: "Remodeling",
  "general contracting": "General Contracting",
  painting: "Painting",
  landscaping: "Landscaping",
  concrete: "Concrete",
  flooring: "Flooring",
  fencing: "Fencing",
  "windows and doors": "Windows & Doors",
  "windows & doors": "Windows & Doors",
};

export function tradeLabel(trade: string | null | undefined): string {
  const raw = (trade ?? "").trim();
  if (!raw) return "";
  const mapped = TRADE_DISPLAY[raw.toLowerCase()];
  if (mapped) return mapped;
  return titleCaseName(raw);
}

/**
 * "Roofing · Tampa, FL" — the trade/location line under the client name.
 *
 * Blank-safe: a missing, empty, or whitespace-only city/state contributes
 * nothing, so the line can never render a dangling separator ("Roofing,"
 * was the visible bug when state was blank-ish and city absent).
 *
 * Uses tradeLabel so acronyms like HVAC survive titleCase — "HVAC · DC"
 * instead of "Hvac · DC". City/state are separated by a comma as the US
 * postal convention, and trade is separated from location by a middot so
 * every meta line across the product uses the same one-character anchor.
 */
export function tradeLocationLine(
  trade: string,
  city: string | null | undefined,
  state: string | null | undefined,
): string {
  const tradeDisplay = tradeLabel(trade).trim();
  const cityLabel = titleCaseName((city ?? "").trim()).trim();
  const stateLabel = (state ?? "").trim().toUpperCase();
  const location = [cityLabel, stateLabel].filter(Boolean).join(", ");
  if (!tradeDisplay) return location;
  return location ? `${tradeDisplay} · ${location}` : tradeDisplay;
}
