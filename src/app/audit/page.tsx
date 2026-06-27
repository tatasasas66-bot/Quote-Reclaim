import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ClipboardCheck,
  FileText,
  Fuel,
  HardHat,
  Ruler,
  ShieldCheck,
} from "lucide-react";
import { LogoFull } from "@/components/brand/Logo";
import { AuditCalculatorClient } from "./AuditCalculatorClient";

export const metadata: Metadata = {
  title: "Silent Quote Recovery Diagnostic - Quote Reclaim",
  description:
    "Find the old quote worth texting before you buy another lead. Enter 3 quote amounts and days quiet. No customer names, phone numbers, card, or signup before the result.",
  robots: { index: true, follow: true },
};

const SUNK_COSTS = [
  { label: "Drove out", icon: Fuel },
  { label: "Measured it", icon: Ruler },
  { label: "Priced the work", icon: HardHat },
  { label: "Sent the quote", icon: FileText },
] as const;

const TRUST_ITEMS = [
  "No customer names",
  "No phone numbers",
  "No card",
  "No signup before result",
] as const;

const STEPS = [
  {
    number: "01",
    title: "Pull three quiet quotes",
    body: "Use rough amounts from the truck, sent folder, estimating app, or notebook.",
  },
  {
    number: "02",
    title: "See the first move",
    body: "The diagnostic ranks value against how long each quote has been quiet.",
  },
  {
    number: "03",
    title: "Send a clean reopen",
    body: "Copy the message, make replying easy, and stop guessing which quote to chase.",
  },
] as const;

export default function AuditPage() {
  return (
    <main className="min-h-screen w-full max-w-[100dvw] overflow-x-hidden bg-canvas text-ink">
      <header className="border-b border-line-subtle bg-surface-1/80">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            prefetch={false}
            aria-label="Quote Reclaim home"
            className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <LogoFull />
          </Link>
          <Link
            href="/sign-in"
            prefetch={false}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Already in? Sign in
          </Link>
        </div>
      </header>

      <section className="border-b border-line-subtle">
        <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-8 sm:px-6 sm:pb-14 sm:pt-14 lg:px-8 lg:pb-16">
          <div className="max-w-5xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Silent Quote Recovery Diagnostic
            </div>

            <h1 className="mt-4 max-w-5xl break-words text-balance text-[2.25rem] font-black leading-[1.02] text-ink-strong sm:mt-5 sm:text-5xl lg:text-6xl">
              Find the old quote worth texting before you buy another lead.
            </h1>

            <p className="mt-5 max-w-3xl break-words text-pretty text-base leading-7 text-ink sm:mt-6 sm:text-xl sm:leading-8">
              You already drove out, measured it, priced it, and sent the
              number. The homeowner went quiet. Before paying for another
              stranger, check the estimates you already sent and paid to
              create.
            </p>

            <p className="mt-5 max-w-4xl border-l-4 border-brand pl-4 text-lg font-black leading-7 text-ink-strong sm:mt-6 sm:text-2xl sm:leading-8">
              Buying another lead while old estimates sit untouched is an
              expensive habit.
            </p>
          </div>

          <div
            aria-label="Work already invested in a quiet quote"
            className="mt-6 grid max-w-4xl grid-cols-2 border-y border-line-subtle sm:mt-8 sm:grid-cols-4"
          >
            {SUNK_COSTS.map(({ label, icon: Icon }, index) => (
              <div
                key={label}
                className={`flex min-w-0 items-center gap-2 px-3 py-2.5 text-sm font-bold text-ink sm:py-3 ${
                  index % 2 === 0 ? "border-r border-line-subtle" : ""
                } sm:border-r sm:last:border-r-0`}
              >
                <Icon className="h-4 w-4 shrink-0 text-money" aria-hidden="true" />
                <span className="break-words">{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex max-w-5xl flex-col gap-4 sm:mt-7 sm:gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div
              aria-label="Audit privacy promises"
              className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-3 sm:flex sm:flex-wrap"
            >
              {TRUST_ITEMS.map((item) => (
                <span
                  key={item}
                  className="flex min-w-0 items-center gap-2 text-xs font-bold text-ink-muted"
                >
                  <ShieldCheck
                    className="h-4 w-4 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  <span className="break-words">{item}</span>
                </span>
              ))}
            </div>
            <a
              href="#quote-audit"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-brand/50 bg-brand/10 px-4 py-2 text-sm font-black text-brand transition hover:bg-brand/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              3 quiet quotes in. One first move out.
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section className="border-b border-line-subtle bg-surface-1/45">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <AuditCalculatorClient />
        </div>
      </section>

      <section
        aria-labelledby="why-quiet-title"
        className="border-b border-line-subtle"
      >
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-8 lg:py-16">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Quiet is not always dead
            </p>
            <h2
              id="why-quiet-title"
              className="mt-3 max-w-xl break-words text-3xl font-black leading-tight text-ink-strong sm:text-4xl"
            >
              Follow-up feels like rejection. Buying a lead feels like progress.
            </h2>
          </div>
          <div className="min-w-0 border-l border-line-strong pl-5 sm:pl-8">
            <p className="max-w-2xl text-lg leading-8 text-ink">
              That is how paid-for estimates disappear into the sent folder.
              The homeowner may be sorting out money, timing, scope, another
              bidder, or how to say no. A clean reopen is not begging. It is
              giving them an easier way to answer.
            </p>
            <p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-ink-strong">
              Some old quotes are dead. Some just need a better reopen than
              &quot;just checking in.&quot;
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="audit-steps-title" className="border-b border-line-subtle">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Result first
            </p>
            <h2
              id="audit-steps-title"
              className="mt-3 break-words text-3xl font-black text-ink-strong sm:text-4xl"
            >
              One quote. One message. One next move.
            </h2>
            <p className="mt-4 text-base leading-7 text-ink-muted">
              Not another CRM. Not another dashboard to babysit. Just the next
              quote worth texting. Before buying another lead, run this check.
            </p>
          </div>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line-subtle bg-line-subtle lg:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.number} className="min-w-0 bg-surface-1 p-6">
                <span className="font-mono text-sm font-black text-money">
                  {step.number}
                </span>
                <h3 className="mt-4 text-lg font-black text-ink-strong">
                  {step.title}
                </h3>
                <p className="mt-2 break-words text-sm leading-6 text-ink-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-line-subtle px-4 py-7 text-center text-xs leading-6 text-ink-muted">
        Quote Reclaim helps home-service contractors work quiet estimates until
        they book, pause, or close. Not lead generation. Not scheduling
        software.
      </footer>
    </main>
  );
}
