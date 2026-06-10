import Link from "next/link";
import { CountUp } from "./CountUp";
import { RecoveryReceipt } from "./RecoveryReceipt";
import { titleCaseName } from "@/lib/utils/title-case";

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
  /**
   * The single highest-value at-risk quote (same pick the DO THIS TODAY alert
   * uses). Optional so existing render tests work unchanged. When present, the
   * TODAY strip names the move; the big action button stays in the alert
   * below — one primary action per screen.
   */
  priorityClientName?: string | null;
  priorityQuoteId?: string | null;
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
  priorityClientName = null,
  priorityQuoteId = null,
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

  // TODAY / NEXT MOVE — the system-state line that answers "is the app
  // already working, and do I need to do anything right now?" in one read.
  // Honest states only: we never invent a send time the dashboard can't know.
  const showPriorityMove = Boolean(priorityClientName && priorityQuoteId);
  const showToday = pendingCount > 0;

  return (
    <section className="rounded-lg border border-line-subtle bg-surface-1 shadow-[0_26px_80px_rgba(0,0,0,0.34)]">
      <div className="grid gap-0 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="flex flex-col border-b border-line-subtle lg:border-b-0 lg:border-r">
          <div className="p-5 sm:p-7">
            <p className="text-xs font-black uppercase tracking-widest text-warning/80">
              {heading}
            </p>
            <p className="mt-4 text-6xl font-black tracking-tight text-ink-strong tabular-nums sm:text-7xl lg:text-8xl">
              <CountUp value={stillBleeding} />
            </p>
            <p className="mt-3 max-w-xl text-base leading-7 text-ink">{subtext}</p>
          </div>

          {showToday ? (
            <div
              data-testid="today-next-move"
              className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-subtle/70 bg-canvas/35 px-5 py-3.5 sm:px-7"
            >
              <span className="text-[11px] font-black uppercase tracking-widest text-brand">
                Today
              </span>
              {showPriorityMove ? (
                <>
                  <p className="min-w-0 flex-1 text-sm leading-6 text-ink">
                    Work{" "}
                    <span className="font-bold text-ink-strong">
                      {titleCaseName(priorityClientName ?? "")}
                    </span>{" "}
                    first — open the plan and send the next follow-up.
                  </p>
                  <Link
                    href={`/quotes/${priorityQuoteId}`}
                    className="whitespace-nowrap rounded text-sm font-bold text-brand hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Open the plan →
                  </Link>
                </>
              ) : (
                <>
                  <p className="min-w-0 flex-1 text-sm leading-6 text-ink">
                    Recovery is running — follow-ups are scheduled. No manual
                    move needed today.
                  </p>
                  <Link
                    href="/quotes/new"
                    className="whitespace-nowrap rounded text-sm font-bold text-brand hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Add your next quiet quote →
                  </Link>
                </>
              )}
            </div>
          ) : null}
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
