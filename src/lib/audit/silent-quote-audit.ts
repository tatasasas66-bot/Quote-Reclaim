import { recoveryScoreForDays } from "@/lib/quotes/recovery-score";

/**
 * Silent-quote audit — the honest, deterministic math behind the cold /audit
 * landing page. No probability model, no "recoverable revenue" claim. It sums
 * what the contractor already quoted, ranks which quiet quote is worth a touch
 * first (by dollar value, weighted toward the still-pickable age window), and
 * writes one ready-to-send follow-up. Pure + framework-free so it unit-tests
 * without a DOM, a server, or Supabase.
 */

const MAX_AMOUNT_USD = 10_000_000;
const MAX_DAYS = 365;

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type AuditQuoteInput = { amountRaw: string; daysSilentRaw?: string };

export type AuditQuote = {
  /** 1-based position as the contractor entered it (Quote #1, #2, #3). */
  index: number;
  amount: number;
  /** null when the contractor left days-silent blank for this row. */
  daysSilent: number | null;
};

export type AuditResult = {
  quotes: AuditQuote[];
  totalSilentQuoteValue: number;
  priority: AuditQuote | null;
  /** Age band for the priority quote (e.g. "AT RISK"), null if no days given. */
  priorityBandLabel: string | null;
  suggestedMessage: string;
  /** Set when no valid amount was entered; result is otherwise empty. */
  error: string | null;
};

/** Accepts "$8,500", "8500", "8,500.00", " 4000 ". Rejects 0/negative/garbage. */
export function parseQuoteAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s$,]/g, "");
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT_USD) return null;
  return Math.round(n * 100) / 100;
}

/** Optional. Bare integer days, clamped 0–365. Blank/garbage → null. */
export function parseDaysSilent(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return Math.max(0, Math.min(MAX_DAYS, Number(trimmed)));
}

/**
 * How much a quote's age boosts/dampens follow-up priority. Peaks in the
 * "already cooling but still realistic" 7–45 day window — too fresh and the
 * homeowner may still be deciding; too old and the trail is usually cold.
 * Unknown days → neutral (rank on dollars alone).
 */
function followUpWeight(daysSilent: number | null): number {
  if (daysSilent == null) return 1;
  if (daysSilent < 7) return 0.7; // give a fresh quote a beat
  if (daysSilent <= 45) return 1; // prime window
  if (daysSilent <= 90) return 0.6; // cooling hard
  return 0.35; // likely cold
}

/**
 * One ready-to-send follow-up, keyed to the priority quote's age. Takeaway-
 * close style (gives the homeowner an easy yes/close-it-out choice) — never
 * the weak "just checking in". Honest: it offers a message, not an outcome.
 */
export function suggestedMessage(daysSilent: number | null): string {
  if (daysSilent != null && daysSilent > 45) {
    return "Hi — I'm about to close out the painting estimate I sent you, but wanted to give you first shot before I do. Still thinking about moving forward, or should I take it off my list for now?";
  }
  if (daysSilent != null && daysSilent <= 6) {
    return "Hi — wanted to make sure the painting estimate I sent landed okay. Any questions on the scope or the price, or anything you'd want adjusted?";
  }
  return "Hi — circling back on the painting estimate I sent over. Are you still planning to move forward, or should I close it out on my end for now? Either way's no problem — I just don't want to leave it hanging.";
}

export function runSilentQuoteAudit(inputs: AuditQuoteInput[]): AuditResult {
  const quotes: AuditQuote[] = [];
  inputs.forEach((input, i) => {
    const amount = parseQuoteAmount(input.amountRaw ?? "");
    if (amount == null) return;
    quotes.push({
      index: i + 1,
      amount,
      daysSilent: parseDaysSilent(input.daysSilentRaw),
    });
  });

  if (quotes.length === 0) {
    return {
      quotes: [],
      totalSilentQuoteValue: 0,
      priority: null,
      priorityBandLabel: null,
      suggestedMessage: "",
      error: "Enter at least one old quote amount to see your audit.",
    };
  }

  const totalSilentQuoteValue =
    Math.round(quotes.reduce((sum, q) => sum + q.amount, 0) * 100) / 100;

  // Priority = highest (dollars × age weight). Ties break toward the bigger
  // dollar amount, then the earlier-entered quote — fully deterministic.
  let priority = quotes[0];
  let bestScore = -1;
  for (const q of quotes) {
    const score = q.amount * followUpWeight(q.daysSilent);
    if (
      score > bestScore ||
      (score === bestScore && q.amount > priority.amount)
    ) {
      bestScore = score;
      priority = q;
    }
  }

  const priorityBandLabel =
    priority.daysSilent != null
      ? recoveryScoreForDays(priority.daysSilent).label
      : null;

  return {
    quotes,
    totalSilentQuoteValue,
    priority,
    priorityBandLabel,
    suggestedMessage: suggestedMessage(priority.daysSilent),
    error: null,
  };
}

/**
 * Builds the post-result account href, preserving any UTM params the paid ad
 * appended so attribution survives the hop into the existing auth flow. The
 * `next` target is the existing first-3-free onboarding reveal, so a cold
 * visitor who liked the audit lands straight in the product after magic-link
 * sign-in. We never invent an auth system — this is just the existing
 * /sign-up?next= contract with UTMs carried along.
 */
export function buildSignupHref(
  search: string,
  opts: { next?: string } = {},
): string {
  const next = opts.next ?? "/onboarding/reveal";
  const incoming = new URLSearchParams(search ?? "");
  const out = new URLSearchParams();
  out.set("next", next);
  for (const key of UTM_KEYS) {
    const value = incoming.get(key);
    if (value) out.set(key, value);
  }
  return `/sign-up?${out.toString()}`;
}
