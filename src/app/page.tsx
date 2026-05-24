import Link from "next/link";
import { Button, Logo } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-between px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Logo showWordmark />
        <Link
          href="/sign-in"
          className="rounded text-sm text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Sign in →
        </Link>
      </header>
      <section className="w-full min-w-0 space-y-6 py-12 md:py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          QUOTE RECLAIM · REVENUE RECOVERY OS
        </p>
        <h1 className="text-balance text-4xl font-bold leading-tight text-ink-strong sm:text-5xl">
          You sent the quote.
          <br />
          The customer went quiet.
          <br />
          <span className="text-brand">Get the job back.</span>
        </h1>
        <p className="max-w-xl break-words text-lg text-ink">
          Quote Reclaim turns silent estimates into a recovery queue — with
          calm follow-ups, clear next moves, and recovered-revenue math built
          for contractors.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link href="/sign-up">
            <Button size="lg">Start recovering quotes</Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="secondary">
              Sign in
            </Button>
          </Link>
        </div>
        <p className="text-sm text-ink-muted">
          3 free recoveries. No credit card. One won-back job can pay for
          months.
        </p>
      </section>
    </main>
  );
}
