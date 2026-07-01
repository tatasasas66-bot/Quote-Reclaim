import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { tradeLabel } from "@/lib/quotes/quote-display";
import { recoveryPriority } from "@/lib/quotes/recovery-score";
import { titleCaseName } from "@/lib/utils/title-case";

type RecoveryWindowAlertProps = {
  quoteId: string;
  amount: number;
  trade: string;
  clientName: string;
  daysSilent: number;
  score: number;
};

export function RecoveryWindowAlert({
  quoteId,
  amount,
  trade,
  clientName,
  daysSilent,
  score,
}: RecoveryWindowAlertProps) {
  // Defensive normalization so legacy/lowercase data still reads cleanly.
  const displayName = titleCaseName(clientName);
  // tradeLabel preserves acronyms (HVAC stays HVAC, not "Hvac").
  const displayTrade = tradeLabel(trade);

  const { label: priority } = recoveryPriority(score);
  const urgencyLabel =
    priority === "CRITICAL"
      ? "Critical"
      : priority === "HIGH"
        ? "At Risk"
        : "Cooling";

  return (
    <aside
      id="recovery-window-alert"
      role="alert"
      className="scroll-mt-8 overflow-hidden rounded-2xl border border-brand/25 bg-white shadow-premium"
    >
      <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-warning/40 bg-warning/15 text-warning">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-warning">
            DO THIS TODAY
          </p>
          <p className="mt-1 text-xl font-black leading-tight text-ink-strong sm:text-2xl">
            Work {displayName} first.
          </p>
          <p className="mt-2 text-sm leading-6 text-ink">
            <span className="font-bold text-ink-strong">{displayTrade}</span> ·{" "}
            <span className="font-bold text-ink-strong">
              {formatCurrency(amount)}
            </span>{" "}
            · {daysSilent} days quiet · {urgencyLabel}
          </p>
        </div>

        <Link
          href={`/quotes/${quoteId}`}
          className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-brand px-4 py-2 text-sm font-bold text-white shadow-premium transition-all hover:bg-brand-dark hover:shadow-premium-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          Work this quote →
        </Link>
      </div>
    </aside>
  );
}
