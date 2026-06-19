import type { Metadata } from "next";
import { LogoFull } from "@/components/brand/Logo";
import { AuditCalculatorClient } from "./AuditCalculatorClient";

export const metadata: Metadata = {
  title: "Free painting estimate audit - Quote Reclaim",
  description:
    "Painting estimates going quiet? Enter 3 old quote amounts and days since sent. No customer names, no phone numbers, no card.",
  robots: { index: true, follow: true },
};

/**
 * /audit - the cold paid-traffic landing page.
 *
 * Deliberately lightweight: a static server component with one small client
 * island for the calculator. No auth, no backend client, no dashboard imports.
 * A cold visitor sees the painter-specific pain, enters three quiet estimates,
 * gets their own result before any account exists, and only then sees the
 * existing /sign-up?next=/onboarding/reveal flow with UTMs preserved.
 */
export default function AuditPage() {
  return (
    <main className="min-h-screen w-full bg-canvas px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-7 flex justify-center">
          <LogoFull />
        </header>

        <div className="space-y-4 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            For residential painting contractors
          </p>
          <h1 className="text-balance text-4xl font-black leading-[0.98] text-ink-strong sm:text-5xl">
            Painting estimates going quiet?
          </h1>
          <p className="text-pretty text-base leading-7 text-ink">
            Before buying another lead, check the estimates you already sent.
            Enter 3 old quote amounts and how long they&apos;ve been quiet.
            Quote Reclaim shows which one to reopen first and what message to
            send today.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs font-bold uppercase tracking-widest text-ink-muted sm:grid-cols-4">
            <span className="rounded-full border border-line-subtle bg-surface-1 px-3 py-2">
              No names
            </span>
            <span className="rounded-full border border-line-subtle bg-surface-1 px-3 py-2">
              No phone numbers
            </span>
            <span className="rounded-full border border-line-subtle bg-surface-1 px-3 py-2">
              No card
            </span>
            <span className="rounded-full border border-line-subtle bg-surface-1 px-3 py-2">
              60 seconds
            </span>
          </div>
        </div>

        <p className="mt-5 rounded-lg border-l-2 border-brand bg-surface-1 px-4 py-3 text-sm leading-6 text-ink">
          Drove out, measured, wrote the painting estimate, then the homeowner
          went quiet? Check the old estimates before you pay for a fresh lead.
        </p>

        <div className="mt-6">
          <p className="mb-4 text-center text-sm font-semibold text-ink">
            Use real-ish amounts. Do not enter customer names.
          </p>
          <AuditCalculatorClient />
        </div>

        <p className="mt-8 rounded-lg border border-line-subtle bg-surface-1 p-4 text-xs leading-6 text-ink-muted">
          This free audit only needs quote totals and days since sent. Nothing
          here asks for customer names, phone numbers, emails, or addresses.
        </p>

        <footer className="mt-10 text-center text-xs leading-6 text-ink-muted">
          Built for painting crews and US home-service contractors. Not a CRM.
          Not lead generation. Not scheduling software.
        </footer>
      </div>
    </main>
  );
}
