import { CheckCircle2, CircleDollarSign } from "lucide-react";
import type { ReactNode } from "react";
import { CountUp } from "./CountUp";

const MONTHLY_PRICE_USD = 79;

type HeroMetricProps = {
  stillBleeding: number;
  pendingCount: number;
  recoveredThisMonth: number;
  lastMonthRecovered: number;
  allTimeRecovered: number;
};

function recoveredSubline(thisMonth: number, lastMonth: number): ReactNode {
  if (thisMonth > 0) {
    if (lastMonth === 0) {
      return <span className="text-success">First wins this month</span>;
    }
    const delta = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    const cls =
      delta > 0 ? "text-success" : delta === 0 ? "text-ink-muted" : "text-warning";
    return (
      <span className={cls}>
        {delta > 0 ? "+" : ""}
        {delta}% vs last month
      </span>
    );
  }
  if (lastMonth === 0) {
    return "Win your first job to break the streak →";
  }
  return "No wins recorded yet this month.";
}

export function HeroMetric({
  stillBleeding,
  pendingCount,
  recoveredThisMonth,
  lastMonthRecovered,
  allTimeRecovered,
}: HeroMetricProps) {
  const monthsPaidFor = Math.floor(allTimeRecovered / MONTHLY_PRICE_USD);
  const hasAllTime = allTimeRecovered > 0;
  const recoveredThisMonthPositive = recoveredThisMonth > 0;

  return (
    <section className="rounded-lg border border-line-subtle bg-surface-1 shadow-[0_26px_80px_rgba(0,0,0,0.34)]">
      <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="border-b border-line-subtle p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <p className="text-xs font-black uppercase tracking-widest text-warning/80">
            STILL BLEEDING
          </p>
          <p className="mt-4 text-6xl font-black tracking-tight text-ink-strong tabular-nums sm:text-7xl lg:text-8xl">
            <CountUp value={stillBleeding} />
          </p>
          <p className="mt-3 max-w-xl text-base leading-7 text-ink">
            {pendingCount === 0
              ? "No quiet estimates right now. The command center is clear."
              : `${pendingCount} quiet estimate${pendingCount === 1 ? "" : "s"} still have money on the table.`}
          </p>
        </div>

        <div className="grid content-stretch">
          <LedgerSideStat
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            label="RECOVERED THIS MONTH"
            value={<CountUp value={recoveredThisMonth} prefix="+" />}
            subline={recoveredSubline(recoveredThisMonth, lastMonthRecovered)}
            accentClassName={
              recoveredThisMonthPositive
                ? "text-success bg-success/10"
                : "text-ink-muted bg-surface-2"
            }
            labelClassName={
              recoveredThisMonthPositive ? "text-success/80" : "text-ink-muted"
            }
          />
          <LedgerSideStat
            icon={<CircleDollarSign className="h-5 w-5" aria-hidden="true" />}
            label="MONTHS PAID FOR"
            value={hasAllTime ? `${monthsPaidFor}× return` : "Not yet"}
            subline={
              hasAllTime ? (
                <>
                  <CountUp value={allTimeRecovered} /> recovered all time
                </>
              ) : (
                <a
                  href="#recovery-window-alert"
                  className="text-ink-muted underline decoration-ink-muted/40 underline-offset-2 hover:text-ink-strong"
                >
                  Win one job to start the meter &rarr;
                </a>
              )
            }
            accentClassName="text-ink-muted bg-surface-2"
            labelClassName="text-ink-muted"
          />
        </div>
      </div>
    </section>
  );
}

function LedgerSideStat({
  icon,
  label,
  value,
  subline,
  accentClassName,
  labelClassName,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  subline: ReactNode;
  accentClassName: string;
  labelClassName: string;
}) {
  return (
    <div className="border-b border-line-subtle p-5 last:border-b-0 sm:p-6 lg:min-h-[50%]">
      <div className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 ${accentClassName}`}>
        {icon}
        <p className={`text-xs font-black uppercase tracking-widest ${labelClassName}`}>
          {label}
        </p>
      </div>
      <p className="mt-3 text-4xl font-black text-ink-strong tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-sm text-ink-muted">{subline}</p>
    </div>
  );
}
