import type { QuoteRow } from "@/lib/quotes/repo";
import { riskLevel } from "./risk";

export type NextBestAction = {
  label: string;
  severity: "neutral" | "warning" | "danger";
};

/**
 * Returns the single recommended next action for a quote based on its
 * effective days silent and outcome. Returns null when the queue should
 * just let the running sequence handle it.
 */
export function nextBestAction(quote: QuoteRow): NextBestAction | null {
  const level = riskLevel(quote);
  if (level === "won" || level === "closed") return null;
  if (level === "warm" || level === "cooling") return null;
  if (level === "hot") {
    return { label: "Add reactivation", severity: "danger" };
  }
  // cold (7-14d)
  return { label: "Send early", severity: "warning" };
}
