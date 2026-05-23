import type { QuoteRow } from "@/lib/quotes/repo";
import { effectiveDaysSilent } from "./effective-days";

export type RiskLevel = "warm" | "cooling" | "cold" | "hot" | "won" | "closed";

/**
 * Maps a quote's outcome + effective days silent to a risk level.
 * Note: "hot" is the most urgent — older silent quotes get hotter, not cooler.
 * The metaphor inverts physical temperature; it tracks urgency-to-act.
 */
export function riskLevel(quote: QuoteRow): RiskLevel {
  if (quote.outcome === "won") return "won";
  if (quote.outcome === "closed") return "closed";
  const days = effectiveDaysSilent(quote);
  if (days >= 15) return "hot";
  if (days >= 7) return "cold";
  if (days >= 3) return "cooling";
  return "warm";
}

/**
 * Display label for a risk level. These are the contractor-facing words.
 * Internal code keeps the original warm/cooling/cold/hot identifiers.
 */
export function riskLabel(level: RiskLevel): string {
  switch (level) {
    case "warm":
      return "FRESH";
    case "cooling":
      return "COOLING";
    case "cold":
      return "AT RISK";
    case "hot":
      return "CRITICAL";
    case "won":
      return "WON";
    case "closed":
      return "CLOSED";
  }
}
