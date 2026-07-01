import {
  MONTHLY_PRICE_USD,
  PAYWALL_PRICE_LABEL,
} from "@/lib/payments/entitlement";
import { roiFraming, roiPieces } from "@/lib/utils/roi-framing";
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
  // Above 24 months the raw months number (e.g. twelve-thousand covering
  // one-hundred-fifty-one months) reads as comedic and argues against monthly
  // renewal. roiFraming flips to "Nx a full year of Quote Reclaim" past the
  // 24-month line so the punch line stays believable. The headline uses the
  // SHORT form ("12x a full year") so the emphasized phrase always fits the
  // card; the body carries the full "of Quote Reclaim" phrase once.
  const roiPhrase = roiFraming(biggestQuoteAmount);
  const roi = roiPieces(biggestQuoteAmount);
  const roiShort =
    roi.kind === "years"
      ? `${roi.yearMultiple}x a full year`
      : roi.kind === "months"
        ? `${roi.months} months`
        : "less than 1 month";

  return (
    <section
      aria-labelledby="paid-for-itself-heading"
      className="min-w-0 rounded-2xl border border-brand/20 bg-white p-5 shadow-premium"
    >
      <p
        id="paid-for-itself-heading"
        className="text-xs font-black uppercase tracking-widest text-money"
      >
        Price check
      </p>
      <p className="mt-3 break-words text-2xl font-black leading-tight text-ink-strong">
        If this one comes back, that&apos;s{" "}
        <span className="text-money">{roiShort}</span>.
      </p>
      <p className="mt-2 break-words text-sm leading-6 text-ink">
        Your biggest quiet quote is{" "}
        <span className="font-bold text-ink-strong">{displayName}</span>,{" "}
        <span className="whitespace-nowrap font-bold text-ink-strong tabular-nums">
          {formatCurrency(biggestQuoteAmount)}
        </span>
        . If it comes back, that&apos;s {roiPhrase}.{" "}
        <span className="whitespace-nowrap tabular-nums">
          {formatCurrency(queueTotal)}
        </span>{" "}
        is sitting across {pendingCount} quiet quote
        {pendingCount === 1 ? "" : "s"} total.
      </p>
      <p className="mt-3 text-xs leading-5 text-ink-muted">
        Straight math from your own queue:{" "}
        {formatCurrency(biggestQuoteAmount)} ÷ {PAYWALL_PRICE_LABEL}.
        No promises — just the size of the opportunity.
      </p>
    </section>
  );
}
