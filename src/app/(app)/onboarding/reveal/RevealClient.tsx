"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Logo } from "@/components/ui";
import {
  MAX_IMPORT_ROWS,
  parseSilentQuotesInput,
  type ParseSummary,
  type ParsedQuote,
} from "@/lib/onboarding/parse-quotes";
import {
  importSilentQuotesAction,
  skipOnboardingAction,
} from "@/lib/onboarding/actions";
import { formatCurrency } from "@/lib/utils/currency";
import { FREE_PLAN_LIMIT } from "@/lib/payments/lemonsqueezy";

type Props = {
  isPaid: boolean;
  usageCount: number;
  pendingCount: number;
};

type Step = "input" | "preview" | "reveal" | "submitting";

const TRADES = [
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Remodeling",
  "General Contracting",
  "Painting",
  "Landscaping",
  "Concrete",
];

const PASTE_PLACEHOLDER = [
  "Jane Smith    8,500    2026-05-15",
  "Tom Roberts   12,000   2026-05-22    tom@example.com",
  "Maria Garcia  4,500    9",
  "",
  "or paste from a spreadsheet — name, amount, [date], [email]",
].join("\n");

export function RevealClient({ isPaid, usageCount, pendingCount }: Props) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("input");
  const [trade, setTrade] = React.useState<string>("Roofing");
  const [pasted, setPasted] = React.useState<string>("");
  const [parsed, setParsed] = React.useState<ParseSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Free remaining = how many more quotes the free user can land via the
  // top-3 gate. Existing usage already counts against this allowance.
  const freeRemaining = isPaid
    ? Number.POSITIVE_INFINITY
    : Math.max(0, FREE_PLAN_LIMIT - usageCount);

  // ── handlers ─────────────────────────────────────────────────────────
  function handleScan() {
    setError(null);
    if (!pasted.trim()) {
      setError("Paste at least one estimate to scan.");
      return;
    }
    const summary = parseSilentQuotesInput(pasted);
    if (summary.rows.length === 0) {
      setError(
        "Couldn't read any estimates. Each line should have a name and an amount.",
      );
      return;
    }
    setParsed(summary);
    setStep("preview");
  }

  function handleRemove(index: number) {
    if (!parsed) return;
    const next: ParsedQuote[] = parsed.rows.filter((_, i) => i !== index);
    const totalAmount = next.reduce((s, r) => s + r.amount, 0);
    setParsed({ ...parsed, rows: next, totalAmount });
  }

  function handleConfirm() {
    if (!parsed || parsed.rows.length === 0) return;
    setStep("reveal");
  }

  async function handleStartRecovering() {
    if (!parsed) return;
    setStep("submitting");
    setError(null);
    const result = await importSilentQuotesAction({
      trade,
      rows: parsed.rows,
    });
    if (!result.ok) {
      setError(result.error);
      setStep("reveal");
      return;
    }
    router.push("/dashboard");
  }

  async function handleSkip() {
    await skipOnboardingAction();
    router.push("/dashboard");
  }

  // ── shared chrome ────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle/80 pb-5">
          <Logo showWordmark />
          <button
            type="button"
            onClick={handleSkip}
            className="rounded text-xs font-medium text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Skip — I&apos;ll add quotes one at a time →
          </button>
        </header>

        {step === "input" && (
          <InputStep
            trade={trade}
            setTrade={setTrade}
            pasted={pasted}
            setPasted={setPasted}
            error={error}
            onScan={handleScan}
            pendingCount={pendingCount}
          />
        )}

        {step === "preview" && parsed && (
          <PreviewStep
            parsed={parsed}
            trade={trade}
            onRemove={handleRemove}
            onConfirm={handleConfirm}
            onBack={() => setStep("input")}
          />
        )}

        {(step === "reveal" || step === "submitting") && parsed && (
          <RevealStep
            parsed={parsed}
            trade={trade}
            isPaid={isPaid}
            freeRemaining={freeRemaining}
            submitting={step === "submitting"}
            error={error}
            onStart={handleStartRecovering}
            onBack={() => setStep("preview")}
          />
        )}
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 1 — Input
// ─────────────────────────────────────────────────────────────────────────

function InputStep({
  trade,
  setTrade,
  pasted,
  setPasted,
  error,
  onScan,
  pendingCount,
}: {
  trade: string;
  setTrade: (s: string) => void;
  pasted: string;
  setPasted: (s: string) => void;
  error: string | null;
  onScan: () => void;
  pendingCount: number;
}) {
  return (
    <section className="mx-auto mt-8 grid w-full max-w-3xl gap-6">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-brand">
          Find the money sitting quiet
        </p>
        <h1 className="mt-3 text-balance text-4xl font-black leading-tight text-ink-strong sm:text-5xl">
          Paste your last 30 estimates.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-ink">
          Quote Reclaim will add up every silent estimate you&apos;ve sent —
          and show you the total amount sitting quiet right now. One number
          you&apos;ve never seen in your life.
        </p>
        {pendingCount > 0 ? (
          <p className="mt-3 text-xs text-ink-muted">
            You already have {pendingCount} quote{pendingCount === 1 ? "" : "s"}{" "}
            in your queue. Importing more adds to that list (subject to your
            free-trial allowance).
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border border-line-subtle bg-surface-1 p-5 sm:p-6">
        <label
          htmlFor="trade-select"
          className="block text-xs font-black uppercase tracking-widest text-ink-muted"
        >
          What trade are these for?
        </label>
        <select
          id="trade-select"
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          className="mt-2 w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {TRADES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label
          htmlFor="paste-box"
          className="mt-5 block text-xs font-black uppercase tracking-widest text-ink-muted"
        >
          Paste your estimates — one per line
        </label>
        <textarea
          id="paste-box"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={PASTE_PLACEHOLDER}
          rows={12}
          className="mt-2 w-full rounded-md border border-line-strong bg-surface-2 p-3 font-mono text-sm leading-6 text-ink-strong placeholder:text-ink-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        <p className="mt-2 text-xs text-ink-muted">
          Name and amount are required. Date and email are optional. Max{" "}
          {MAX_IMPORT_ROWS} rows per import.
        </p>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" size="lg" onClick={onScan}>
            Scan my quotes →
          </Button>
          <span className="text-xs text-ink-muted">
            Nothing is saved yet. You&apos;ll see the total first.
          </span>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 2 — Preview
// ─────────────────────────────────────────────────────────────────────────

function PreviewStep({
  parsed,
  trade,
  onRemove,
  onConfirm,
  onBack,
}: {
  parsed: ParseSummary;
  trade: string;
  onRemove: (i: number) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const count = parsed.rows.length;
  return (
    <section className="mx-auto mt-8 grid w-full max-w-3xl gap-6">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-brand">
          {trade} · Preview
        </p>
        <h2 className="mt-3 text-3xl font-black leading-tight text-ink-strong sm:text-4xl">
          We found {count} estimate{count === 1 ? "" : "s"}.
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Drop any rows that look wrong before the reveal.
          {parsed.skipped > 0
            ? ` Skipped ${parsed.skipped} unreadable row${parsed.skipped === 1 ? "" : "s"}.`
            : ""}
          {parsed.truncatedAt
            ? ` (Stopped at ${parsed.truncatedAt} — re-import the rest after.)`
            : ""}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-line-subtle bg-surface-1">
        <ul className="divide-y divide-line-subtle/60">
          {parsed.rows.map((row, i) => (
            <li
              key={`${row.name}-${row.amount}-${i}`}
              className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-strong">
                  {row.name}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {row.daysSilent === 0
                    ? "today"
                    : `${row.daysSilent} day${row.daysSilent === 1 ? "" : "s"} quiet`}
                  {row.email ? ` · ${row.email}` : " · no email"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="whitespace-nowrap text-base font-black text-ink-strong tabular-nums">
                  {formatCurrency(row.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="rounded text-xs text-ink-muted hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  aria-label={`Remove ${row.name}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-line-subtle bg-surface-2 px-4 py-3 sm:px-5">
          <span className="text-xs font-black uppercase tracking-widest text-ink-muted">
            Sitting quiet total
          </span>
          <span className="text-2xl font-black text-ink-strong tabular-nums">
            {formatCurrency(parsed.totalAmount)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={onConfirm} disabled={count === 0}>
          Reveal what&apos;s sitting quiet →
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onBack}>
          Re-paste
        </Button>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 3 — The Reveal
// ─────────────────────────────────────────────────────────────────────────

function RevealStep({
  parsed,
  trade,
  isPaid,
  freeRemaining,
  submitting,
  error,
  onStart,
  onBack,
}: {
  parsed: ParseSummary;
  trade: string;
  isPaid: boolean;
  freeRemaining: number;
  submitting: boolean;
  error: string | null;
  onStart: () => void;
  onBack: () => void;
}) {
  const count = parsed.rows.length;
  const willImport = isPaid ? count : Math.min(count, freeRemaining);
  const willSkip = Math.max(0, count - willImport);
  const remainingDollars = parsed.rows
    .slice(willImport)
    .reduce((s, r) => s + r.amount, 0);

  // Breakdown — quick segmentation by days silent.
  const warm = parsed.rows.filter((r) => r.daysSilent <= 6).length;
  const cooling = parsed.rows.filter(
    (r) => r.daysSilent >= 7 && r.daysSilent <= 13,
  ).length;
  const atRisk = parsed.rows.filter((r) => r.daysSilent >= 14).length;
  const oldest = parsed.rows.reduce(
    (max, r) => (r.daysSilent > max ? r.daysSilent : max),
    0,
  );

  const ctaLabel = submitting
    ? "Starting recovery…"
    : isPaid
      ? `Start recovering all ${willImport} →`
      : willImport === count
        ? `Start recovering all ${willImport} →`
        : `Start recovering your top ${willImport} free →`;

  return (
    <section className="mx-auto mt-6 grid w-full max-w-3xl gap-8 sm:mt-12">
      <div className="text-center">
        <p className="text-xs font-black uppercase tracking-widest text-warning/80">
          Sitting quiet
        </p>
        <p className="mt-4 text-6xl font-black leading-none tabular-nums text-warning sm:text-7xl lg:text-8xl">
          {formatCurrency(parsed.totalAmount)}
        </p>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-ink sm:text-lg">
          in <span className="font-bold text-ink-strong">{count}</span>{" "}
          {trade.toLowerCase()} estimate{count === 1 ? "" : "s"} you already
          paid to earn.
        </p>

        <div className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-ink-muted">
          {warm > 0 ? (
            <Badge variant="success">{warm} still warm</Badge>
          ) : null}
          {cooling > 0 ? (
            <Badge variant="neutral">{cooling} cooling</Badge>
          ) : null}
          {atRisk > 0 ? (
            <Badge variant="warning">{atRisk} at risk</Badge>
          ) : null}
          {oldest > 0 ? (
            <span className="text-xs">
              oldest <span className="font-bold text-ink-strong">{oldest}</span>{" "}
              days quiet
            </span>
          ) : null}
        </div>
      </div>

      {!isPaid && willSkip > 0 ? (
        <p className="mx-auto max-w-xl text-center text-sm leading-6 text-ink-muted">
          Your trial covers {willImport} quote
          {willImport === 1 ? "" : "s"} — we&apos;ll start with the highest
          value first.{" "}
          <span className="text-ink">
            {formatCurrency(remainingDollars)} stays parked until you upgrade.
          </span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-3">
        <Button
          type="button"
          size="lg"
          onClick={onStart}
          loading={submitting}
          disabled={submitting || willImport === 0}
          className="shadow-[0_0_42px_rgba(217,111,50,0.28)]"
        >
          {ctaLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={submitting}
        >
          Back to preview
        </Button>
      </div>
    </section>
  );
}
