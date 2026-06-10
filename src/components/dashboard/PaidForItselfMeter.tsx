import {
  MONTHLY_PRICE_USD,
  PAYWALL_PRICE_LABEL,
} from "@/lib/payments/entitlement";
import { formatCurrency } from "@/lib/utils/currency";
import { titleCaseName } from "@/lib/utils/title-case";

type Props = {
  /** The single largest pending quote in the queue — real data only. */
  biggestQuoteName: string;
  biggestQuoteAmount: number;
  /** Live queue totals for the supporting anchor line. */
  queueTotal: number;
  pendingCount: number;
};

/**
 * Paid-For-Itself Meter — the "price feels small" proof panel.
 *
 * Pure math from the contractor's own queue, computed at render: the biggest
 * quiet quote divided by the monthly price = months of Quote Reclaim that ONE
 * job coming back would cover. No promise that it comes back — the panel says
 * so explicitly. Renders nothing unless a real quote big enough to cover at
 * least two months exists, so the math is never silly or fabricated.
 *
 * This is value anchoring, not an action panel — it must never compete with
 * the DO THIS TODAY alert for the contractor's next click.
 */
export function PaidForItselfMeter({
  biggestQuoteName,
  biggestQuoteAmount,
  queueTotal,
  pendingCount,
}: Props) {
  // Honest-math guard: no quote, or a quote too small for the anchor to mean
  // anything, renders nothing. Never invent a number.
  if (!Number.isFinite(biggestQuoteAmount) || biggestQuoteAmount <= 0) {
    return null;
  }
  const monthsCovered = Math.floor(biggestQuoteAmount / MONTHLY_PRICE_USD);
  if (monthsCovered < 2) return null;

  const displayName = titleCaseName(biggestQuoteName);

  return (
    <section
      aria-labelledby="paid-for-itself-heading"
      className="rounded-lg border border-money/30 bg-surface-1 p-5 shadow-[0_16px_46px_rgba(0,0,0,0.2)]"
    >
      <p
        id="paid-for-itself-heading"
        className="text-xs font-black uppercase tracking-widest text-money"
      >
        Price check
      </p>
      <p className="mt-3 text-2xl font-black leading-tight text-ink-strong">
        If this one comes back, that covers{" "}
        <span className="whitespace-nowrap text-money tabular-nums">
          {monthsCovered} months
        </span>
        .
      </p>
      <p className="mt-2 text-sm leading-6 text-ink">
        Your biggest quiet quote is{" "}
        <span className="font-bold text-ink-strong">{displayName}</span>,{" "}
        <span className="whitespace-nowrap font-bold text-ink-strong tabular-nums">
          {formatCurrency(biggestQuoteAmount)}
        </span>
        . If it comes back, that alone covers {monthsCovered} months of
        Quote Reclaim.{" "}
        <span className="whitespace-nowrap tabular-nums">
          {formatCurrency(queueTotal)}
        </span>{" "}
        is sitting across {pendingCount} quiet quote
        {pendingCount === 1 ? "" : "s"} total.
      </p>
      <p className="mt-3 text-xs leading-5 text-ink-muted">
        Straight math from your own queue:{" "}
        {formatCurrency(biggestQuoteAmount)} ÷ {PAYWALL_PRICE_LABEL}. No
        promises — just the size of the opportunity.
      </p>
    </section>
  );
}
