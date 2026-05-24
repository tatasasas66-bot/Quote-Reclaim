import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { QuoteForm } from "@/components/quotes";
import { Paywall } from "@/components/billing";
import { requireUser } from "@/lib/auth/require-user";
import { createQuoteAction } from "@/lib/quotes/actions";
import { getProfileStats, listPendingQuotes } from "@/lib/quotes/repo";
import { FREE_PLAN_LIMIT } from "@/lib/payments/lemonsqueezy";
import { formatCurrency } from "@/lib/utils/currency";

export const metadata: Metadata = { title: "New quote - Quote Reclaim" };
export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) redirect("/sign-in");

  const [profile, pending] = await Promise.all([
    getProfileStats(supabase, user.id),
    listPendingQuotes(supabase, user.id),
  ]);
  const usage = profile?.usage_count ?? 0;
  const isPaid = profile?.is_paid ?? false;
  const blocked = !isPaid && usage >= FREE_PLAN_LIMIT;
  const silentValue = pending.reduce(
    (sum, q) => sum + Number(q.estimate_amount),
    0,
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 bg-canvas px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between border-b border-line-subtle/80 pb-5">
        <Logo showWordmark />
        <Link
          href="/dashboard"
          className="rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Back
        </Link>
      </header>

      {blocked ? (
        <Paywall silentQuoteValue={silentValue} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <section className="space-y-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                Recovery Intake
              </p>
              <h1 className="mt-2 text-4xl font-black leading-tight text-ink-strong">
                Add a silent quote
              </h1>
              <p className="mt-3 text-base leading-7 text-ink-muted">
                Turn one quiet estimate into a 3-step recovery plan in under a
                minute.
              </p>
            </div>

            <div className="rounded-lg border border-line-subtle bg-surface-1 p-5">
              <p className="text-xs font-black uppercase tracking-widest text-money">
                Already sitting quiet
              </p>
              <p className="mt-2 text-4xl font-black text-ink-strong tabular-nums">
                {formatCurrency(silentValue)}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                New files join the command queue with a Recovery Priority and
                Next Best Action.
              </p>
            </div>
          </section>

          <QuoteForm mode="create" action={createQuoteAction} />
        </div>
      )}
    </main>
  );
}
