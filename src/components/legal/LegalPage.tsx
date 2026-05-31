import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui";

/**
 * Shared chrome for the static legal pages (/terms, /privacy). Plain, readable
 * prose layout built from the existing design tokens — no new colors, no new
 * button styles. The substantive copy lives in each page; this only provides
 * the header, title, and footer so the two pages stay visually consistent.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle/80 pb-5">
          <Link
            href="/"
            aria-label="Quote Reclaim home"
            className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Logo showWordmark />
          </Link>
          <Link
            href="/sign-in"
            className="rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Sign in
          </Link>
        </header>

        <article className="py-10">
          <h1 className="text-balance text-4xl font-black leading-tight text-ink-strong">
            {title}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">Last updated {updated}</p>
          <div className="mt-8 space-y-8">{children}</div>
        </article>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle/80 py-6 text-sm text-ink-muted">
          <p>© {new Date().getFullYear()} Quote Reclaim</p>
          <nav className="flex items-center gap-3">
            <Link
              href="/terms"
              className="rounded hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Terms
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href="/privacy"
              className="rounded hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Privacy
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}

/** A titled prose section used throughout the legal pages. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-ink-strong">{heading}</h2>
      <div className="space-y-3 text-[15px] leading-7 text-ink">{children}</div>
    </section>
  );
}
