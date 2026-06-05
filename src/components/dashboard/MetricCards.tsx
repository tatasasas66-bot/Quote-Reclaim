type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "success" | "money";
};

/**
 * Render an integer day count as "1 day" or "N days". Display-only — the
 * underlying number is unchanged. Returns "--" for missing values so the
 * empty state stays consistent with the rest of the dashboard.
 */
function formatDays(value: number | null): string {
  if (value == null) return "--";
  return value === 1 ? "1 day" : `${value} days`;
}

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
  // A rounded average of 0 days reads as a bug (it implies "won instantly").
  // Treat 0 — and the no-wins null — as insufficient data and show an em dash
  // with a "Need more wins" hint instead of "0 days". The underlying
  // calculation is unchanged; this is display-only.
  const avgInsufficient = avgDaysToWin == null || avgDaysToWin === 0;
  return (
    <section className="grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard
        label="COLDEST QUOTE"
        value={formatDays(coldestDays)}
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
        tone={jobsWonLifetime > 0 ? "success" : "default"}
      />
      <MetricCard
        label="AVG DAYS TO WIN"
        value={avgInsufficient ? "—" : formatDays(avgDaysToWin)}
        hint={avgInsufficient ? "Need more wins" : "Quote sent to won"}
        tone="money"
      />
    </section>
  );
}
