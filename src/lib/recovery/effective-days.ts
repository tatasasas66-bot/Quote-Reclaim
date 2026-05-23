/**
 * Returns the current "days silent" for a quote based on quote_sent_at.
 *
 * The stored days_silent column is a snapshot at insert/edit time; this helper
 * reflects elapsed real-world time, so the dashboard never shows a stale count
 * just because the contractor hasn't re-saved the quote.
 *
 * Falls back to the stored days_silent if quote_sent_at is missing.
 */
export function effectiveDaysSilent(quote: {
  days_silent: number;
  quote_sent_at: string | null;
}): number {
  if (!quote.quote_sent_at) return quote.days_silent;
  const sent = Date.parse(quote.quote_sent_at);
  if (Number.isNaN(sent)) return quote.days_silent;
  const elapsed = (Date.now() - sent) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.floor(elapsed));
}
