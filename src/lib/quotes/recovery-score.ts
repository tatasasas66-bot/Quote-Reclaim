import type { QuoteRow } from "@/lib/quotes/repo";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";

export type RiskBand =
  | "fresh"
  | "cooling"
  | "at_risk"
  | "critical"
  | "won"
  | "closed";

export interface RecoveryScore {
  score: number; // 0-100
  band: RiskBand;
  label: string; // "FRESH" | "COOLING" | "AT RISK" | "CRITICAL" | "WON" | "CLOSED"
  tone: "success" | "neutral" | "warning" | "danger";
}

/**
 * Maps a quote's outcome + effective days silent to a numeric score and
 * a contractor-facing band. Used by the dashboard queue row and the
 * sequence detail header. Reading order matters: the score decays
 * monotonically as the quote ages, so progress is always visible.
 */
export function getRecoveryScore(quote: QuoteRow): RecoveryScore {
  if (quote.outcome === "won") {
    return { score: 100, band: "won", label: "WON", tone: "success" };
  }
  if (quote.outcome === "closed") {
    return { score: 0, band: "closed", label: "CLOSED", tone: "neutral" };
  }
  const days = effectiveDaysSilent(quote);
  if (days <= 2) {
    // 100, 93, 86 across days 0, 1, 2
    const score = Math.round(100 - days * 7);
    return { score, band: "fresh", label: "FRESH", tone: "success" };
  }
  if (days <= 6) {
    // 85, 81, 77, 73 across days 3-6
    const score = Math.round(85 - (days - 3) * 4);
    return { score, band: "cooling", label: "COOLING", tone: "neutral" };
  }
  if (days <= 13) {
    // 71 → ~55 across days 7-13
    const score = Math.round(71 - (days - 7) * 2.3);
    return { score, band: "at_risk", label: "AT RISK", tone: "warning" };
  }
  // 54 → 0 across days 14+
  const score = Math.max(0, Math.round(54 - (days - 14) * 2));
  return { score, band: "critical", label: "CRITICAL", tone: "danger" };
}
