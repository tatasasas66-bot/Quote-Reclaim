import { CircleDollarSign } from "lucide-react";
import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/utils/currency";
import { CountUp } from "./CountUp";

export type RecoveryReceiptProps = {
  recoveredThisMonth: number;
  jobsWonThisMonth: number;
  /**
   * Quotes currently under recovery (active pending quiet quotes). This is the
   * honest "what is being worked right now" count — using the live pending
   * total avoids the confusing 0 a calendar-month activity counter would show
   * on the first day of a month while real recoveries are in flight.
   */
  quotesBeingWorked: number;
  /**
   * Email follow-ups actually SENT this month. The repo filters reminders by
   * sent = true so this never counts scheduled/future rows — a "2 quotes,
   * 18 follow-ups this month" mismatch on a 5-touch sequence reads as a bug.
   */
  emailFollowupsSent: number;
  allTimeRecovered: number;
};

/**
 * The dashboard value-proof column, read as a receipt.
 *
 * Hierarchy: the ALL-TIME proof leads — it is the strongest, never-empty
 * dollar number and the clearest answer to "has this paid for itself." The
 * current month sits below as live activity, so a fresh-month $0 day never
 * makes the card read as empty. Every value is passed in honestly; nothing
 * is projected or fabricated.
 *
 * Months-paid math used to live here (and twice — once at the top, once in
 * the footer). It has been removed entirely: the ROI equation now lives in
 * exactly two places product-wide (Price Check + Win Moment), so the
 * contractor never sees the same ÷$49 punch line three times in one screen.
 * The dollars on this card speak for themselves.
 */
export function RecoveryReceipt({
  recoveredThisMonth,
  jobsWonThisMonth,
  quotesBeingWorked,
  emailFollowupsSent,
  allTimeRecovered,
}: RecoveryReceiptProps) {
  const recoveredPositive = recoveredThisMonth > 0;
  const allTimePositive = allTimeRecovered > 0;

  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <div className="inline-flex items-center gap-2 text-brand">
        <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
        <p className="text-xs font-black uppercase tracking-widest">
          Recovered So Far
        </p>
      </div>

      {/* ALL-TIME — the strongest, never-empty proof. Just the dollar number. */}
      <p className="mt-4 text-[11px] font-black uppercase tracking-widest text-ink-muted">
        All-time recovered
      </p>
      <p
        className={`mt-2 whitespace-nowrap text-4xl font-black tabular-nums ${
          allTimePositive ? "text-success" : "text-ink-strong"
        }`}
      >
        {formatCurrency(allTimeRecovered)}
      </p>
      <p className="mt-1 text-xs text-ink-muted">recovered for you</p>

      {/* THIS MONTH — live activity below the all-time proof. */}
      <p className="mt-5 text-[11px] font-black uppercase tracking-widest text-ink-muted">
        This month
      </p>

      <dl className="mt-2">
        <ReceiptRow label="Recovered this month">
          <span className={recoveredPositive ? "text-success" : "text-ink-strong"}>
            <CountUp value={recoveredThisMonth} prefix="+" />
          </span>
        </ReceiptRow>
        <ReceiptRow label="Jobs won back">{jobsWonThisMonth}</ReceiptRow>
        <ReceiptRow label="Quotes being worked">{quotesBeingWorked}</ReceiptRow>
        <ReceiptRow label="Follow-ups sent this month">
          {emailFollowupsSent}
        </ReceiptRow>
      </dl>

      {/* Footer = honest no-win or honest win line. No months-paid math. */}
      <div className="mt-auto border-t border-dashed border-line-subtle pt-3">
        {recoveredPositive ? (
          <p className="text-sm leading-6 text-ink-muted">
            That&apos;s real money back in the door this month.
          </p>
        ) : (
          <p className="text-sm leading-6 text-ink-muted">
            No wins marked this month yet. When a job comes back, it shows
            here.
          </p>
        )}
      </div>
    </div>
  );
}

function ReceiptRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line-subtle/40 py-2 last:border-b-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-base font-bold tabular-nums text-ink-strong">
        {children}
      </dd>
    </div>
  );
}
