import type { QuoteRow } from "@/lib/quotes/repo";
import { riskLevel } from "./risk";

export type NextBestAction = {
  label: string;
  severity: "neutral" | "warning" | "danger";
};

/**
 * Returns the single recommended next action for a quote based on its
 * effective days silent, outcome, and whether a phone is saved.
 *
 * Returns null for fresh/cooling quotes — the running sequence handles them
 * and the dashboard stays uncluttered. Once a quote is "at risk" or
 * "critical", we surface a concrete next move.
 *
 * If no phone is saved we never suggest sending — we suggest copying the
 * next message so the contractor can paste it into their own SMS/email.
 */
export function nextBestAction(quote: QuoteRow): NextBestAction | null {
  const level = riskLevel(quote);
  if (level === "won" || level === "closed") return null;
  if (level === "warm" || level === "cooling") return null;

  const hasPhone = Boolean(quote.client_phone && quote.client_phone.trim());

  if (level === "hot") {
    // Critical: 15+ days quiet — final attempt to close the loop.
    return {
      label: hasPhone ? "Close the loop" : "Copy the next message",
      severity: "danger",
    };
  }

  // cold (7-14d) → At Risk
  return {
    label: hasPhone ? "Open the plan" : "Copy the next message",
    severity: "warning",
  };
}
