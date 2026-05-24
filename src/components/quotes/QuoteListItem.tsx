import Link from "next/link";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import { nextBestAction } from "@/lib/quotes/next-best-action";
import { getRecoveryScore } from "@/lib/quotes/recovery-score";
import type { QuoteRow } from "@/lib/quotes/repo";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";
import { riskLevel } from "@/lib/recovery/risk";
import { formatCurrency } from "@/lib/utils/currency";
import { titleCaseName } from "@/lib/utils/title-case";

const severityClass: Record<"info" | "rust" | "warning" | "success", string> = {
  info: "text-ink-muted",
  rust: "text-brand",
  warning: "text-warning",
  success: "text-success",
};

export function QuoteListItem({
  quote,
  hasReply = false,
}: {
  quote: QuoteRow;
  hasReply?: boolean;
}) {
  const level = riskLevel(quote);
  const days = effectiveDaysSilent(quote);
  const score = getRecoveryScore(quote);
  const nba = nextBestAction(quote, hasReply);
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
          <p className="text-xs text-ink-muted">
            Recovery Priority: {score.score}
          </p>
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
