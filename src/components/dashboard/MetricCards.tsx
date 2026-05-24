type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "success" | "money";
};

function MetricCard({ label, value, hint, tone = "default" }: MetricCardProps) {
  const valueClass =
    tone === "warning"
      ? "text-warning"
      : tone === "success"
        ? "text-success"
        : tone === "money"
          ? "text-money"
          : "text-ink-strong";

  return (
    <div className="rounded-lg border border-line-subtle bg-surface-1 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-black tabular-nums ${valueClass}`}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs leading-5 text-ink-muted">{hint}</p>
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
        label="COLDEST FILE"
        value={coldestDays == null ? "--" : `${coldestDays}d`}
        hint={coldestTrade ?? "Longest quiet estimate"}
        tone="warning"
      />
      <MetricCard
        label="AT RISK"
        value={String(atRiskCount)}
        hint="Quotes quiet 7+ days"
        tone="warning"
      />
      <MetricCard
        label="JOBS WON"
        value={String(jobsWonLifetime)}
        hint="Lifetime recoveries"
        tone="success"
      />
      <MetricCard
        label="AVG DAYS TO WIN"
        value={avgDaysToWin == null ? "--" : `${avgDaysToWin}d`}
        hint={avgDaysToWin == null ? "No wins recorded yet" : "Quote sent to won"}
        tone="money"
      />
    </section>
  );
}
