import { CheckCircle2, CircleDollarSign, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";
import { CountUp } from "./CountUp";

const MONTHLY_PRICE_USD = 79;

type HeroMetricProps = {
  stillBleeding: number;
  pendingCount: number;
  recoveredThisMonth: number;
  jobsWonThisMonth: number;
  allTimeRecovered: number;
};

export function HeroMetric({
  stillBleeding,
  pendingCount,
  recoveredThisMonth,
  jobsWonThisMonth,
  allTimeRecovered,
}: HeroMetricProps) {
  const monthsPaidFor = Math.floor(allTimeRecovered / MONTHLY_PRICE_USD);

  return (
    <section className="rounded-lg border border-line-subtle bg-surface-1 shadow-[0_26px_80px_rgba(0,0,0,0.34)]">
      <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="border-b border-line-subtle p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-widest text-warning/80">
              STILL BLEEDING
            </p>
            <span className="inline-flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-warning">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
              Live ledger
            </span>
          </div>
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
            subline={
              jobsWonThisMonth === 0
                ? "No wins recorded yet this month."
                : `${jobsWonThisMonth} job${jobsWonThisMonth === 1 ? "" : "s"} won back.`
            }
            tone="success"
          />
          <LedgerSideStat
            icon={<CircleDollarSign className="h-5 w-5" aria-hidden="true" />}
            label="MONTHS PAID FOR"
            value={`${monthsPaidFor}x`}
            subline={
              <>
                <CountUp value={allTimeRecovered} /> recovered all time.
              </>
            }
            tone="money"
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
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  subline: ReactNode;
  tone: "success" | "money";
}) {
  const toneClass =
    tone === "success" ? "text-success bg-success/10" : "text-money bg-money/10";
  const labelClass = tone === "success" ? "text-success/80" : "text-money/80";

  return (
    <div className="border-b border-line-subtle p-5 last:border-b-0 sm:p-6 lg:min-h-[50%]">
      <div className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 ${toneClass}`}>
        {icon}
        <p className={`text-xs font-black uppercase tracking-widest ${labelClass}`}>
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
