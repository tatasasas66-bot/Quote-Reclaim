import { Suspense } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ShieldAlert,
} from "lucide-react";
import { Badge, Logo } from "@/components/ui";
import { LogoStacked } from "@/components/brand/Logo";
import { formatCurrency } from "@/lib/utils/currency";
import { AuthForm } from "./AuthForm";

type AuthShellProps = {
  mode: "sign-in" | "sign-up";
};

// AUTH_OTP_MODE flips the sign-in subtitle so the headline matches what the
// AuthForm actually does. Off (default): "Sign in with Magic Link." On:
// "Sign in with a code from your email." The emailed token length is
// dashboard-configurable (6-10 digits), so the copy stays length-neutral. The
// sign-up subtitle is mode-independent (it sells the free tier, not the
// mechanism).
const AUTH_OTP_MODE = process.env.NEXT_PUBLIC_AUTH_OTP_MODE === "true";

const COPY = {
  "sign-in": {
    title: "Start your recovery",
    subtitle: AUTH_OTP_MODE
      ? "Sign in with a code from your email. No password."
      : "Sign in with Magic Link. No password.",
    crossLink: { href: "/sign-up", label: "New here? Start free ->" },
  },
  "sign-up": {
    title: "Start your recovery",
    subtitle: "3 silent quotes free. No credit card. No setup.",
    crossLink: {
      href: "/sign-in",
      label: "Already on Quote Reclaim? Sign in ->",
    },
  },
} as const;

function PreviewCard() {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface-1 shadow-[0_28px_90px_rgba(0,0,0,0.38)]">
      <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3">
        <Badge variant="money">EXAMPLE PREVIEW · NOT YOUR DATA</Badge>
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          Silent Quote Command
        </span>
      </div>
      <div className="grid gap-4 p-4">
        <div className="rounded-lg border border-warning/35 bg-warning/10 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-warning">
            Money Still Quiet
          </p>
          <p className="mt-2 text-5xl font-black text-ink-strong tabular-nums">
            {formatCurrency(47200)}
          </p>
          <p className="mt-1 break-words text-sm text-ink-muted">
            12 quiet estimates · oldest 14 days
          </p>
        </div>

        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-danger" aria-hidden="true" />
            <p className="text-xs font-bold uppercase tracking-widest text-danger">
              Going Cold Alert
            </p>
          </div>
          <p className="mt-2 break-words text-lg font-bold text-ink-strong">
            Open the $8,500 roof plan today.
          </p>
          <p className="mt-1 break-words text-sm text-ink-muted">
            money sitting quiet needs one clear move.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <PreviewChip
            icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            label="Priority"
            value="High"
            tone="text-warning"
          />
          <PreviewChip
            icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
            label="Next move"
            value="Call"
            tone="text-brand"
          />
          <PreviewChip
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            label="Price check"
            value="In range"
            tone="text-success"
          />
        </div>
      </div>
    </div>
  );
}

function PreviewChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line-subtle bg-surface-2 p-3">
      <div className={`flex items-center gap-1.5 ${tone}`}>
        {icon}
        <p className="truncate text-[10px] font-bold uppercase tracking-widest">
          {label}
        </p>
      </div>
      <p className="mt-2 truncate text-lg font-black text-ink-strong">{value}</p>
    </div>
  );
}

export function AuthShell({ mode }: AuthShellProps) {
  const { title, subtitle, crossLink } = COPY[mode];

  return (
    <main className="min-h-screen w-full bg-canvas px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <header className="mx-auto mb-8 flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-b border-line-subtle/80 pb-5">
        <Link
          href="/"
          className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          aria-label="Quote Reclaim home"
        >
          <Logo showWordmark />
        </Link>
        <Link
          href={crossLink.href}
          className="rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {crossLink.label}
        </Link>
      </header>

      <div className="mx-auto mb-8 w-full max-w-md text-center lg:hidden">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          Silent Quote Command
        </p>
        <h1 className="mt-2 text-balance text-3xl font-black leading-tight text-ink-strong">
          The money isn&apos;t always in the next lead.
        </h1>
      </div>

      <div className="mx-auto grid w-full max-w-6xl min-w-0 items-start gap-10 lg:grid-cols-[3fr_2fr]">
        <section className="hidden min-w-0 flex-col gap-7 lg:flex">
          <LogoStacked className="items-start text-left" />
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand">
              Silent Quote Command
            </p>
            <h1 className="text-balance text-5xl font-black leading-[1.02] text-ink-strong">
              The money isn&apos;t always in the next lead.
            </h1>
            <p className="max-w-md break-words text-lg leading-8 text-ink">
              Sometimes it&apos;s sitting in the quotes you already drove out,
              scoped, and sent. Quote Reclaim helps you work the right quiet
              estimates before they go cold.
            </p>
            <p className="text-sm font-medium text-ink-muted">
              Silent Quote Command for serious contractors.
            </p>
          </div>
          <PreviewCard />
        </section>

        <section className="mx-auto flex w-full min-w-0 max-w-md items-start lg:mx-0">
          <div className="w-full min-w-0 rounded-lg border border-line-subtle bg-surface-1 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.36)] sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-ink-strong">{title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
            </div>

            <Suspense fallback={<div className="h-44" aria-hidden="true" />}>
              <AuthForm mode={mode} />
            </Suspense>

            <div className="mt-6 space-y-2 text-center">
              {/*
                Routes to the live Silent Money Reveal onboarding (the audit
                IS the reveal). Unauthenticated visitors get bounced through
                /sign-up?next=/onboarding/reveal by the reveal page guard so
                they land on the audit immediately after auth. Already-signed-
                in users go straight there.
              */}
              <Link
                href="/onboarding/reveal"
                className="inline-block rounded text-sm text-ink hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Try the free Silent Quote Audit first {"->"}
              </Link>
              <p className="text-xs text-ink-muted">
                No credit card. 3 quotes free. Cancel anytime.
              </p>
            </div>
          </div>
        </section>
      </div>

      <footer
        aria-label="Legal"
        className="mx-auto mt-10 flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-line-subtle/80 pt-6 text-sm text-ink-muted"
      >
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
        <span aria-hidden="true">·</span>
        <Link
          href="/refund-policy"
          className="rounded hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Refund Policy
        </Link>
        <span aria-hidden="true">·</span>
        <Link
          href="/cancellation-policy"
          className="rounded hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Cancellation
        </Link>
        <span aria-hidden="true">·</span>
        <Link
          href="/contact"
          className="rounded hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Contact
        </Link>
      </footer>
    </main>
  );
}
