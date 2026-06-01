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
  quietQuotesWorked: number;
  emailFollowups: number;
  allTimeRecovered: number;
};

function monthsWord(n: number): string {
  return n === 1 ? "month" : "months";
}

/**
 * The dashboard value-proof column, read as a receipt: what Quote Reclaim did
 * this month and how many months of the subscription that recovery covered.
 * Every number is real and passed in — nothing is fabricated or projected.
 */
export function RecoveryReceipt({
  recoveredThisMonth,
  jobsWonThisMonth,
  quietQuotesWorked,
  emailFollowups,
  allTimeRecovered,
}: RecoveryReceiptProps) {
  const monthsPaidThisMonth = Math.floor(recoveredThisMonth / MONTHLY_PRICE_USD);
  const allTimeMonthsPaid = Math.floor(allTimeRecovered / MONTHLY_PRICE_USD);
  const recoveredPositive = recoveredThisMonth > 0;

  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <div className="inline-flex items-center gap-2 text-brand">
        <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
        <p className="text-xs font-black uppercase tracking-widest">
          Recovery Receipt
        </p>
      </div>

      <p className="mt-4 text-[11px] font-black uppercase tracking-widest text-ink-muted">
        This month
      </p>

      <dl className="mt-2">
        <ReceiptRow label="Recovered this month">
          <span className={recoveredPositive ? "text-success" : "text-ink-strong"}>
            <CountUp value={recoveredThisMonth} prefix="+" />
          </span>
        </ReceiptRow>
        <ReceiptRow label="Jobs won back">{jobsWonThisMonth}</ReceiptRow>
        <ReceiptRow label="Quiet quotes worked">{quietQuotesWorked}</ReceiptRow>
        <ReceiptRow label="Email follow-ups">{emailFollowups}</ReceiptRow>
      </dl>

      <div className="mt-3 border-t border-dashed border-line-subtle pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm font-bold text-ink-strong">
            Months paid for
          </dt>
          <dd className="text-3xl font-black tabular-nums text-ink-strong">
            {monthsPaidThisMonth}
          </dd>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          {!recoveredPositive
            ? "Mark a job as won and this receipt will show exactly how many months Quote Reclaim paid for."
            : monthsPaidThisMonth >= 1
              ? `This month paid for Quote Reclaim for ${monthsPaidThisMonth} ${monthsWord(monthsPaidThisMonth)}.`
              : "This month started covering your Quote Reclaim subscription."}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line-subtle pt-3 text-xs text-ink-muted">
        <span>
          All time recovered{" "}
          <span className="font-black tabular-nums text-ink-strong">
            {formatCurrency(allTimeRecovered)}
          </span>
        </span>
        <span>
          All-time months paid for{" "}
          <span className="font-black tabular-nums text-ink-strong">
            {allTimeMonthsPaid}
          </span>
        </span>
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
