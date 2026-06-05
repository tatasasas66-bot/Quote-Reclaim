import { CircleDollarSign } from "lucide-react";
import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/utils/currency";
import { CountUp } from "./CountUp";

// Mirrors the price used elsewhere for the months-paid math. This is display
// math only — it changes no billing/pricing logic.
const MONTHLY_PRICE_USD = 79;

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
  emailFollowups: number;
  allTimeRecovered: number;
};

function monthsWord(n: number): string {
  return n === 1 ? "month" : "months";
}

/**
 * The dashboard value-proof column, read as a receipt.
 *
 * Hierarchy: the ALL-TIME proof leads — it is the strongest, never-empty
 * number and the clearest answer to "has this paid for itself." The current
 * month sits below as live activity, so a fresh-month $0 day never makes the
 * card read as empty. Every value is passed in honestly; nothing is projected
 * or fabricated, and the months-paid math is unchanged (floor(recovered/79)).
 */
export function RecoveryReceipt({
  recoveredThisMonth,
  jobsWonThisMonth,
  quotesBeingWorked,
  emailFollowups,
  allTimeRecovered,
}: RecoveryReceiptProps) {
  const monthsPaidThisMonth = Math.floor(recoveredThisMonth / MONTHLY_PRICE_USD);
  const allTimeMonthsPaid = Math.floor(allTimeRecovered / MONTHLY_PRICE_USD);
  const recoveredPositive = recoveredThisMonth > 0;
  const allTimePositive = allTimeRecovered > 0;

  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <div className="inline-flex items-center gap-2 text-brand">
        <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
        <p className="text-xs font-black uppercase tracking-widest">
          Recovery Receipt
        </p>
      </div>

      {/* ALL-TIME — the strongest, never-empty proof, hoisted to the top as
          two headline numbers. Single source: these numbers appear once. */}
      <p className="mt-4 text-[11px] font-black uppercase tracking-widest text-ink-muted">
        All-time recovered
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p
            className={`whitespace-nowrap text-4xl font-black tabular-nums ${
              allTimePositive ? "text-success" : "text-ink-strong"
            }`}
          >
            {formatCurrency(allTimeRecovered)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">recovered for you</p>
        </div>
        <div className="min-w-0">
          <p
            className={`text-4xl font-black tabular-nums ${
              allTimeMonthsPaid > 0 ? "text-success" : "text-ink-strong"
            }`}
          >
            {allTimeMonthsPaid}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {allTimeMonthsPaid === 1 ? "month paid for" : "months paid for"}
          </p>
        </div>
      </div>

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
        <ReceiptRow label="Follow-ups this month">{emailFollowups}</ReceiptRow>
      </dl>

      <div className="mt-auto border-t border-dashed border-line-subtle pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm font-bold text-ink-strong">
            Months paid this month
          </dt>
          <dd className="text-2xl font-black tabular-nums text-ink-strong">
            {monthsPaidThisMonth}
          </dd>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          {!recoveredPositive
            ? "Mark a job as won to see how many months Quote Reclaim paid for."
            : monthsPaidThisMonth >= 1
              ? `This month paid for Quote Reclaim for ${monthsPaidThisMonth} ${monthsWord(monthsPaidThisMonth)}.`
              : "This month started covering your Quote Reclaim subscription."}
        </p>
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
