"use client";

import * as React from "react";
import Link from "next/link";
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
import { FREE_PLAN_LIMIT } from "@/lib/payments/entitlement";
import { TRADES } from "@/lib/utils/normalize";

type Props = {
  isPaid: boolean;
  usageCount: number;
  pendingCount: number;
  /**
   * Where this client is mounted. "onboarding" is the first-run flow; "import"
   * is the reusable post-onboarding entry at /quotes/import. Drives the header
   * label (Skip vs Back), the trade hint about already-imported quotes, and
   * nothing else — parser, action, and ranking stay identical so there is
   * exactly one bulk-import logic path.
   */
  surface?: "onboarding" | "import";
  defaultTrade?: string | null;
};

import {
  AuditTransition,
  noEmailRevealCopy,
  REVEAL_AUDIT_LINES,
  REVEAL_TRANSITION_MIN_MS,
} from "./transition-and-copy";

type Step =
  | "audit-saved"
  | "input"
  | "preview"
  | "transitioning"
  | "reveal"
  | "submitting";

const AUDIT_HANDOFF_KEY = "quote-reclaim:audit-result-v1";

const PASTE_PLACEHOLDER = [
  "Jane Smith    8,500    2026-05-15",
  "Tom Roberts   12,000   2026-05-22    tom@example.com",
  "Maria Garcia  4,500    9",
  "",
  "or paste from a spreadsheet — name, amount, [date], [email]",
].join("\n");

const INPUT_PROOF_POINTS = [
  "Spreadsheet rows",
  "CSV or tabs",
  "Copied estimate lists",
  "Name + amount is enough",
];

export function RevealClient({
  isPaid,
  usageCount,
  pendingCount,
  surface = "onboarding",
  defaultTrade,
}: Props) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("input");
  const [trade, setTrade] = React.useState<string>(
    defaultTrade && TRADES.includes(defaultTrade as (typeof TRADES)[number])
      ? defaultTrade
      : "Roofing",
  );
  const [pasted, setPasted] = React.useState<string>("");
  const [parsed, setParsed] = React.useState<ParseSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [auditPriorityIndex, setAuditPriorityIndex] = React.useState<number | null>(
    null,
  );
  const fromAudit = auditPriorityIndex != null;

  React.useEffect(() => {
    if (surface !== "onboarding") return;
    try {
      const raw = window.sessionStorage.getItem(AUDIT_HANDOFF_KEY);
      if (!raw) return;
      const handoff = JSON.parse(raw) as {
        trade?: string;
        quotes?: ParsedQuote[];
        priorityIndex?: number | null;
      };
      const rows = Array.isArray(handoff.quotes)
        ? handoff.quotes
            .slice(0, 3)
            .filter(
              (row) =>
                row &&
                typeof row.name === "string" &&
                Number.isFinite(row.amount) &&
                row.amount > 0,
            )
        : [];
      if (rows.length === 0) return;
      const savedTrade =
        handoff.trade &&
        TRADES.includes(handoff.trade as (typeof TRADES)[number])
          ? handoff.trade
          : trade;
      setTrade(savedTrade);
      setParsed({
        rows,
        skipped: 0,
        totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
        truncatedAt: null,
      });
      setPasted(
        rows
          .map((row) => `${row.name}\t${row.amount}\t${row.daysSilent}`)
          .join("\n"),
      );
      setAuditPriorityIndex(handoff.priorityIndex ?? 1);
      setStep("audit-saved");
    } catch {
      // A malformed or blocked session handoff falls back to normal onboarding.
    }
    // Read once on entry; changing the trade selector should not replay storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface]);

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
        "Couldn't read those rows. Try: name, amount, optional date, optional email — one quote per line.",
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

  // Audit-transition message rotation. Idx advances on a setInterval so the
  // contractor reads through the honest "what's happening" lines while the
  // timer counts down. Reset when we leave the transitioning step.
  const [transitionMsgIdx, setTransitionMsgIdx] = React.useState(0);
  React.useEffect(() => {
    if (step !== "transitioning") {
      setTransitionMsgIdx(0);
      return;
    }
    const tick = window.setInterval(() => {
      setTransitionMsgIdx((i) => Math.min(i + 1, REVEAL_AUDIT_LINES.length - 1));
    }, Math.floor(REVEAL_TRANSITION_MIN_MS / REVEAL_AUDIT_LINES.length));
    return () => window.clearInterval(tick);
  }, [step]);
  React.useEffect(() => {
    if (step !== "transitioning") return;
    const t = window.setTimeout(() => setStep("reveal"), REVEAL_TRANSITION_MIN_MS);
    return () => window.clearTimeout(t);
  }, [step]);

  function handleConfirm() {
    if (!parsed || parsed.rows.length === 0) return;
    // Respect prefers-reduced-motion: skip the audit-transition window
    // entirely and go straight to the reveal.
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStep(reduceMotion ? "reveal" : "transitioning");
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
    try {
      window.sessionStorage.removeItem(AUDIT_HANDOFF_KEY);
    } catch {
      // Non-fatal.
    }
    router.push(
      fromAudit && result.priorityQuoteId
        ? `/quotes/${result.priorityQuoteId}`
        : "/dashboard",
    );
  }

  async function handleSkip() {
    if (surface === "import") {
      // Reusable import surface: nothing onboarding-flag-like to flip; the
      // contractor already lives in the app. Just take them back.
      router.push("/dashboard");
      return;
    }
    await skipOnboardingAction(trade);
    router.push("/quotes/new");
  }

  const headerSecondaryLabel =
    surface === "import"
      ? "Back to dashboard"
      : "Skip — start with one quote instead →";

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
            {headerSecondaryLabel}
          </button>
        </header>

        {step === "audit-saved" && parsed ? (
          <section className="mx-auto mt-10 w-full max-w-2xl border-y border-line-subtle py-8">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Audit saved
            </p>
            <h1 className="mt-2 text-3xl font-black text-ink-strong sm:text-4xl">
              Your audit is saved. Here&apos;s your #1 move.
            </h1>
            {(() => {
              const priority =
                parsed.rows.find((row) =>
                  row.name.endsWith(String(auditPriorityIndex)),
                ) ?? parsed.rows[0]!;
              return (
                <p className="mt-4 text-xl font-black text-ink-strong">
                  {priority.name}, {formatCurrency(priority.amount)},{" "}
                  {priority.daysSilent <= 7
                    ? "Warm"
                    : priority.daysSilent <= 21
                      ? "Cooling"
                      : priority.daysSilent < 45
                        ? "Cold"
                        : "Closeout"}.
                </p>
              );
            })()}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                size="lg"
                onClick={() => void handleStartRecovering()}
              >
                Save and open the plan →
              </Button>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                onClick={() => setStep("input")}
              >
                Add more estimates
              </Button>
            </div>
          </section>
        ) : null}

        {step === "input" && (
          <InputStep
            trade={trade}
            setTrade={setTrade}
            pasted={pasted}
            setPasted={setPasted}
            error={error}
            onScan={handleScan}
            pendingCount={pendingCount}
            surface={surface}
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

        {step === "transitioning" && (
          <AuditTransition messageIdx={transitionMsgIdx} />
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
  surface,
}: {
  trade: string;
  setTrade: (s: string) => void;
  pasted: string;
  setPasted: (s: string) => void;
  error: string | null;
  onScan: () => void;
  pendingCount: number;
  surface: "onboarding" | "import";
}) {
  const isImport = surface === "import";
  return (
    <section className="mx-auto mt-7 grid w-full max-w-5xl gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
      <div className="min-w-0 space-y-5">
        <p className="text-xs font-black uppercase tracking-widest text-brand">
          {isImport ? "Paste More Quotes" : "Silent Quote Audit"}
        </p>
        <h1 className="mt-3 text-balance text-4xl font-black leading-[1.04] text-ink-strong sm:text-5xl">
          {isImport
            ? "Add another batch to the recovery queue."
            : "Find the money still sitting in old estimates."}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-ink">
          Paste from a spreadsheet, notes, email, or a copied estimate list.
          Quote Reclaim cleans the rows, shows the quiet total, ranks the best customers to reopen first, and builds the 5-message recovery plan for each one.
          Nothing is saved until you confirm.
        </p>
        <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
          Name + amount is enough. Date and email help time the follow-up. No email on file? You still get all 5 messages, ready to copy.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {INPUT_PROOF_POINTS.map((point) => (
            <div
              key={point}
              className="rounded-lg border border-line-subtle bg-surface-1/75 px-3 py-2 text-sm font-semibold text-ink"
            >
              {point}
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-brand/35 bg-brand/10 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            What happens next
          </p>
          <ol className="mt-3 grid gap-3">
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-canvas">
                1
              </span>
              <div>
                <p className="text-sm font-black text-ink-strong">
                  Review before saving
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  Drop any row that looks wrong. Nothing is saved until you
                  confirm.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-canvas">
                2
              </span>
              <div>
                <p className="text-sm font-black text-ink-strong">
                  See the quiet total
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  The reveal shows the money sitting quiet and the first
                  recovery targets.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-canvas">
                3
              </span>
              <div>
                <p className="text-sm font-black text-ink-strong">
                  Start the recovery system
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  Your dashboard opens with the quote, the money, and the next
                  message to send.
                </p>
              </div>
            </li>
          </ol>
        </div>
        {pendingCount > 0 ? (
          <p className="mt-3 rounded-lg border border-line-subtle bg-surface-1/70 p-3 text-xs leading-5 text-ink-muted">
            You already have {pendingCount} quote{pendingCount === 1 ? "" : "s"}{" "}
            in your queue. Importing more adds to that list under your current
            plan allowance.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-line-subtle bg-surface-1 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.24)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Paste anything structured
            </p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              One quote per line. Name + amount is enough. We clean it up
              before it touches your queue.
            </p>
          </div>
          <span className="rounded-full border border-money/30 bg-money/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-money">
            Result first
          </span>
        </div>

        <label
          htmlFor="trade-select"
          className="mt-5 block text-xs font-black uppercase tracking-widest text-ink-muted"
        >
          Trade
        </label>
        <select
          id="trade-select"
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          className="mt-2 h-12 w-full rounded-md border border-line-strong bg-surface-2 px-3 text-base font-semibold text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
          Quiet estimates
        </label>
        <textarea
          id="paste-box"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={PASTE_PLACEHOLDER}
          rows={11}
          className="mt-2 w-full rounded-md border border-line-strong bg-surface-2 p-3 font-mono text-sm leading-6 text-ink-strong placeholder:text-ink-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        <p className="mt-2 text-xs text-ink-muted">
          Name and amount are required. Date and email are optional. No email?
          We&apos;ll build copy-ready follow-ups instead. Max{" "}
          {MAX_IMPORT_ROWS} rows per import.
        </p>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            size="lg"
            onClick={onScan}
            className="h-auto min-h-12 w-full whitespace-normal px-4 py-3 text-center leading-tight sm:flex-1 sm:whitespace-nowrap"
          >
            Scan my quiet estimates
          </Button>
          {!isImport ? (
            <Link
              href="/quotes/new"
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line-strong bg-surface-2 px-4 py-3 text-base font-semibold text-ink-strong hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-w-44"
            >
              Start with one
            </Link>
          ) : null}
          <span className="text-center text-xs leading-5 text-ink-muted sm:basis-full sm:text-left">
            Nothing is saved yet. You&apos;ll see the total first.
          </span>
        </div>
      </div>

      {/* In-flow secondary path. The top header skip is unobtrusive on
          purpose; some contractors only see CTAs that sit beside the
          textarea. This one names the alternative honestly so "skip" never
          feels like abandonment — it is "I want to start with one quote",
          not "I am giving up". Hidden in the reusable-import surface where
          there is no onboarding gate to cross. */}
      {!isImport ? (
        <p className="text-center text-xs text-ink-muted lg:col-span-2">
          No list handy?{" "}
          <Link
            href="/quotes/new"
            className="font-semibold text-brand hover:text-ink-strong"
          >
            Start with one quote
          </Link>{" "}
          — you can paste a batch any time from the dashboard.
        </p>
      ) : null}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 2 — Preview
// ─────────────────────────────────────────────────────────────────────────

const PREVIEW_COLLAPSE_THRESHOLD = 8;

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
  // Large imports: hide everything past the top N rows behind a toggle so a
  // 30/40/100-row paste never buries the Reveal CTA. The list is sorted by
  // amount desc so the highest-value rows stay visible by default — exactly
  // what the contractor wants to scan before confirming.
  const isLarge = count > PREVIEW_COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = React.useState(false);
  const ranked = React.useMemo(
    () => parsed.rows.map((row, i) => ({ row, i })).sort((a, b) => b.row.amount - a.row.amount),
    [parsed.rows],
  );
  const visibleRanked =
    isLarge && !expanded ? ranked.slice(0, PREVIEW_COLLAPSE_THRESHOLD) : ranked;
  const hiddenCount = count - visibleRanked.length;

  return (
    <section className="mx-auto mt-8 grid w-full max-w-3xl gap-6">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-brand">
          {trade} · Audit preview
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
          {visibleRanked.map(({ row, i }) => (
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
        {isLarge ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            data-testid="preview-toggle"
            className="flex w-full items-center justify-between gap-3 border-t border-line-subtle bg-canvas/30 px-4 py-3 text-left text-xs font-bold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:px-5"
          >
            <span>
              {expanded
                ? "Showing all rows — collapse to the top 8"
                : `Show all ${count} rows (${hiddenCount} hidden — sorted by amount)`}
            </span>
            <span aria-hidden="true" className="font-black text-brand">
              {expanded ? "↑" : "↓"}
            </span>
          </button>
        ) : null}
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
  // Mirror the server: it imports the highest-value rows first under the free
  // cap. Rank here too so "remaining outside free plan" matches exactly what
  // the server will actually keep vs. drop.
  const ranked = [...parsed.rows].sort((a, b) => b.amount - a.amount);
  const willImport = isPaid ? count : Math.min(count, freeRemaining);
  const willSkip = Math.max(0, count - willImport);
  const importing = ranked.slice(0, willImport);
  const remainingDollars = ranked
    .slice(willImport)
    .reduce((s, r) => s + r.amount, 0);
  // How many of the rows we will actually import have no email. Those become
  // copy/manual quotes — the contractor sends them himself; they do NOT
  // auto-send. Surfaced honestly so no one thinks automation is on for them.
  const noEmailImporting = importing.filter((r) => !r.email).length;

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
    ? "Starting…"
    : isPaid || willImport === count
      ? `Start the follow-up plan →`
      : `Start the top ${willImport} follow-up plan →`;

  return (
    <section className="mx-auto mt-4 grid w-full max-w-3xl gap-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:mt-8 sm:gap-6 sm:[@media(min-height:760px)]:pb-0">
      <div className="text-center">
        <p className="text-xs font-black uppercase tracking-widest text-warning/80">
          Sitting quiet
        </p>
        <p className="mt-3 text-[length:clamp(2.5rem,7vw,4.5rem)] font-black leading-none tabular-nums text-warning">
          {formatCurrency(parsed.totalAmount)}
        </p>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-ink sm:text-lg">
          in <span className="font-bold text-ink-strong">{count}</span>{" "}
          {trade.toLowerCase()} estimate{count === 1 ? "" : "s"} you already
          sent.
        </p>

        <div className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-ink-muted">
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

      {/* YOUR FIRST N MOVES — same ranking the server actually imports.
          Always shows up to 3 even for paid users, because the "first moves"
          framing is what makes this feel like a ranked audit, not a list. */}
      {(() => {
        const movesCount = Math.min(3, isPaid ? count : willImport);
        if (movesCount === 0) return null;
        const moves = ranked.slice(0, movesCount);
        const heading =
          movesCount === 1
            ? "Your first move"
            : `Your first ${movesCount} moves`;
        return (
          <div className="mx-auto w-full max-w-md">
            <p className="text-center text-xs font-black uppercase tracking-widest text-ink-muted">
              {heading}
            </p>
            <ol className="mt-2 grid gap-1.5">
              {moves.map((row, i) => (
                <li
                  key={`${row.name}-${row.amount}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-surface-1 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 text-xs font-black text-brand tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink-strong">
                        {row.name}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {row.daysSilent === 0
                          ? "today"
                          : `${row.daysSilent} day${row.daysSilent === 1 ? "" : "s"} quiet`}
                        {row.email ? " · email ready" : " · manual copy"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-sm font-black text-ink-strong tabular-nums">
                    {formatCurrency(row.amount)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-center text-xs text-ink-muted">
              Quote Reclaim will start with {movesCount === 1 ? "this one" : "these"} first.
            </p>
          </div>
        );
      })()}

      {!isPaid && willSkip > 0 && remainingDollars > 0 ? (
        <p className="mx-auto max-w-xl text-center text-sm leading-6 text-ink-muted">
          Your free plan covers {willImport} quote
          {willImport === 1 ? "" : "s"} — we&apos;ll import the highest value
          first.{" "}
          <span className="text-ink">
            {formatCurrency(remainingDollars)} is waiting outside your free plan.
            Upgrade to import the rest.
          </span>
        </p>
      ) : null}

      {(() => {
        const line = noEmailRevealCopy({
          willImport,
          noEmailInImporting: noEmailImporting,
          isPaid,
        });
        if (!line) return null;
        return (
          <p className="mx-auto max-w-xl text-center text-xs leading-6 text-ink-muted">
            {line}
          </p>
        );
      })()}

      {error ? (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* In-flow CTA. On a tall desktop the primary button renders here,
          above the fold after the compacted reveal. On mobile and short
          laptop viewports (≤ ~760px tall) the primary action moves to the
          sticky command bar below, so only the secondary "Back" stays here. */}
      <div className="flex flex-col items-center gap-3">
        <Button
          type="button"
          size="lg"
          onClick={onStart}
          loading={submitting}
          disabled={submitting || willImport === 0}
          className="hidden shadow-[0_0_42px_rgba(217,111,50,0.28)] sm:[@media(min-height:760px)]:inline-flex"
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

      {/* Sticky command bar — keeps the primary CTA in reach without a scroll
          on mobile and short laptop viewports (e.g. 1366×768), where the
          in-flow CTA would otherwise fall below the fold. Hidden on tall
          desktop, where the in-flow CTA above is already visible. Safe-area
          padding clears the iOS home indicator; the section reserves matching
          bottom padding so the bar never permanently covers "Back". */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line-subtle/70 bg-canvas px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:[@media(min-height:760px)]:hidden">
        <div className="mx-auto w-full max-w-3xl">
          <Button
            type="button"
            size="lg"
            fullWidth
            onClick={onStart}
            loading={submitting}
            disabled={submitting || willImport === 0}
            className="shadow-[0_0_36px_rgba(217,111,50,0.32)]"
          >
            {ctaLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

