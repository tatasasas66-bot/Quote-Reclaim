import { Suspense } from "react";
import Link from "next/link";
import { Badge, Logo } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { AuthForm } from "./AuthForm";

type AuthShellProps = {
  mode: "sign-in" | "sign-up";
};

const COPY = {
  "sign-in": {
    title: "Welcome back",
    subtitle: "Sign in with Magic Link or Google. No password.",
    crossLink: { href: "/sign-up", label: "New here? Start free →" },
  },
  "sign-up": {
    title: "Start your recovery",
    subtitle: "3 quotes free. No credit card. No setup.",
    crossLink: {
      href: "/sign-in",
      label: "Already on Quote Reclaim? Sign in →",
    },
  },
} as const;

function PreviewCard() {
  return (
    <div className="rounded-2xl border border-line-subtle bg-surface-1 p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <Badge>EXAMPLE PREVIEW · NOT YOUR DATA</Badge>
        <span className="text-xs uppercase tracking-wide text-ink-muted">
          Recovery dashboard
        </span>
      </div>
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">
            Still Bleeding
          </p>
          <p className="mt-1 text-5xl font-bold text-money tabular-nums">
            {formatCurrency(47200)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            12 silent quotes · oldest 14 days
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line-subtle bg-surface-2 p-3">
            <p className="text-xs text-ink-muted">Jobs Won Back</p>
            <p className="mt-1 text-2xl font-bold text-success tabular-nums">7</p>
          </div>
          <div className="rounded-lg border border-line-subtle bg-surface-2 p-3">
            <p className="text-xs text-ink-muted">Recovered this month</p>
            <p className="mt-1 text-2xl font-bold text-money tabular-nums">
              {formatCurrency(24400)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthShell({ mode }: AuthShellProps) {
  const { title, subtitle, crossLink } = COPY[mode];

  return (
    <main className="min-h-screen w-full px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <header className="mx-auto mb-8 flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          aria-label="Quote Reclaim home"
        >
          <Logo showWordmark />
        </Link>
        <Link
          href={crossLink.href}
          className="rounded text-sm text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {crossLink.label}
        </Link>
      </header>

      <div className="mx-auto mb-8 w-full max-w-md text-center lg:hidden">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          Revenue Recovery OS
        </p>
        <h1 className="mt-2 text-balance text-3xl font-bold leading-tight text-ink-strong">
          You sent the quote.
          <br />
          <span className="text-brand">Get the job back.</span>
        </h1>
      </div>

      <div className="mx-auto grid w-full max-w-6xl min-w-0 items-start gap-12 lg:grid-cols-[3fr_2fr]">
        <section className="hidden min-w-0 flex-col gap-8 lg:flex">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand">
              Revenue Recovery OS
            </p>
            <h1 className="text-balance text-5xl font-bold leading-tight text-ink-strong">
              You sent the quote.
              <br />
              The customer went quiet.
              <br />
              <span className="text-brand">Get the job back.</span>
            </h1>
            <p className="max-w-md break-words text-lg text-ink">
              Approve once, and Quote Reclaim chases every silent estimate on
              its own — until the customer replies, the job comes back, or the
              sequence closes cleanly.
            </p>
          </div>
          <PreviewCard />
        </section>

        <section className="mx-auto flex w-full min-w-0 max-w-md items-start lg:mx-0">
          <div className="w-full min-w-0 rounded-2xl border border-line-subtle bg-surface-1 p-6 shadow-xl sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-ink-strong">{title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
            </div>

            <Suspense fallback={<div className="h-44" aria-hidden="true" />}>
              <AuthForm mode={mode} />
            </Suspense>

            <div className="mt-6 space-y-2 text-center">
              <Link
                href="/audit"
                className="inline-block rounded text-sm text-ink hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Try the free Silent Quote Audit first →
              </Link>
              <p className="text-xs text-ink-muted">
                No credit card. 3 quotes free. Cancel anytime.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
