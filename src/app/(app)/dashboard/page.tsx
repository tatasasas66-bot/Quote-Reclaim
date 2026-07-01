import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui";
import { LogoFull } from "@/components/brand/Logo";
import { UpgradeButton } from "@/components/billing";
import { QuoteListItem } from "@/components/quotes";
import { FirstRecoveryCommand } from "@/components/dashboard/FirstRecoveryCommand";
import { PaidForItselfMeter } from "@/components/dashboard/PaidForItselfMeter";
import { HeroMetric } from "@/components/dashboard/HeroMetric";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { RecoveryWindowAlert } from "@/components/dashboard/RecoveryWindowAlert";
import { WonJobsGallery } from "@/components/dashboard/WonJobsGallery";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { SundayNightReset } from "@/components/dashboard/SundayNightReset";
import { TodaysMoves } from "@/components/dashboard/TodaysMoves";
import { ReplyCheckPrompt } from "@/components/dashboard/ReplyCheckPrompt";
import { PwaInstallHint } from "@/components/dashboard/PwaInstallHint";
import { IntelligencePanel } from "@/components/intelligence/IntelligencePanel";
import { requireUser } from "@/lib/auth/require-user";
import {
  listPendingQuotes,
  listWonQuotes,
  getProfileStats,
  getMonthlyRecoveryActivity,
  listPendingReminders,
  type QuoteRow,
} from "@/lib/quotes/repo";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";
import { tradeLabel } from "@/lib/quotes/quote-display";
import { getRecoveryScore } from "@/lib/quotes/recovery-score";
import { FREE_PLAN_LIMIT } from "@/lib/payments/entitlement";
import { paddleClientConfigured } from "@/lib/payments/paddle-provider";
import { formatCurrency } from "@/lib/utils/currency";
import { listAuditEvents } from "@/lib/audit-events";
import {
  calculateRecoveryStreak,
  selectReplyChecks,
  selectTodaysMoves,
} from "@/lib/recovery/daily-loop";
import {
  ONE_TAP_CHOICES,
} from "@/lib/quotes/one-tap-choices";

export const metadata: Metadata = { title: "Dashboard – Quote Reclaim" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) redirect("/sign-in");

  const monthStartMs = monthStartUtc();
  const nextMonthStartMs = nextMonthStartUtc();

  const [pending, wonQuotes, profile, monthlyActivity, reminders, auditEvents] =
    await Promise.all([
    listPendingQuotes(supabase, user.id),
    listWonQuotes(supabase, user.id),
    getProfileStats(supabase, user.id),
    getMonthlyRecoveryActivity(
      supabase,
      user.id,
      new Date(monthStartMs).toISOString(),
      new Date(nextMonthStartMs).toISOString(),
    ),
    listPendingReminders(supabase, user.id),
    listAuditEvents(supabase, user.id),
  ]);

  const quoteIds = pending.map((quote) => quote.id);
  const oneTapResult =
    quoteIds.length > 0
      ? await supabase
          .from("one_tap_replies")
          .select("quote_id,answer_type,question_text,created_at")
          .in("quote_id", quoteIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
  const oneTapByQuote = new Map<string, string>();
  for (const reply of oneTapResult.data ?? []) {
    const quoteId = String(reply.quote_id);
    if (oneTapByQuote.has(quoteId)) continue;
    const choice = ONE_TAP_CHOICES.find(
      (option) =>
        option.answerType === reply.answer_type &&
        (option.answerType !== "question" ||
          option.questionText === reply.question_text),
    );
    if (choice) oneTapByQuote.set(quoteId, choice.label);
  }
  const todaysMoves = selectTodaysMoves({ quotes: pending, reminders });
  const streak = calculateRecoveryStreak(auditEvents);
  const replyChecks = new Map(
    selectReplyChecks(auditEvents).map((check) => [check.quoteId, check]),
  );

  // Silent Money Reveal — first-run flow. New users (no quotes yet AND
  // onboarding_done flag still false) get the bulk-import reveal so their
  // first dashboard view is alive with real numbers, not zeros. Existing
  // users (any pending quotes OR onboarding_done already true) skip past.
  if (!profile?.onboarding_done && pending.length === 0) {
    redirect("/onboarding/reveal");
  }

  const jobsWonLifetime = profile?.jobs_won ?? 0;
  const allTimeRecovered = profile?.recovered_amount ?? 0;

  const stillBleeding = pending.reduce(
    (sum, q) => sum + Number(q.estimate_amount ?? 0),
    0,
  );
  const stillBleedingValue = formatCurrency(stillBleeding);

  const monthWon = wonQuotes.filter(
    (q) => Date.parse(q.won_at) >= monthStartMs,
  );
  const recoveredThisMonth = monthWon.reduce(
    (sum, q) => sum + q.estimate_amount,
    0,
  );
  const jobsWonThisMonth = monthWon.length;
  const wonTotal = wonQuotes.reduce((sum, q) => sum + q.estimate_amount, 0);

  const avgDaysToWin = computeAvgDaysToWin(wonQuotes);
  const atRiskCount = pending.filter((q) => effectiveDaysSilent(q) >= 7).length;
  const coldest = pending.reduce<QuoteRow | null>((best, q) => {
    if (!best) return q;
    return effectiveDaysSilent(q) > effectiveDaysSilent(best) ? q : best;
  }, null);
  const priorityQuote = pickPriorityQuote(pending);

  // First-run / empty-queue command panel. An empty queue is the dead zone we
  // are killing: instead of a passive "nothing here" box, the contractor gets
  // one dominant first mission (Silent Money Reveal) with manual add secondary.
  // Brand-new users with no quotes are already redirected to /onboarding/reveal
  // above, so this panel is for people who skipped the reveal, imported nothing,
  // or cleared their queue — exactly the users who otherwise stall.
  const isPaid = profile?.is_paid ?? false;
  const usageCount = profile?.usage_count ?? 0;
  const freeRemaining = isPaid
    ? Number.POSITIVE_INFINITY
    : Math.max(0, FREE_PLAN_LIMIT - usageCount);
  const hasRecoveredBefore = jobsWonLifetime > 0 || allTimeRecovered > 0;
  const showFirstRecoveryCommand = pending.length === 0;
  const hasPendingQuotes = pending.length !== 0;

  // Paid-For-Itself Meter — biggest pending quote drives the months-covered
  // anchor. Real data only; the component renders nothing when the queue is
  // empty or the biggest quote is too small for the math to mean anything.
  const biggestPending = pending.reduce<QuoteRow | null>((best, q) => {
    if (!best) return q;
    return Number(q.estimate_amount) > Number(best.estimate_amount) ? q : best;
  }, null);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 bg-canvas px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-8 lg:px-8">
      <PwaInstallHint />
      <header
        data-testid="dashboard-top-header"
        className="flex min-w-0 flex-col gap-3 border-b border-line-subtle/80 pb-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="whitespace-nowrap">
          <LogoFull />
          <span className="sr-only">QUOTE RECLAIM</span>
        </div>
        <div
          data-testid="dashboard-header-actions"
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 sm:w-auto sm:justify-end"
        >
          <UpgradeButton
            userId={user.id}
            userEmail={user.email ?? null}
            isPaid={isPaid}
            paddleAvailable={paddleClientConfigured()}
          />
          <Link
            href="/recovery-report"
            className="whitespace-nowrap rounded text-xs font-medium text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Report
          </Link>
          <form action="/api/auth/sign-out" method="post">
            <button
              type="submit"
              className="whitespace-nowrap rounded text-xs font-medium text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <TodaysMoves moves={todaysMoves} streak={streak} />
      <section id="silent-quote-command" className="scroll-mt-4">
        <h1 className="text-3xl font-black leading-tight text-ink-strong sm:text-4xl">
          Silent Quote Command
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-ink">
          Every quiet estimate has a dollar value, a risk level, and a next
          move. Your queue is ranked by dollars, risk, age, and next move.
        </p>
      </section>

      {showFirstRecoveryCommand ? (
        <FirstRecoveryCommand
          isPaid={isPaid}
          freeRemaining={freeRemaining}
          hasRecoveredBefore={hasRecoveredBefore}
          onboardingDone={Boolean(profile?.onboarding_done)}
        />
      ) : null}

      {priorityQuote ? (
        <RecoveryWindowAlert
          quoteId={priorityQuote.id}
          amount={Number(priorityQuote.estimate_amount)}
          trade={priorityQuote.trade}
          clientName={priorityQuote.client_name}
          daysSilent={effectiveDaysSilent(priorityQuote)}
          score={getRecoveryScore(priorityQuote).score}
        />
      ) : null}

      <HeroMetric
        stillBleeding={stillBleeding}
        pendingCount={pending.length}
        atRiskCount={atRiskCount}
        recoveredThisMonth={recoveredThisMonth}
        jobsWonThisMonth={jobsWonThisMonth}
        // "Quotes being worked" reads as a live count, so use the active
        // pending total — never a calendar-month counter that could show 0
        // on day 1 of a month while real recoveries are still in flight.
        quotesBeingWorked={pending.length}
        emailFollowupsSent={monthlyActivity.emailFollowupsSent}
        allTimeRecovered={allTimeRecovered}
        priorityClientName={priorityQuote?.client_name ?? null}
        priorityQuoteId={priorityQuote?.id ?? null}
      />

      {hasPendingQuotes ? (
        <Link
          href="/crew-gap"
          data-testid="crew-gap-dashboard-entry"
          className="group flex flex-col gap-3 rounded-2xl border border-line-subtle bg-white p-5 shadow-premium transition-all hover:border-brand/40 hover:shadow-premium-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Crew Gap Rescue
            </p>
            <p className="mt-1 text-sm leading-6 text-ink">
              Have an open crew day? Find the quiet quote most likely to fill
              it before buying another lead.
            </p>
          </div>
          <span className="whitespace-nowrap text-sm font-bold text-ink-muted group-hover:text-ink-strong">
            Run Crew Gap Rescue -&gt;
          </span>
        </Link>
      ) : null}

      <MetricCards
        coldestDays={coldest ? effectiveDaysSilent(coldest) : null}
        coldestTrade={coldest?.trade ? tradeLabel(coldest.trade) : null}
        atRiskCount={atRiskCount}
        jobsWonLifetime={jobsWonLifetime}
        avgDaysToWin={avgDaysToWin}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.85fr)]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
                IN THE QUEUE
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {pending.length === 0
                  ? "All caught up."
                  : `${stillBleedingValue} across ${pending.length} quote${pending.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {/* Desktop-only action cluster — anchors the queue section header.
                On mobile the sticky bottom CTA below is the single source for
                "+ Add Silent Quote" so we never render two competing buttons.
                Bulk import sits as a secondary text link beside Add so the
                primary action stays dominant — but a contractor with 20 more
                old estimates always has the door right where they expect it. */}
            <div className="hidden items-center gap-3 sm:flex">
              <Link
                href="/quotes/import"
                data-testid="queue-bulk-import-link"
                className="rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Paste more quotes →
              </Link>
              <Link
                href="/quotes/new?voice=1"
                className="rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                🎙 Add by voice
              </Link>
              <Link href="/quotes/new">
                <Button size="sm">+ Add Silent Quote</Button>
              </Link>
            </div>
          </div>

          {pending.length === 0 ? (
            // Slim, secondary hint — the First Recovery Command panel above is
            // the single focal point on an empty dashboard, so this stays quiet
            // and just explains what will land here.
            <div className="rounded-2xl border border-dashed border-line-strong bg-white px-6 py-8 shadow-premium">
              <p className="text-sm leading-6 text-ink-muted">
                No quiet quotes yet. Add your first — amount and days quiet —
                and we&apos;ll tell you what to text today.
              </p>
              <Link
                href="/quotes/new"
                className="mt-4 inline-flex min-h-11 items-center rounded-[10px] bg-brand px-4 py-2 text-sm font-bold text-white shadow-premium focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Add Silent Quote →
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3">
              {pending.map((q) => (
                <QuoteListItem
                  key={q.id}
                  quote={q}
                  oneTapLabel={oneTapByQuote.get(q.id) ?? null}
                  replyPrompt={
                    replyChecks.has(q.id) ? (
                      <ReplyCheckPrompt
                        quoteId={q.id}
                        clientName={q.client_name}
                        reaskCount={replyChecks.get(q.id)!.reaskCount}
                      />
                    ) : null
                  }
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-8 lg:self-start">
          {/* Actual-win proof chip — green is reserved for real recovered
              money. Compact so it never competes with the next action, but
              no longer buried below the fold under a long queue. */}
          {wonTotal > 0 ? (
            <Link
              href="#recent-quotes"
              data-testid="won-proof-chip"
              className="group flex items-center justify-between gap-3 rounded-2xl border border-success/25 bg-white px-5 py-4 shadow-premium focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-success">
                  Jobs won back
                </p>
                <p className="mt-1 whitespace-nowrap text-xl font-black tabular-nums text-success">
                  {formatCurrency(wonTotal)}
                </p>
              </div>
              <span className="whitespace-nowrap text-sm font-bold text-ink-muted group-hover:text-ink-strong">
                {wonQuotes.length} job{wonQuotes.length === 1 ? "" : "s"} →
              </span>
            </Link>
          ) : null}
          {biggestPending ? (
            <PaidForItselfMeter
              biggestQuoteName={biggestPending.client_name}
              biggestQuoteAmount={Number(biggestPending.estimate_amount)}
              queueTotal={stillBleeding}
              pendingCount={pending.length}
            />
          ) : null}
          <IntelligencePanel
            totalSequences={pending.length + jobsWonLifetime}
            unlockAt={5}
          />
          <SundayNightReset
            enabled={profile?.briefing_enabled !== false}
          />
          <ActivityFeed userId={user.id} />
        </aside>
      </div>

      <div id="recent-quotes" className="scroll-mt-8">
        <WonJobsGallery wonQuotes={wonQuotes} totalWon={wonTotal} />
      </div>

      {/* Mobile-only sticky CTA so the primary action stays in reach. */}
      <div className="fixed inset-x-3 bottom-3 z-30 sm:hidden">
        <Link
          href="/quotes/new"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-brand bg-brand px-4 py-3 text-sm font-semibold text-white shadow-premium active:scale-[0.99]"
        >
          + Add Silent Quote
        </Link>
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

function nextMonthStartUtc(): number {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() + 1);
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
