import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, ShieldAlert } from "lucide-react";
import { Badge, Button, Logo } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-canvas">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle/80 pb-5">
          <Logo showWordmark />
          <Link
            href="/sign-in"
            className="rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Sign in
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-8 py-12 md:py-16">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div className="min-w-0 space-y-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand">
                Silent Quote Command
              </p>
              <h1 className="max-w-2xl text-balance text-5xl font-black leading-[0.98] text-ink-strong sm:text-6xl lg:text-7xl">
                You did the drive, the takeoff, the math.
                <br />
                <span className="text-brand">
                  Don&apos;t let the money die quiet.
                </span>
              </h1>
              <p className="max-w-xl break-words text-lg leading-8 text-ink sm:text-xl">
                Quote Reclaim shows which silent estimates still have money in
                them, what they&apos;re worth, and the next move — then follows
                up by email automatically so quoted work doesn&apos;t drift
                cold.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link href="/sign-up">
                  <Button size="lg" className="shadow-[0_0_42px_rgba(217,111,50,0.28)]">
                    See What&apos;s Sitting Quiet
                  </Button>
                </Link>
                <Link href="#how-it-works">
                  <Button size="lg" variant="secondary">
                    See How It Works
                  </Button>
                </Link>
              </div>
              <p className="max-w-md text-sm font-medium text-ink-muted">
                Built for US home-service contractors. $79/month. Not another
                CRM.
              </p>
            </div>

            <ProductPreview />
          </div>
        </section>
      </div>
    </main>
  );
}

function ProductPreview() {
  return (
    <div
      id="how-it-works"
      className="min-w-0 scroll-mt-8 rounded-lg border border-line-subtle bg-surface-1 shadow-[0_28px_90px_rgba(0,0,0,0.42)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-4 py-3 sm:px-5">
        <Badge variant="money">EXAMPLE PREVIEW · NOT YOUR DATA</Badge>
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          Money Sitting Quiet
        </span>
      </div>

      <div className="grid gap-4 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-warning/35 bg-warning/10 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-warning">
              Still Bleeding
            </p>
            <p className="mt-2 text-5xl font-black tracking-tight text-ink-strong tabular-nums sm:text-6xl">
              $47,200
            </p>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              Twelve quiet estimates still have a dollar value and a next move.
            </p>
          </div>

          <div className="rounded-lg border border-danger/40 bg-danger/10 p-5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-danger" aria-hidden="true" />
              <p className="text-xs font-bold uppercase tracking-widest text-danger">
                Recovery Window Alert
              </p>
            </div>
            <p className="mt-3 text-2xl font-black text-ink-strong">
              $8,500 roof quote is cooling fast.
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              9 days quiet. Open the plan before the job goes cold.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-line-subtle bg-surface-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
                Sample Quote Card
              </p>
              <h2 className="mt-1 truncate text-xl font-bold text-ink-strong">
                Martin Alvarez · Roofing · Tampa, FL
              </h2>
              <p className="mt-1 text-sm text-ink-muted">9 days quiet · $8,500</p>
            </div>
            <Badge variant="warning">High Priority</Badge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <PreviewStat
              icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
              label="Recovery Priority"
              value="87"
              tone="text-warning"
            />
            <PreviewStat
              icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
              label="Next Best Action"
              value="Call today"
              tone="text-brand"
            />
            <PreviewStat
              icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              label="Months paid for"
              value="107x"
              tone="text-success"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({
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
    <div className="rounded-lg border border-line-subtle bg-canvas/45 p-3">
      <div className={`flex items-center gap-2 ${tone}`}>
        {icon}
        <p className="text-xs font-semibold uppercase tracking-widest">{label}</p>
      </div>
      <p className="mt-2 text-xl font-black text-ink-strong">{value}</p>
    </div>
  );
}
