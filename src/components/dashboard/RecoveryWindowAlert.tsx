import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";

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
  const locationFragment =
    city && state
      ? ` in ${city}, ${state}`
      : city
        ? ` in ${city}`
        : state
          ? ` in ${state}`
          : "";

  return (
    <aside
      role="alert"
      className="rounded-xl border border-warning/40 bg-warning/10 p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-warning">
        RECOVERY WINDOW ALERT
      </p>
      <p className="mt-2 text-xl font-bold text-ink-strong">
        Don&apos;t let this one die.
      </p>
      <p className="mt-1 text-base text-ink">
        <span className="font-semibold text-ink-strong">
          {formatCurrency(amount)}
        </span>{" "}
        {trade} quote · {clientName}
        {locationFragment} · {daysSilent} days with no reply.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        The next follow-up is queued. Open the plan or send it early today.
      </p>
      <div className="mt-4">
        <Link
          href={`/quotes/${quoteId}`}
          className="inline-flex items-center gap-2 rounded-lg bg-warning px-4 py-2 text-sm font-semibold text-ink-strong hover:bg-warning/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          Open Recovery Plan →
        </Link>
      </div>
    </aside>
  );
}
