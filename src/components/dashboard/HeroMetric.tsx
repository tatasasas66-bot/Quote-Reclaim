import { CountUp } from "./CountUp";
import { RecoveryReceipt } from "./RecoveryReceipt";

type HeroMetricProps = {
  stillBleeding: number;
  pendingCount: number;
  /**
   * Count of quotes that are At Risk or Critical (effective days silent >= 7).
   * Drives the state-aware hero: with zero at-risk quotes the alarm framing
   * ("STILL BLEEDING") is wrong, so we switch to the calmer "MONEY ON THE
   * TABLE" / "in recovery" copy.
   */
  atRiskCount: number;
  recoveredThisMonth: number;
  jobsWonThisMonth: number;
  quotesBeingWorked: number;
  emailFollowups: number;
  allTimeRecovered: number;
};

export function HeroMetric({
  stillBleeding,
  pendingCount,
  atRiskCount,
  recoveredThisMonth,
  jobsWonThisMonth,
  quotesBeingWorked,
  emailFollowups,
  allTimeRecovered,
}: HeroMetricProps) {
  // Only sound the alarm ("STILL BLEEDING") when something is actually at
  // risk. If every active quote is still Fresh/Cooling, the money is on the
  // table — not bleeding. Eyebrow color token is unchanged in both states.
  const hasAtRisk = atRiskCount > 0;
  const heading = hasAtRisk ? "STILL BLEEDING" : "MONEY ON THE TABLE";
  const subtext =
    pendingCount === 0
      ? "No quiet estimates right now. The command center is clear."
      : hasAtRisk
        ? `${pendingCount} quiet estimate${pendingCount === 1 ? "" : "s"} still ${pendingCount === 1 ? "has" : "have"} money on the table.`
        : `${pendingCount} ${pendingCount === 1 ? "estimate is" : "estimates are"} in recovery.`;

  return (
    <section className="rounded-lg border border-line-subtle bg-surface-1 shadow-[0_26px_80px_rgba(0,0,0,0.34)]">
      <div className="grid gap-0 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="border-b border-line-subtle p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <p className="text-xs font-black uppercase tracking-widest text-warning/80">
            {heading}
          </p>
          <p className="mt-4 text-6xl font-black tracking-tight text-ink-strong tabular-nums sm:text-7xl lg:text-8xl">
            <CountUp value={stillBleeding} />
          </p>
          <p className="mt-3 max-w-xl text-base leading-7 text-ink">{subtext}</p>
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
