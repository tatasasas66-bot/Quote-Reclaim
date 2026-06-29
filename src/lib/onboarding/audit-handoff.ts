import { TRADES } from "@/lib/utils/normalize";

export const AUDIT_HANDOFF_KEY = "quote-reclaim:audit-result-v1";

export function resolveAuditHandoffTrade(
  handoffTrade?: string | null,
  profileTrade?: string | null,
): string {
  const candidates =
    handoffTrade != null ? [handoffTrade] : [profileTrade];
  for (const candidate of candidates) {
    const normalized = candidate?.trim().toLowerCase();
    if (!normalized || normalized === "default") continue;
    const match = TRADES.find((trade) => trade.toLowerCase() === normalized);
    if (match) return match;
  }
  return "";
}
