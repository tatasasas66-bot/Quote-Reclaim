import Link from "next/link";
import { Logo } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-between px-6 py-12">
      <header>
        <Logo showWordmark />
      </header>
      <section className="space-y-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          Revenue Recovery OS
        </p>
        <h1 className="text-balance text-4xl font-bold leading-tight text-ink-strong sm:text-5xl">
          You sent the quote.
          <br />
          The customer went quiet.
          <br />
          <span className="text-brand">Get the job back.</span>
        </h1>
        <p className="max-w-xl text-lg text-ink">
          Quote Reclaim is the revenue recovery layer for US home-service contractors.
          Approve once, and it does the chasing on every silent estimate until the
          customer replies, the job comes back, or the sequence closes cleanly.
        </p>
        <p className="text-sm text-ink-muted">
          The product is being rebuilt from zero. The full landing, dashboard, and
          audit flow land in upcoming phases.
        </p>
      </section>
      <footer className="flex flex-wrap items-center gap-4 text-sm text-ink-muted">
        <Link
          href="/test-page"
          className="rounded text-ink hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Design system preview →
        </Link>
        <span aria-hidden="true">·</span>
        <span>v0.1 · scaffold</span>
      </footer>
    </main>
  );
}
