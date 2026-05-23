type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
};

function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-line-subtle bg-surface-2 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-ink-strong">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

type MetricCardsProps = {
  coldestDays: number | null;
  coldestTrade: string | null;
  atRiskCount: number;
  jobsWonLifetime: number;
  avgDaysToWin: number | null;
};

export function MetricCards({
  coldestDays,
  coldestTrade,
  atRiskCount,
  jobsWonLifetime,
  avgDaysToWin,
}: MetricCardsProps) {
  return (
    <section className="grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard
        label="COLDEST"
        value={coldestDays == null ? "—" : `${coldestDays}d`}
        hint={coldestTrade ?? "Longest silent quote"}
      />
      <MetricCard
        label="AT RISK"
        value={String(atRiskCount)}
        hint="Quotes silent ≥ 7 days"
      />
      <MetricCard
        label="JOBS WON"
        value={String(jobsWonLifetime)}
        hint="Lifetime"
      />
      <MetricCard
        label="AVG DAYS TO WIN"
        value={avgDaysToWin == null ? "—" : `${avgDaysToWin}d`}
        hint={avgDaysToWin == null ? "No wins recorded yet" : "Quote sent → won"}
      />
    </section>
  );
}
