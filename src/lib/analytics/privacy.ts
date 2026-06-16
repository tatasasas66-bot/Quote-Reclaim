/**
 * Privacy-safe helpers for analytics event payloads.
 *
 * The audit landing page must NEVER send raw quote amounts, customer names,
 * emails, phone numbers, or addresses to a third-party analytics vendor.
 * These helpers reduce the available signal (count, bucket, presence flag)
 * to what's still useful for funnel analysis without ever transmitting data
 * the contractor would consider customer information.
 */
import { UTM_KEYS } from "@/lib/audit/silent-quote-audit";

/**
 * Bucket a dollar amount into one of five coarse ranges. The buckets are
 * chosen for the residential-painting price spread; they let us see whether
 * a campaign brings in $1K-quote leads vs $10K-quote leads without ever
 * recording the actual dollar figure.
 */
export function bucketCurrency(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "invalid";
  if (value < 1_000) return "0_999";
  if (value < 2_500) return "1000_2499";
  if (value < 5_000) return "2500_4999";
  if (value < 10_000) return "5000_9999";
  return "10000_plus";
}

/**
 * Reads ONLY the documented UTM params from a query string, capping each at
 * 100 chars so a malformed ad URL can't bloat an event payload. Drops every
 * other query param (fbclid, gclid, etc.) — we don't need them and they
 * tend to carry user-identifiers.
 */
export function readUtms(search: string): Record<string, string> {
  const params = new URLSearchParams(search ?? "");
  const out: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, 100);
  }
  return out;
}
