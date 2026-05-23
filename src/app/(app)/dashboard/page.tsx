import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui";
import { QuoteListItem } from "@/components/quotes";
import { HeroMetric } from "@/components/dashboard/HeroMetric";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { RecoveryWindowAlert } from "@/components/dashboard/RecoveryWindowAlert";
import { IntelligencePanel } from "@/components/intelligence/IntelligencePanel";
import { requireUser } from "@/lib/auth/require-user";
import {
  listPendingQuotes,
  listWonQuotes,
  getProfileStats,
  type QuoteRow,
} from "@/lib/quotes/repo";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";
import { formatCurrency } from "@/lib/utils/currency";

export const metadata: Metadata = { title: "Dashboard – Quote Reclaim" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) redirect("/sign-in");

  const [pending, wonQuotes, profile] = await Promise.all([
    listPendingQuotes(supabase, user.id),
    listWonQuotes(supabase, user.id),
    getProfileStats(supabase, user.id),
  ]);

  const jobsWonLifetime = profile?.jobs_won ?? 0;
  const allTimeRecovered = profile?.recovered_amount ?? 0;

  const stillBleeding = pending.reduce(
    (sum, q) => sum + Number(q.estimate_amount ?? 0),
    0,
  );
  const stillBleedingValue = stillBleeding.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const monthStart = monthStartUtc();
  const monthWon = wonQuotes.filter((q) => Date.parse(q.won_at) >= monthStart);
  const recoveredThisMonth = monthWon.reduce(
    (sum, q) => sum + q.estimate_amount,
    0,
  );
  const jobsWonThisMonth = monthWon.length;

  const avgDaysToWin = computeAvgDaysToWin(wonQuotes);
  const atRiskCount = pending.filter((q) => effectiveDaysSilent(q) >= 7).length;
  const coldest = pending.reduce<QuoteRow | null>((best, q) => {
    if (!best) return q;
    return effectiveDaysSilent(q) > effectiveDaysSilent(best) ? q : best;
  }, null);
  const priorityQuote = pickPriorityQuote(pending);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          QUOTE RECLAIM
        </p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold leading-tight text-ink-strong">
              Recovery Dashboard
            </h1>
            <p className="mt-1 text-base text-ink">
              Quotes you sent. Money waiting to come back.
            </p>
          </div>
          <form action="/api/auth/sign-out" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <HeroMetric
        stillBleeding={stillBleeding}
        pendingCount={pending.length}
        recoveredThisMonth={recoveredThisMonth}
        jobsWonThisMonth={jobsWonThisMonth}
        allTimeRecovered={allTimeRecovered}
      />

      {priorityQuote ? (
        <RecoveryWindowAlert
          quoteId={priorityQuote.id}
          amount={Number(priorityQuote.estimate_amount)}
          trade={priorityQuote.trade}
          clientName={priorityQuote.client_name}
          city={priorityQuote.city}
          state={priorityQuote.state}
          daysSilent={effectiveDaysSilent(priorityQuote)}
        />
      ) : null}

      <MetricCards
        coldestDays={coldest ? effectiveDaysSilent(coldest) : null}
        coldestTrade={coldest?.trade ?? null}
        atRiskCount={atRiskCount}
        jobsWonLifetime={jobsWonLifetime}
        avgDaysToWin={avgDaysToWin}
      />

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
                IN THE QUEUE
              </p>
              <p className="text-sm text-ink">
                {pending.length === 0
                  ? "All caught up."
                  : `${stillBleedingValue} sitting silent`}
              </p>
            </div>
            <Link href="/quotes/new">
              <Button size="sm">+ Add Silent Quote</Button>
            </Link>
          </div>

          {pending.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-subtle bg-surface-2 px-6 py-10 text-center">
              <p className="font-medium text-ink">
                {jobsWonLifetime > 0
                  ? "All caught up. Add a quote when the next one goes quiet."
                  : "No silent quotes tracked yet."}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {jobsWonLifetime > 0
                  ? `${jobsWonLifetime} quote${jobsWonLifetime === 1 ? "" : "s"} won back · ${formatCurrency(allTimeRecovered)} recovered so far.`
                  : "Add one quote and see what revenue is sitting quiet."}
              </p>
              <Link href="/quotes/new" className="mt-4 inline-block">
                <Button size="sm">+ Add Silent Quote</Button>
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line-subtle bg-surface-2">
              {pending.map((q) => (
                <QuoteListItem key={q.id} quote={q} />
              ))}
            </ul>
          )}
        </section>

        <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <IntelligencePanel
            totalSequences={pending.length + jobsWonLifetime}
            unlockAt={5}
          />
        </aside>
      </div>
    </main>
  );
}

function monthStartUtc(): number {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function computeAvgDaysToWin(
  won: Array<{ won_at: string; created_at: string }>,
): number | null {
  if (won.length === 0) return null;
  const totalDays = won.reduce((sum, q) => {
    const start = Date.parse(q.created_at);
    const end = Date.parse(q.won_at);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return sum;
    return sum + (end - start) / (1000 * 60 * 60 * 24);
  }, 0);
  return Math.round(totalDays / won.length);
}

function pickPriorityQuote(quotes: QuoteRow[]): QuoteRow | null {
  let best: QuoteRow | null = null;
  for (const q of quotes) {
    if (effectiveDaysSilent(q) < 7) continue;
    if (!best || Number(q.estimate_amount) > Number(best.estimate_amount)) {
      best = q;
    }
  }
  return best;
}
