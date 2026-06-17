import type { Metadata } from "next";
import { LogoFull } from "@/components/brand/Logo";
import { AuditCalculatorClient } from "./AuditCalculatorClient";

export const metadata: Metadata = {
  title: "Free silent quote audit — Quote Reclaim",
  description:
    "You already did the work on these painting quotes. Add up what's sitting quiet, see which to follow up first, and get the message to send. No customer names. No card.",
  robots: { index: true, follow: true },
};

/**
 * /audit — the cold paid-traffic landing page (Reddit + Meta).
 *
 * Deliberately lightweight: a static server component with one small client
 * island for the calculator. No auth, no backend client, no dashboard
 * imports — a cold visitor gets the loss framing, sees an example of the
 * result, then sees their OWN number before any account exists, and only
 * after that is offered the existing /sign-up?next=/onboarding/reveal flow
 * (UTMs preserved). No navigation menu above the fold.
 */
export default function AuditPage() {
  return (
    <main className="min-h-screen w-full bg-canvas px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 flex justify-center">
          {/* Brand mark only — intentionally not a nav menu. */}
          <LogoFull />
        </header>

        <div className="space-y-3 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            For painting contractors
          </p>
          <h1 className="text-balance text-3xl font-black leading-tight text-ink-strong sm:text-4xl">
            You already did the work on these quotes. Don&apos;t let the money
            go quiet.
          </h1>
          <p className="text-pretty text-base leading-7 text-ink">
            Drove out, measured, wrote the estimate — then the homeowner went
            dark. Add up what&apos;s actually sitting there. No customer names.
            No card.
          </p>
        </div>

        {/* Pain / math line — frames the number before the form. */}
        <p className="mt-6 rounded-lg border-l-2 border-brand bg-surface-1 px-4 py-3 text-sm leading-6 text-ink">
          Out of your last 10 painting quotes, how many never replied? Multiply
          by your average job. That&apos;s the number.
        </p>

        {/* Example result — labeled Sample so it never reads as genuine proof. */}
        <section
          aria-label="Example audit result"
          className="mt-6 space-y-4 rounded-xl border border-dashed border-line-strong bg-surface-1/60 p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
              Example audit result
            </p>
            <span className="rounded-full border border-line-subtle px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-muted">
              Sample
            </span>
          </div>

          <p className="text-2xl font-black leading-none text-ink-strong">
            <span className="tabular-nums text-money">$8,200</span> sitting in 3
            quiet quotes
          </p>

          <div className="rounded-lg border border-line-subtle bg-surface-2 p-3">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Best first follow-up
            </p>
            <p className="mt-1 text-sm font-bold text-ink-strong">
              Quote #2 · <span className="tabular-nums">$3,800</span> · 21 days
              since last reply
            </p>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              <span className="font-semibold text-ink">Why this quote first:</span>{" "}
              High value and still recent enough to follow up without sounding
              desperate.
            </p>
          </div>

          <div className="rounded-lg border border-line-subtle bg-surface-2 p-3">
            <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
              Message preview
            </p>
            <p className="mt-1 text-sm leading-6 text-ink-strong">
              &ldquo;Are you still thinking about moving forward, or should I
              close this out for now?&rdquo;
            </p>
          </div>
        </section>

        {/* The real thing — their numbers. */}
        <div className="mt-8">
          <p className="mb-4 text-center text-sm font-semibold text-ink">
            Now run it on your own quiet quotes ↓
          </p>
          <AuditCalculatorClient />
        </div>

        {/* Privacy reassurance — after the form, before the FAQ. */}
        <p className="mt-8 rounded-lg border border-line-subtle bg-surface-1 p-4 text-xs leading-6 text-ink-muted">
          You typed quote totals, not customer info. Nothing here is shared,
          sold, or used for anything except your audit.
        </p>

        {/* FAQ — native details/summary, zero JS, fully keyboard accessible. */}
        <section aria-label="Frequently asked questions" className="mt-8 space-y-2">
          <FaqItem question="Is this a CRM?">
            No. Quote Reclaim is a focused audit and follow-up tool for old
            estimates. It does not replace your CRM or job software.
          </FaqItem>
          <FaqItem question="Do I need customer names?">
            Not for this audit. Use quote amounts and timing only.
          </FaqItem>
          <FaqItem question="What does it cost?">
            Your first 3 quotes are free. No card. If it helps, the full plan is
            $79/month.
          </FaqItem>
        </section>

        <footer className="mt-10 text-center text-xs leading-6 text-ink-muted">
          Built for US home-service contractors. Not a CRM. Not lead
          generation. Not debt collection.
        </footer>
      </div>
    </main>
  );
}

function FaqItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-line-subtle bg-surface-1 p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-ink-strong marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        {question}
      </summary>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{children}</p>
    </details>
  );
}
