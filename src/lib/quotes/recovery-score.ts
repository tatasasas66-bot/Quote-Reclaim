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

export type PriorityLabel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Maps a 0-100 recovery score to a labeled urgency band for the queue row.
 * Higher score = healthier = lower urgency. Bands mirror getRecoveryScore:
 * fresh→LOW, cooling→MEDIUM, at_risk→HIGH, critical→CRITICAL.
 */
export function recoveryPriority(score: number): {
  label: PriorityLabel;
  labelClass: string;
  barClass: string;
} {
  if (score >= 86) {
    return { label: "LOW", labelClass: "text-ink-muted", barClass: "bg-money" };
  }
  if (score >= 72) {
    return {
      label: "MEDIUM",
      labelClass: "text-ink-strong",
      barClass: "bg-warning",
    };
  }
  if (score >= 55) {
    return { label: "HIGH", labelClass: "text-warning", barClass: "bg-warning" };
  }
  return { label: "CRITICAL", labelClass: "text-danger", barClass: "bg-danger" };
}

/**
 * Visual fill percentage for the priority bar so the bar can never disagree
 * with its label. The old formula (100 − score) collapsed HIGH into a near-
 * empty bar (29–45%) — a HIGH label over an almost-empty bar reads as a bug.
 *
 * Each band gets its own visual range, increasing as urgency rises:
 *   LOW      → 15–30%   (fresh)
 *   MEDIUM   → 35–55%   (cooling)
 *   HIGH     → 60–80%   (at_risk)
 *   CRITICAL → 85–100%  (critical)
 *
 * Within each band the fill scales linearly with raw score so two HIGH quotes
 * at different ages still read different from each other.
 */
export function priorityBarFill(score: number): number {
  // Clamp first so a future score outside 0–100 cannot break the band math.
  const s = Math.max(0, Math.min(100, Math.round(score)));
  // LOW: score 86..100 (15-point band). Lower urgency at the healthy edge.
  if (s >= 86) {
    const t = (100 - s) / 14; // 0 at score 100, 1 at score 86
    return Math.round(15 + t * 15); // 15..30
  }
  // MEDIUM: score 72..85 (14-point band).
  if (s >= 72) {
    const t = (85 - s) / 13;
    return Math.round(35 + t * 20); // 35..55
  }
  // HIGH: score 55..71 (17-point band).
  if (s >= 55) {
    const t = (71 - s) / 16;
    return Math.round(60 + t * 20); // 60..80
  }
  // CRITICAL: score 0..54 (55-point band).
  const t = (54 - s) / 54;
  return Math.round(85 + t * 15); // 85..100
}
