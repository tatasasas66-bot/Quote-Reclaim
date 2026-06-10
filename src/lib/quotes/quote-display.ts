import { titleCaseName } from "@/lib/utils/title-case";

/**
 * "Roofing · Tampa, FL" — the trade/location line under the client name.
 *
 * Blank-safe: a missing, empty, or whitespace-only city/state contributes
 * nothing, so the line can never render a dangling separator ("Roofing,"
 * was the visible bug when state was blank-ish and city absent).
 */
export function tradeLocationLine(
  trade: string,
  city: string | null | undefined,
  state: string | null | undefined,
): string {
  const tradeLabel = titleCaseName(trade).trim();
  const cityLabel = titleCaseName((city ?? "").trim()).trim();
  const stateLabel = (state ?? "").trim().toUpperCase();
  const location = [cityLabel, stateLabel].filter(Boolean).join(", ");
  return location ? `${tradeLabel} · ${location}` : tradeLabel;
}
