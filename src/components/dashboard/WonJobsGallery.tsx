import { Trophy } from "lucide-react";
import { tradeLabel } from "@/lib/quotes/quote-display";
import { formatCurrency } from "@/lib/utils/currency";
import { titleCaseName } from "@/lib/utils/title-case";
import type { WonQuoteSummary } from "@/lib/quotes/repo";

type WonJobsGalleryProps = {
  wonQuotes: WonQuoteSummary[];
  totalWon: number;
};

function relativeWonDate(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "recently";
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} year${days < 730 ? "" : "s"} ago`;
}

export function WonJobsGallery({ wonQuotes, totalWon }: WonJobsGalleryProps) {
  const wonCount = wonQuotes.length;
  const chipClass =
    wonCount > 0
      ? "border-money/30 bg-money/10 text-money"
      : "border-line-subtle bg-surface-2 text-ink-muted";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-black uppercase tracking-widest ${chipClass}`}
        >
          <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
          Jobs Won Back
        </span>
        <p className="text-sm text-ink-muted">
          {wonCount} job{wonCount === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-money">
            {formatCurrency(totalWon)}
          </span>{" "}
          recovered
        </p>
      </div>

      {wonCount === 0 ? (
        <div className="rounded-lg border border-dashed border-money/30 bg-money/5 px-6 py-8 text-center">
          <p className="text-sm text-ink-muted">
            Your first won-back job will appear here in gold.
          </p>
        </div>
      ) : (
        <ul className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
          {wonQuotes.map((q) => (
            <li
              key={q.id}
              className="flex min-w-[220px] flex-col gap-1 rounded-lg border border-money/25 bg-money/10 p-4 sm:min-w-0"
            >
              <p className="truncate text-base font-bold text-ink-strong">
                {titleCaseName(q.client_name) || "Client"}
              </p>
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                {tradeLabel(q.trade)}
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums text-money">
                {formatCurrency(q.estimate_amount)}
              </p>
              <p className="text-xs text-ink-muted">
                Won {relativeWonDate(q.won_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
