import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import { nextBestAction } from "@/lib/quotes/next-best-action";
import { tradeLocationLine } from "@/lib/quotes/quote-display";
import {
  getRecoveryScore,
  priorityBarFill,
  recoveryPriority,
} from "@/lib/quotes/recovery-score";
import type { QuoteRow } from "@/lib/quotes/repo";
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
  const score = getRecoveryScore(quote);
  const priority = recoveryPriority(score.score);
  // Fresh quotes map to the "LOW" priority band, which reads like "low value"
  // on a card. Show "Fresh" instead — display-only; scoring is unchanged and
  // the band color (priority.labelClass) is preserved.
  const priorityLabel = score.band === "fresh" ? "Fresh" : priority.label;
  const nba = nextBestAction(quote, hasReply);
  const displayName = titleCaseName(quote.client_name);
  // Trade + location collapse into one helper so every meta line uses the
  // same separator ("HVAC · DC", "Roofing · Tampa, FL") and HVAC casing
  // survives titleCase. Replaces the inline comma-glue that used to produce
  // "Hvac, DC" on one surface and "HVAC · DC" on another.
  const metaLine = tradeLocationLine(quote.trade, quote.city, quote.state);
  // Bar fill is now banded so a HIGH label can never render a near-empty bar.
  // Visual contract (LOW 15–30%, MEDIUM 35–55%, HIGH 60–80%, CRITICAL 85–100%)
  // lives in recovery-score so the dashboard queue and any future surface
  // can never drift.
  const barFillPct = priorityBarFill(score.score);

  return (
    <li>
      <Link
        href={`/quotes/${quote.id}`}
        className="group block rounded-lg border border-line-subtle bg-surface-1 p-4 shadow-[0_16px_46px_rgba(0,0,0,0.22)] transition-colors hover:border-brand/45 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        aria-label={`Open recovery plan for ${displayName}`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <RiskBadge level={level} />
            </div>

            <div className="min-w-0">
              <p className="break-words text-xl font-black text-ink-strong sm:truncate">
                {displayName}
              </p>
              <p className="break-words text-sm text-ink-muted">{metaLine}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2 rounded-lg border border-line-subtle bg-canvas/35 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                    Priority
                  </span>
                  <span className={`text-xs font-bold ${priority.labelClass}`}>
                    {priorityLabel}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full ${priority.barClass} transition-[width] duration-500`}
                    style={{ width: `${barFillPct}%` }}
                    aria-label={`Priority score ${score.score} of 100`}
                  />
                </div>
              </div>
              {nba ? (
                <QuoteStat
                  label="Next move"
                  value={nba.label}
                  valueClassName={severityClass[nba.severity]}
                />
              ) : (
                <QuoteStat label="Next move" value="Review plan" />
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
                Amount quiet
              </p>
              <p className="mt-1 whitespace-nowrap text-3xl font-black text-ink-strong tabular-nums">
                {formatCurrency(quote.estimate_amount)}
              </p>
            </div>
            <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-black text-canvas transition-colors group-hover:bg-brand-dark">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Open plan
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function QuoteStat({
  label,
  value,
  valueClassName = "text-ink-strong",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-line-subtle bg-canvas/35 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className={`mt-1 break-words text-sm font-black sm:truncate ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}
