import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { requireUser } from "@/lib/auth/require-user";
import { getProfileStats, listPendingQuotes } from "@/lib/quotes/repo";
import { RevealClient } from "@/app/(app)/onboarding/reveal/RevealClient";
import { FREE_PLAN_LIMIT } from "@/lib/payments/entitlement";
import { SUPPORT_EMAIL } from "@/lib/payments/disabled-provider";
import { paddleClientConfigured } from "@/lib/payments/paddle-provider";
import { PaddleCheckoutButton } from "@/components/billing/PaddleCheckoutButton";

export const metadata: Metadata = {
  title: "Paste more quotes — Quote Reclaim",
  description:
    "Audit and import another batch of silent estimates. Same parser, same ranking, same 5-message recovery plan.",
};

export const dynamic = "force-dynamic";

/**
 * Reusable bulk import — the contractor's permanent "paste more quotes" door.
 *
 * Reuses the Silent Money Reveal client end-to-end (parser, ranking, preview,
 * audit transition, import action) so there is one canonical paste-many flow
 * and zero duplicated logic. The page wrapper differs from /onboarding/reveal
 * in two places only: it shows a returning-user banner instead of onboarding
 * framing, and it surfaces the honest block screen when the free allowance
 * is exhausted (billing is offline, so support email is the activation path).
 */
export default async function QuotesImportPage() {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) {
    redirect("/sign-up?next=/quotes/import");
  }

  const [profile, pending] = await Promise.all([
    getProfileStats(supabase, user.id),
    listPendingQuotes(supabase, user.id),
  ]);
  const usage = profile?.usage_count ?? 0;
  const isPaid = Boolean(profile?.is_paid);
  const pendingCount = pending.length;
  const freeRemaining = isPaid
    ? Number.POSITIVE_INFINITY
    : Math.max(0, FREE_PLAN_LIMIT - usage);

  // Free plan exhausted — the import flow has no slots left to land. Show an
  // honest activation screen instead of a scan that can save nothing. The
  // dashboard and queue are still reachable; this only blocks the import
  // surface itself.
  if (!isPaid && freeRemaining === 0) {
    return (
      <ImportBlocked
        paddleAvailable={paddleClientConfigured()}
        userId={user.id}
        userEmail={user.email ?? null}
      />
    );
  }

  return (
    <RevealClient
      isPaid={isPaid}
      usageCount={usage}
      pendingCount={pendingCount}
    />
  );
}

function ImportBlocked({
  paddleAvailable,
  userId,
  userEmail,
}: {
  paddleAvailable: boolean;
  userId: string;
  userEmail: string | null;
}) {
  const canCheckout = paddleAvailable && Boolean(userId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 bg-canvas px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between border-b border-line-subtle/80 pb-5">
        <Logo showWordmark />
        <Link
          href="/dashboard"
          className="rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Back to dashboard
        </Link>
      </header>

      <section
        data-testid="import-blocked"
        className="rounded-xl border border-brand/40 bg-surface-1 p-6 shadow-[0_0_60px_rgba(217,111,50,0.16)] sm:p-8"
      >
        <p className="text-xs font-black uppercase tracking-widest text-brand">
          Free plan full
        </p>
        <h1 className="mt-3 text-balance text-3xl font-black leading-tight text-ink-strong sm:text-4xl">
          Your first 3 free quotes are already in recovery.
        </h1>

        {canCheckout ? (
          // Paddle is live — offer real self-serve checkout, not a support
          // email. Locked copy: price, free-quote framing, cancel-anytime.
          <>
            <p className="mt-3 max-w-xl text-base leading-7 text-ink">
              Activate Quote Reclaim Pro to import and recover the rest of your
              silent estimates. $49/month. First 3 quotes are free. Cancel
              anytime. Your existing recovery sequences keep running either way.
            </p>
            <div className="mt-6">
              <PaddleCheckoutButton
                userId={userId}
                userEmail={userEmail}
                label="Activate Quote Reclaim Pro — $49/month"
                size="lg"
              />
            </div>
            <div className="mt-4">
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-ink-muted hover:text-ink-strong"
              >
                Back to your recovery queue →
              </Link>
            </div>
          </>
        ) : (
          // Paddle not configured for this deployment — honest support path.
          <>
            <p className="mt-3 max-w-xl text-base leading-7 text-ink">
              Billing is being updated. Email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Activate%20more%20quotes`}
                className="font-semibold text-brand hover:text-ink-strong"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              to activate more quotes — we&apos;ll get you running on the full
              paid plan. Your existing recovery sequences keep running in the
              meantime.
            </p>

            <ul className="mt-6 grid gap-2 text-sm leading-6 text-ink">
              <li className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                Tell us how many quotes you want to import next and we can prep
                the account for that volume.
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                We respond within 1–2 business days. No card needed to start the
                activation conversation.
              </li>
            </ul>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`mailto:${SUPPORT_EMAIL}?subject=Activate%20more%20quotes`}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-brand bg-brand px-4 py-3 text-sm font-semibold text-canvas shadow-[0_0_36px_rgba(217,111,50,0.28)]"
              >
                Email {SUPPORT_EMAIL}
              </Link>
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-ink-muted hover:text-ink-strong"
              >
                Back to your recovery queue →
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
