import type { Metadata } from "next";
import Link from "next/link";
import { LogoFull } from "@/components/brand/Logo";
import { AuditCalculatorClient } from "./AuditCalculatorClient";

export const metadata: Metadata = {
  title: "Free estimate audit for contractors - Quote Reclaim",
  description:
    "Before buying another lead, check the estimates you already sent. Enter 3 sent estimates and days quiet. No customer names, no phone numbers, no card.",
  robots: { index: true, follow: true },
};

const TRUST_CARDS = [
  {
    title: "No customer data needed",
    body: "The audit works with estimate amount and days quiet only.",
  },
  {
    title: "No signup wall",
    body: "See the result before creating an account.",
  },
  {
    title: "Not a CRM replacement",
    body: "Use it with the estimate tools you already have.",
  },
  {
    title: "Simple logic",
    body: "The page shows why one estimate is worth following up first.",
  },
] as const;

const STEPS = [
  "Enter estimate amount and days quiet.",
  "See which estimate deserves attention first.",
  "Copy the message and follow up today.",
] as const;

const ANSWERS = [
  {
    q: "Is this only for painters?",
    a: "No. Quote Reclaim is built for home-service contractors. Painters are a strong fit because they send many estimates, but the audit works for any trade where estimates go quiet.",
  },
  {
    q: "Do I need customer names?",
    a: "No. Use only estimate amount and days quiet.",
  },
  {
    q: "Do I need to sign up?",
    a: "Not to see the audit result. You only create an account if you want to save the plan and track more estimates.",
  },
  {
    q: "Does this replace my estimating app?",
    a: "No. Quote Reclaim is focused on estimate follow-up and recovery. Keep using your current tools.",
  },
  {
    q: "Will Quote Reclaim message customers for me?",
    a: "The audit gives you the message to send. You decide when and where to send it.",
  },
  {
    q: "Will this win the job every time?",
    a: "No. It is a prioritization tool. It helps you choose a smart first follow-up instead of guessing.",
  },
] as const;

/**
 * /audit is the cold-traffic value-before-signup page.
 *
 * Keep the server shell static and let the calculator be the only client
 * island. No auth, no backend clients, no billing imports, no invented proof.
 */
export default function AuditPage() {
  return (
    <main className="min-h-screen w-full max-w-[100dvw] bg-[radial-gradient(ellipse_at_top,rgba(217,111,50,0.08),transparent_42%),rgb(var(--qr-bg-canvas))] text-ink">
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-4 border-b border-line-subtle pb-5">
          <LogoFull />
          <Link
            href="/sign-in"
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-1 hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Sign in
          </Link>
        </header>

        <section className="group grid min-w-0 max-w-full gap-8 py-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:items-start lg:py-14 lg:group-has-[[data-audit-state=result]]:grid-cols-1 lg:group-has-[[data-audit-state=analyzing]]:grid-cols-1">
          <div className="min-w-0 max-w-2xl lg:group-has-[[data-audit-state=result]]:hidden lg:group-has-[[data-audit-state=analyzing]]:hidden">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Free 60-second estimate audit
            </p>
            <h1 className="mt-4 max-w-full break-words text-balance text-[2.35rem] font-black leading-[0.98] text-ink-strong sm:text-5xl lg:text-[3.35rem]">
              Before buying another lead, check the estimates you already sent.
            </h1>
            <p className="mt-6 max-w-xl break-words text-pretty text-base leading-7 text-ink sm:text-lg">
              Enter 3 estimates you already sent and how long each has been
              quiet. Quote Reclaim shows your total quiet estimate value, which
              one to follow up first, and the message to send today.
            </p>

            <div
              aria-label="Audit privacy promises"
              className="mt-6 grid max-w-full grid-cols-2 gap-2 text-[11px] font-black uppercase tracking-widest text-ink-muted sm:max-w-xl sm:grid-cols-4"
            >
              <span className="w-full min-w-0 rounded-full border border-line-subtle bg-surface-1 px-2 py-2 text-center">
                No names
              </span>
              <span className="w-full min-w-0 rounded-full border border-line-subtle bg-surface-1 px-2 py-2 text-center">
                No phone
              </span>
              <span className="w-full min-w-0 rounded-full border border-line-subtle bg-surface-1 px-2 py-2 text-center">
                No card
              </span>
              <span className="w-full min-w-0 rounded-full border border-line-subtle bg-surface-1 px-2 py-2 text-center">
                Result first
              </span>
            </div>

            <p className="mt-6 max-w-xl break-words rounded-xl border border-brand/25 bg-surface-1/75 p-4 text-sm leading-6 text-ink">
              Built for home-service contractors. Especially useful for
              estimate-heavy trades like painting, remodeling, roofing, HVAC,
              plumbing, fencing, and landscaping.
            </p>

            <div className="mt-7 grid max-w-xl min-w-0 gap-3 sm:grid-cols-3">
              {[
                "Total quiet estimate value",
                "Estimate to follow up first",
                "Message to send today",
              ].map((item) => (
                <div
                  key={item}
                  className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-4"
                >
                  <p className="break-words text-sm font-bold leading-6 text-ink-strong">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <AuditCalculatorClient />
        </section>

        <section
          aria-labelledby="audit-trust-title"
          className="border-t border-line-subtle py-10"
        >
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                Safe to try
              </p>
              <h2
                id="audit-trust-title"
                className="mt-3 text-2xl font-black text-ink-strong sm:text-3xl"
              >
                Clear enough to trust.
              </h2>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {TRUST_CARDS.map((card) => (
                <article
                  key={card.title}
                  className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-5"
                >
                  <h3 className="break-words font-bold text-ink-strong">
                    {card.title}
                  </h3>
                  <p className="mt-2 break-words text-sm leading-6 text-ink-muted">
                    {card.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="audit-steps-title"
          className="grid min-w-0 gap-6 border-t border-line-subtle py-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]"
        >
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              How it works
            </p>
            <h2
              id="audit-steps-title"
              className="mt-3 text-2xl font-black text-ink-strong sm:text-3xl"
            >
              A quick priority check, not another system to manage.
            </h2>
          </div>
          <ol className="grid min-w-0 gap-3 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step}
                className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-5"
              >
                <span className="text-xs font-black uppercase tracking-widest text-brand">
                  0{index + 1}
                </span>
                <p className="mt-3 break-words text-sm font-semibold leading-6 text-ink">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="audit-answers-title"
          className="border-t border-line-subtle py-10"
        >
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                Straight answers
              </p>
              <h2
                id="audit-answers-title"
                className="mt-3 text-2xl font-black text-ink-strong sm:text-3xl"
              >
                What contractors usually need to know first.
              </h2>
            </div>
            <div className="grid min-w-0 gap-3">
              {ANSWERS.map((item) => (
                <article
                  key={item.q}
                  className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-5"
                >
                  <h3 className="break-words font-bold text-ink-strong">
                    {item.q}
                  </h3>
                  <p className="mt-2 break-words text-sm leading-6 text-ink-muted">
                    {item.a}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line-subtle py-10">
          <div className="min-w-0 rounded-2xl border border-brand/30 bg-surface-1 p-5 sm:p-8">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Check the estimates you already sent.
            </p>
            <div className="mt-3 flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="break-words text-2xl font-black text-ink-strong sm:text-3xl">
                  No names. No phone numbers. No card. See your result first.
                </h2>
              </div>
              <a
                href="#quote-audit"
                className="inline-flex min-h-12 w-full shrink-0 items-center justify-center rounded-lg border border-brand bg-brand px-5 py-3 text-base font-semibold text-canvas shadow-[0_0_36px_rgba(217,111,50,0.24)] transition-colors hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:w-auto"
              >
                Run the audit
              </a>
            </div>
          </div>
        </section>

        <footer className="border-t border-line-subtle py-6 text-center text-xs leading-6 text-ink-muted">
          Quote Reclaim helps contractors turn sent estimates into booked work.
          Not lead generation. Not scheduling software.
        </footer>
      </div>
    </main>
  );
}
