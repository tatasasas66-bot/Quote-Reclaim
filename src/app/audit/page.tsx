import type { Metadata } from "next";
import { LogoFull } from "@/components/brand/Logo";
import { AuditCalculatorClient } from "./AuditCalculatorClient";

export const metadata: Metadata = {
  title: "Free silent quote audit — Quote Reclaim",
  description:
    "Paste 3 old painting quote amounts and see your silent quote value, which to follow up first, and the message to send. No customer names needed. No card.",
  robots: { index: true, follow: true },
};

/**
 * /audit — the cold paid-traffic landing page (Reddit + Meta).
 *
 * Deliberately lightweight: a static server component with one small client
 * island for the calculator. No auth, no backend client, no dashboard
 * imports — a cold visitor sees their number before any account exists, then
 * routes into the existing /sign-up?next=/onboarding/reveal flow (UTMs
 * preserved) only after the value is on screen. No navigation menu above the
 * fold.
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
          <h1 className="text-balance text-3xl font-black leading-tight text-ink-strong sm:text-4xl">
            See what your silent painting quotes are worth.
          </h1>
          <p className="text-pretty text-base leading-7 text-ink">
            Paste 3 old quote amounts. No customer names needed for the audit.
            No card.
          </p>
        </div>

        <div className="mt-8">
          <AuditCalculatorClient />
        </div>

        <footer className="mt-10 text-center text-xs leading-6 text-ink-muted">
          Built for US home-service contractors. Not a CRM. Not lead
          generation. Not debt collection.
        </footer>
      </div>
    </main>
  );
}
