import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/app/AppHeader";
import { requireUser } from "@/lib/auth/require-user";
import { MONTHLY_PRICE_USD } from "@/lib/payments/entitlement";
import { getRecoveryReportData } from "@/lib/recovery/recovery-report";
import { formatCurrency } from "@/lib/utils/currency";
import { recordAuditEvent } from "@/lib/audit-events";
import { tradeLabel } from "@/lib/quotes/quote-display";

export const metadata: Metadata = {
  title: "Recovery Report - Quote Reclaim",
};
export const dynamic = "force-dynamic";

export default async function RecoveryReportPage() {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) redirect("/sign-in");

  const report = await getRecoveryReportData(supabase, user.id);
  await recordAuditEvent(supabase, {
    userId: user.id,
    type: "recovery_report_viewed",
    meta: { month: report.monthLabel },
  });
  const subscriptionMultiple =
    report.estimatedRecoveredThisMonth > 0
      ? report.estimatedRecoveredThisMonth / MONTHLY_PRICE_USD
      : null;

  return (
    <main className="min-h-screen bg-canvas px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <AppHeader />

        <section className="py-12 sm:py-16">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Recovery Report
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight text-ink-strong sm:text-5xl">
            {report.monthLabel} Recovery Report
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
            This report counts quiet estimates that booked after a follow-up
            was sent. It is attribution help, not a guarantee.
          </p>
        </section>

        <section aria-label="Recovery funnel" className="rounded-2xl border border-line-subtle bg-white p-5 shadow-premium sm:p-7">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">
            <Metric label="Follow-ups sent" value={String(report.followupsSentThisMonth)} />
            <ArrowRight className="hidden h-5 w-5 text-ink-muted md:block" aria-hidden="true" />
            <Metric label="Replies received" value={String(report.repliesReceivedThisMonth)} />
            <ArrowRight className="hidden h-5 w-5 text-ink-muted md:block" aria-hidden="true" />
            <Metric label="Jobs booked" value={String(report.jobsBookedThisMonth)} />
            <ArrowRight className="hidden h-5 w-5 text-ink-muted md:block" aria-hidden="true" />
            <Metric label="Recovered revenue" value={formatCurrency(report.estimatedRecoveredThisMonth)} />
          </div>
        </section>

        {subscriptionMultiple != null ? (
          <section
            data-testid="recovery-subscription-value"
            className="mt-6 rounded-2xl border border-success/25 bg-success/5 p-6"
          >
            <p className="text-xs font-black uppercase tracking-widest text-success">
              Tracked value
            </p>
            <p className="mt-2 text-xl font-black text-ink-strong">
              This month&apos;s tracked recovered revenue:{" "}
              {formatCurrency(report.estimatedRecoveredThisMonth)}. That&apos;s{" "}
              {subscriptionMultiple.toFixed(1)}x your $79 subscription.
            </p>
          </section>
        ) : null}

        <div className="grid gap-8 py-8 lg:grid-cols-2">
          <section aria-labelledby="next-priority-title" className="rounded-2xl border border-line-subtle bg-white p-6 shadow-premium">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Next week&apos;s #1 priority
            </p>
            <h2
              id="next-priority-title"
              className="mt-2 text-2xl font-black text-ink-strong"
            >
              {report.nextPriority
                ? `${report.nextPriority.clientLabel} · ${formatCurrency(report.nextPriority.amount)}`
                : "No eligible quote needs a reset."}
            </h2>
            {report.nextPriority ? (
              <>
                <p className="mt-3 text-sm leading-6 text-ink-muted">
                  {report.nextPriority.daysQuiet} days quiet ·{" "}
                  {report.nextPriority.recoveryWindowLabel}
                </p>
                <Link
                  href={`/quotes/${report.nextPriority.id}`}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-brand bg-brand px-4 py-2 text-sm font-bold text-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  Open recovery plan
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-ink-muted">
                Add a quiet estimate or wait until an existing quote is ready
                for another move.
              </p>
            )}
          </section>

          <section aria-labelledby="message-performance-title" className="rounded-2xl border border-line-subtle bg-white p-6 shadow-premium">
            <div className="flex items-center gap-2 text-money">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
              <p className="text-xs font-black uppercase tracking-widest">
                Messages that worked
              </p>
            </div>
            <h2
              id="message-performance-title"
              className="mt-2 text-2xl font-black text-ink-strong"
            >
              {report.messagePerformanceReady
                ? "Reply rate by message family"
                : "Messages that worked"}
            </h2>
            {report.messagePerformanceReady ? (
              <ol className="mt-4 divide-y divide-line-subtle border-y border-line-subtle">
                {report.messagePerformance.map((row) => (
                  <li key={row.family} className="flex items-center justify-between gap-4 py-3">
                    <span className="text-sm font-bold text-ink-strong">{row.family}</span>
                    <span className="text-sm tabular-nums text-ink-muted">
                      {Math.round(row.replyRate * 100)}% · {row.replies}/{row.opened}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm leading-6 text-ink-muted">
                Not enough data yet — keep working your quotes. This fills in as you go.
              </p>
            )}
          </section>
        </div>

        <section className="grid gap-6 py-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-line-subtle bg-white p-6 shadow-premium">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Top recovered trade
            </p>
            <p className="mt-2 text-2xl font-black text-ink-strong">
              {report.topRecoveredTrade
                ? tradeLabel(report.topRecoveredTrade)
                : "Not enough data yet"}
            </p>
          </div>
          <div className="rounded-2xl border border-line-subtle bg-white p-6 shadow-premium">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Quotes still at risk
            </p>
            {report.atRiskQuotes.length > 0 ? (
              <ul className="mt-3 divide-y divide-line-subtle border-y border-line-subtle">
                {report.atRiskQuotes.slice(0, 5).map((quote) => (
                  <li key={quote.id} className="flex items-center justify-between gap-3 py-3">
                    <Link className="font-bold text-ink-strong" href={`/quotes/${quote.id}`}>
                      {quote.clientName}
                    </Link>
                    <span className="text-sm text-ink-muted">
                      {formatCurrency(quote.amount)} · {quote.daysQuiet} days quiet
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                Not enough data yet — keep working your quotes. This fills in as you go.
              </p>
            )}
          </div>
        </section>

        <p className="flex items-start gap-2 border-t border-line-subtle py-6 text-xs leading-5 text-ink-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Recovered revenue is tracked, estimated attribution. It does not
          claim Quote Reclaim caused the job.
        </p>
        <Link
          href="/dashboard?focus=today"
          className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-black text-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Keep the streak going
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className="mt-2 break-words text-2xl font-black tabular-nums text-ink-strong">
        {value}
      </p>
    </div>
  );
}
