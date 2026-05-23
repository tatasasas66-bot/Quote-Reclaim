import Link from "next/link";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import type { QuoteRow } from "@/lib/quotes/repo";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";
import { nextBestAction } from "@/lib/recovery/next-best-action";
import { riskLevel } from "@/lib/recovery/risk";
import { formatCurrency } from "@/lib/utils/currency";
import { titleCaseName } from "@/lib/utils/title-case";

const severityClass: Record<"neutral" | "warning" | "danger", string> = {
  neutral: "text-ink-muted",
  warning: "text-warning",
  danger: "text-danger",
};

export function QuoteListItem({ quote }: { quote: QuoteRow }) {
  const level = riskLevel(quote);
  const days = effectiveDaysSilent(quote);
  const nba = nextBestAction(quote);
  const displayName = titleCaseName(quote.client_name);
  const displayTrade = titleCaseName(quote.trade);
  const displayCity = quote.city ? titleCaseName(quote.city) : "";
  const displayState = quote.state ? quote.state.toUpperCase() : "";
  return (
    <li>
      <Link
        href={`/quotes/${quote.id}`}
        className="flex flex-col gap-3 p-4 transition-colors hover:bg-surface-3 focus:bg-surface-3 focus:outline-none sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate font-semibold text-ink-strong">
            {displayName}
          </p>
          <p className="truncate text-sm text-ink-muted">
            {displayTrade}
            {displayCity ? ` · ${displayCity}` : ""}
            {displayState ? `, ${displayState}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <RiskBadge level={level} />
            <span>
              {days} day{days === 1 ? "" : "s"} quiet
            </span>
          </div>
          {nba ? (
            <p className={`text-xs font-semibold ${severityClass[nba.severity]}`}>
              Next Best Action: {nba.label}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-semibold tabular-nums text-ink-strong">
            {formatCurrency(quote.estimate_amount)}
          </span>
        </div>
      </Link>
    </li>
  );
}
