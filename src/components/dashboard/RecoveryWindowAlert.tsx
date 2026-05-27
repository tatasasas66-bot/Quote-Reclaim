import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
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
  const displayTrade = titleCaseName(trade);

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
      className="scroll-mt-8 rounded-lg border border-warning/45 bg-warning/10 shadow-[0_20px_60px_rgba(226,166,59,0.12)]"
    >
      <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-warning/40 bg-warning/15 text-warning">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-warning">
            DO THIS TODAY
          </p>
          <p className="mt-1 text-2xl font-black text-ink-strong">
            Open {displayName}&apos;s {displayTrade.toLowerCase()} recovery plan.
          </p>
          <p className="mt-1 text-sm leading-6 text-ink">
            <span className="font-bold text-ink-strong">
              {formatCurrency(amount)}
            </span>{" "}
            · {daysSilent} days quiet · {urgencyLabel}
          </p>
        </div>

        <Link
          href={`/quotes/${quoteId}`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-warning px-4 py-2 text-sm font-black text-canvas shadow-[0_0_34px_rgba(226,166,59,0.24)] transition-colors hover:bg-warning/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          Send the next follow-up →
        </Link>
      </div>
    </aside>
  );
}
