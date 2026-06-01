import { CountUp } from "./CountUp";
import { RecoveryReceipt } from "./RecoveryReceipt";

type HeroMetricProps = {
  stillBleeding: number;
  pendingCount: number;
  recoveredThisMonth: number;
  jobsWonThisMonth: number;
  quotesBeingWorked: number;
  emailFollowups: number;
  allTimeRecovered: number;
};

export function HeroMetric({
  stillBleeding,
  pendingCount,
  recoveredThisMonth,
  jobsWonThisMonth,
  quotesBeingWorked,
  emailFollowups,
  allTimeRecovered,
}: HeroMetricProps) {
  return (
    <section className="rounded-lg border border-line-subtle bg-surface-1 shadow-[0_26px_80px_rgba(0,0,0,0.34)]">
      <div className="grid gap-0 lg:grid-cols-[1.3fr_0.7fr]">
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
              : `${pendingCount} quiet estimate${pendingCount === 1 ? "" : "s"} still ${pendingCount === 1 ? "has" : "have"} money on the table.`}
          </p>
        </div>

        <RecoveryReceipt
          recoveredThisMonth={recoveredThisMonth}
          jobsWonThisMonth={jobsWonThisMonth}
          quotesBeingWorked={quotesBeingWorked}
          emailFollowups={emailFollowups}
          allTimeRecovered={allTimeRecovered}
        />
      </div>
    </section>
  );
}
