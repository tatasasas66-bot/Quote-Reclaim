import { formatCurrency } from "@/lib/utils/currency";

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
    <section className="grid w-full min-w-0 gap-3 sm:grid-cols-3">
      <LedgerCard
        eyebrowClassName="text-warning/80"
        eyebrow="STILL BLEEDING"
        value={formatCurrency(stillBleeding)}
        valueClassName="text-ink-strong"
        subline={
          pendingCount === 0
            ? "No quiet estimates right now."
            : `Money sitting quiet right now. ${pendingCount} estimate${pendingCount === 1 ? "" : "s"} waiting.`
        }
      />
      <LedgerCard
        eyebrowClassName="text-success/80"
        eyebrow="RECOVERED THIS MONTH"
        value={`+${formatCurrency(recoveredThisMonth)}`}
        valueClassName="text-success"
        subline={
          jobsWonThisMonth === 0
            ? "Jobs won back so far: 0."
            : `Jobs won back so far: ${jobsWonThisMonth}.`
        }
      />
      <LedgerCard
        eyebrowClassName="text-money/80"
        eyebrow="ALL-TIME RECOVERED"
        value={formatCurrency(allTimeRecovered)}
        valueClassName="text-money"
        subline={`Approx. ${monthsPaidFor} month${monthsPaidFor === 1 ? "" : "s"} paid for.`}
      />
    </section>
  );
}

type LedgerCardProps = {
  eyebrow: string;
  eyebrowClassName: string;
  value: string;
  valueClassName: string;
  subline: string;
};

function LedgerCard({
  eyebrow,
  eyebrowClassName,
  value,
  valueClassName,
  subline,
}: LedgerCardProps) {
  return (
    <div className="rounded-xl border border-line-subtle bg-surface-2 p-5">
      <p
        className={`text-xs font-semibold uppercase tracking-widest ${eyebrowClassName}`}
      >
        {eyebrow}
      </p>
      <p
        className={`mt-2 text-4xl font-bold tabular-nums ${valueClassName}`}
      >
        {value}
      </p>
      <p className="mt-2 text-sm text-ink-muted">{subline}</p>
    </div>
  );
}
