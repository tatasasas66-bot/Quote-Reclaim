/**
 * Returns the current "days silent" for a quote.
 *
 * This is the SINGLE source of truth for effective quiet age — used by both
 * the UI (quote detail page, dashboard, recovery plan) and the cron send path
 * (via the claim_due_reminders RPC which mirrors this exact logic).
 *
 * Priority:
 *   1. If quote_sent_at exists: days between now and quote_sent_at
 *   2. If quote_sent_at is null/invalid: stored days_silent + days since
 *      the quote record was created (created_at)
 *
 * This ensures a quote entered as "20 days quiet" 3 days ago shows 23 days
 * quiet (not 20) — matching what the cron RPC computes and what the scheduled
 * email will be based on.
 *
 * The RPC (migration 014) mirrors this logic in SQL:
 *   case
 *     when q.quote_sent_at is not null then
 *       greatest(0, extract(day from now() - q.quote_sent_at)::int)
 *     else
 *       greatest(0, q.days_silent + extract(day from now() - q.created_at)::int)
 *   end
 */
export function effectiveDaysSilent(quote: {
  days_silent: number;
  quote_sent_at: string | null;
  created_at?: string | null;
}): number {
  // Priority 1: quote_sent_at — the real estimate sent date
  if (quote.quote_sent_at) {
    const sent = Date.parse(quote.quote_sent_at);
    if (!Number.isNaN(sent)) {
      const elapsed = (Date.now() - sent) / (1000 * 60 * 60 * 24);
      return Math.max(0, Math.floor(elapsed));
    }
  }

  // Priority 2: stored days_silent + elapsed since created_at
  // This matches the cron RPC's fallback formula.
  if (quote.created_at) {
    const created = Date.parse(quote.created_at);
    if (!Number.isNaN(created)) {
      const elapsedSinceCreated = Math.floor(
        (Date.now() - created) / (1000 * 60 * 60 * 24),
      );
      return Math.max(0, quote.days_silent + elapsedSinceCreated);
    }
  }

  // Fallback: just the stored snapshot (no created_at available)
  return quote.days_silent;
}
