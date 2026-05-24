import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { titleCaseName } from "@/lib/utils/title-case";

type RecoveryWindowAlertProps = {
  quoteId: string;
  amount: number;
  trade: string;
  clientName: string;
  city: string | null;
  state: string | null;
  daysSilent: number;
};

export function RecoveryWindowAlert({
  quoteId,
  amount,
  trade,
  clientName,
  city,
  state,
  daysSilent,
}: RecoveryWindowAlertProps) {
  // Defensive normalization so legacy/lowercase data still reads cleanly.
  const displayName = titleCaseName(clientName);
  const displayTrade = titleCaseName(trade);
  const displayCity = city ? titleCaseName(city) : "";
  const displayState = state ? state.toUpperCase() : "";

  const locationFragment =
    displayCity && displayState
      ? ` in ${displayCity}, ${displayState}`
      : displayCity
        ? ` in ${displayCity}`
        : displayState
          ? ` in ${displayState}`
          : "";

  return (
    <aside
      role="alert"
      className="rounded-lg border border-warning/45 bg-warning/10 shadow-[0_20px_60px_rgba(226,166,59,0.12)]"
    >
      <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-warning/40 bg-warning/15 text-warning">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-warning">
            RECOVERY WINDOW ALERT
          </p>
          <p className="mt-1 text-2xl font-black text-ink-strong">
            Don&apos;t let this one die.
          </p>
          <p className="mt-1 text-sm leading-6 text-ink">
            <span className="font-bold text-ink-strong">
              {formatCurrency(amount)}
            </span>{" "}
            {displayTrade.toLowerCase()} quote · {displayName}
            {locationFragment} · {daysSilent} days with no reply.
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            The next follow-up is queued. Open the plan or send it early today.
          </p>
        </div>

        <Link
          href={`/quotes/${quoteId}`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-warning px-4 py-2 text-sm font-black text-canvas shadow-[0_0_34px_rgba(226,166,59,0.24)] transition-colors hover:bg-warning/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          Open Recovery Plan
        </Link>
      </div>
    </aside>
  );
}
