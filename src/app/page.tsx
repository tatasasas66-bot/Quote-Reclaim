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
      <section className="w-full min-w-0 space-y-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          Silent Quote Command
        </p>
        <h1 className="text-balance text-4xl font-bold leading-tight text-ink-strong sm:text-5xl">
          You sent the quote.
          <br />
          They went quiet.
          <br />
          <span className="text-brand">Get the job back.</span>
        </h1>
        <p className="max-w-xl break-words text-lg text-ink">
          Quote Reclaim turns silent estimates into a recovery queue with clear
          next moves, risk signals, and recovered-revenue tracking. No CRM. No
          chasing. No guessing.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link href="/sign-up">
            <Button size="lg">Find Silent Money</Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="secondary">
              See how it works
            </Button>
          </Link>
        </div>
        <p className="text-sm text-ink-muted">
          Start with 3 silent quotes free. One recovered job can pay for months.
        </p>
      </section>
    </main>
  );
}
