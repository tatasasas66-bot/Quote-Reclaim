import type { QuoteRow } from "@/lib/quotes/repo";
import { getRecoveryScore } from "./recovery-score";

export interface NextBestAction {
  label: string;
  severity: "info" | "rust" | "warning" | "success";
}

/**
 * One recommended next action per quote row. Reads the band from
 * getRecoveryScore() so labels stay in sync with the badge.
 *
 * - Won / Closed → null (nothing to do)
 * - Reply received → "Mark as won" (success cue)
 * - Fresh / Cooling → "Let recovery run" (muted info — the sequence is doing
 *   its job; no action needed)
 * - At Risk → "Send early" (rust — the contractor should poke today)
 * - Critical → "Send the close-the-loop message today" (warning)
 */
export function nextBestAction(
  quote: QuoteRow,
  hasReply: boolean,
): NextBestAction | null {
  const { band } = getRecoveryScore(quote);
  if (band === "won" || band === "closed") return null;
  if (hasReply) return { label: "Mark as won", severity: "success" };
  if (band === "fresh" || band === "cooling") {
    return { label: "Let recovery run", severity: "info" };
  }
  if (band === "at_risk") return { label: "Send early", severity: "rust" };
  return {
    label: "Send the close-the-loop message today",
    severity: "warning",
  };
}
