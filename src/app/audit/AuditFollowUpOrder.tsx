import { ArrowDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import type { RankedAuditQuote } from "@/lib/audit/silent-quote-audit";
import { actionForRank, WINDOW_TONES } from "./audit-presentation";

type AuditFollowUpOrderProps = {
  ranked: RankedAuditQuote[];
};

export function AuditFollowUpOrder({ ranked }: AuditFollowUpOrderProps) {
  return (
    <section
      data-testid="audit-follow-up-order"
      aria-labelledby="follow-up-order-title"
      className="border-t border-line-strong pt-7"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Next follow-up order
          </p>
          <h3
            id="follow-up-order-title"
            className="mt-2 text-2xl font-black text-ink-strong"
          >
            Do not chase randomly.
          </h3>
        </div>
        <p className="max-w-md text-sm leading-6 text-ink-muted">
          Start where the money is still closest to alive. Then work down the
          list.
        </p>
      </div>

      <ol className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line-subtle bg-line-subtle lg:grid-cols-3">
        {ranked.map((quote) => (
          <li
            key={quote.index}
            data-testid={`audit-rank-row-${quote.rank}`}
            className="min-w-0 bg-surface-1 p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-black ${
                  quote.rank === 1
                    ? "bg-brand text-canvas"
                    : "bg-surface-3 text-ink-muted"
                }`}
              >
                {quote.rank}
              </span>
              <span
                className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                  WINDOW_TONES[quote.windowLabel] ?? WINDOW_TONES.Unknown
                }`}
              >
                {quote.windowLabel}
              </span>
            </div>
            <p className="mt-5 break-words text-sm font-black text-ink-strong">
              Quote #{quote.index}
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-money">
              {formatCurrency(quote.amount)}
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              {quote.daysSilent != null
                ? `${quote.daysSilent} days quiet`
                : "Days quiet not entered"}
            </p>
            <div className="mt-4 flex items-center gap-2 border-t border-line-subtle pt-4 text-xs font-black uppercase tracking-widest text-brand">
              {actionForRank(quote)}
              {quote.rank < ranked.length ? (
                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
