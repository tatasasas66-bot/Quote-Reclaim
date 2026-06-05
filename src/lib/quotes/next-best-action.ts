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
 * Labels are kept short on purpose — they render inside the IntelligenceField
 * grid cell on the quote detail page, where a long string used to clip
 * mid-word ("Send the close-the..." was the visible bug).
 *
 * - Won / Closed → null (nothing to do)
 * - Reply received → "Mark as won" (success cue)
 * - Fresh / Cooling → "Let recovery run" (muted info — sequence is doing its job)
 * - At Risk → "Send next follow-up" (rust — contractor should poke today)
 * - Critical → "Send close-the-loop today" (warning)
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
  if (band === "at_risk") {
    return { label: "Send next follow-up", severity: "rust" };
  }
  return { label: "Send close-the-loop today", severity: "warning" };
}
