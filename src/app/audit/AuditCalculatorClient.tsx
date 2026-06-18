"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { track } from "@/lib/analytics/track";
import { bucketCurrency, readUtms } from "@/lib/analytics/privacy";
import {
  buildSignupHref,
  runSilentQuoteAudit,
  type AuditResult,
  type RankedAuditQuote,
} from "@/lib/audit/silent-quote-audit";

const ROW_COUNT = 3;

/**
 * Honest analysis steps shown between submit and the result render. Each
 * line names a thing the audit actually computed in the synchronous call
 * — no fake "thinking" copy, no invented step that isn't real work.
 */
export const ANALYSIS_STEPS: readonly string[] = [
  "Totaling your quiet quotes...",
  "Scoring by value and days since sent...",
  "Finding the best first follow-up...",
  "Building your follow-up order...",
  "Preparing your next message...",
];

/** Default per-step duration: ~700ms × 5 steps = 3.5s total. */
export const ANALYSIS_STEP_MS_DEFAULT = 700;
/** Reduced-motion per-step duration: ~160ms × 5 steps = 800ms total. */
export const ANALYSIS_STEP_MS_REDUCED = 160;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

type Row = { amount: string; days: string };

function emptyRows(): Row[] {
  return Array.from({ length: ROW_COUNT }, () => ({ amount: "", days: "" }));
}

const WINDOW_TONES: Record<string, string> = {
  Warm: "border-success/40 bg-success/10 text-success",
  Cooling: "border-warning/40 bg-warning/10 text-warning",
  Cold: "border-danger/40 bg-danger/10 text-danger",
  Unknown: "border-line-subtle bg-surface-2 text-ink-muted",
};

const PRIORITY_TONES: Record<string, string> = {
  "Follow up first": "text-brand",
  "Next backup": "text-warning",
  "Lower priority": "text-ink-muted",
};

export function AuditCalculatorClient() {
  const [rows, setRows] = React.useState<Row[]>(emptyRows);
  const [result, setResult] = React.useState<AuditResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const startedRef = React.useRef(false);
  const [signupHref, setSignupHref] = React.useState(
    "/sign-up?next=/onboarding/reveal",
  );
  const [utms, setUtms] = React.useState<Record<string, string>>({});
  // Shared anchor for BOTH the analysis panel and the result. Scrolling to it
  // on submit keeps the analysis sequence and the result in one stable spot.
  const outputRef = React.useRef<HTMLDivElement | null>(null);

  // Analysis state — the brief between submit and result render. Step index
  // advances on a fixed schedule; the duration shrinks aggressively under
  // prefers-reduced-motion. The audit itself is computed SYNCHRONOUSLY before
  // the state machine starts, so analysis is honest UI affordance, not a fake
  // request — and if the user navigates away mid-analysis, the timers are
  // cleared, no spurious events fire.
  const [analysisStep, setAnalysisStep] = React.useState<number | null>(null);
  const analyzing = analysisStep !== null;
  const timersRef = React.useRef<number[]>([]);

  function clearAnalysisTimers() {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }

  React.useEffect(() => clearAnalysisTimers, []);

  // Page view + UTM capture. Reading UTMs from the live URL on mount keeps the
  // server page fully static; we carry them into the existing /sign-up?next=
  // flow so paid-traffic attribution survives the hop into the product, and
  // we attach them to every analytics event below for funnel attribution.
  React.useEffect(() => {
    const captured = readUtms(window.location.search);
    setUtms(captured);
    setSignupHref(buildSignupHref(window.location.search));
    track("audit_page_viewed", captured);
  }, []);

  function markStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    track("audit_started", utms);
  }

  function updateRow(i: number, key: keyof Row, value: string) {
    markStarted();
    setRows((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analyzing) return; // ignore re-submits during analysis
    const audit = runSilentQuoteAudit(
      rows.map((r) => ({ amountRaw: r.amount, daysSilentRaw: r.days })),
    );
    if (audit.error) {
      setResult(null);
      setError(audit.error);
      return;
    }
    const reduced = prefersReducedMotion();
    setError(null);
    setResult(null); // hide any prior result while we re-analyze
    setCopied(false);

    // Pace the reveal so the result lands with the weight of a real audit
    // instead of a calculator flash. The audit itself is already computed —
    // analysis is honest UI affordance, not a faked round-trip.
    const stepMs = reduced
      ? ANALYSIS_STEP_MS_REDUCED
      : ANALYSIS_STEP_MS_DEFAULT;

    clearAnalysisTimers();
    setAnalysisStep(0);

    // Scroll to the shared output anchor IMMEDIATELY — not after analysis
    // finishes — so the contractor actually watches the steps run. The
    // analysis panel and the result render in the SAME anchored container,
    // so this is the only scroll needed; the result reveals in place. rAF
    // waits for React to commit the analysis panel before measuring.
    requestAnimationFrame(() => {
      outputRef.current?.scrollIntoView?.({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    });

    for (let i = 1; i < ANALYSIS_STEPS.length; i++) {
      timersRef.current.push(
        window.setTimeout(() => setAnalysisStep(i), stepMs * i),
      );
    }
    timersRef.current.push(
      window.setTimeout(() => {
        setAnalysisStep(null);
        setResult(audit);
        // PRIVACY: never send raw dollar amounts. We bucket the total into
        // a coarse range and report counts/flags only — never the
        // customer's quote values, names, or any input string.
        track("audit_completed", {
          quote_count: audit.quotes.length,
          has_days_silent: audit.quotes.some((q) => q.daysSilent != null),
          total_silent_quote_value_bucket: bucketCurrency(
            audit.totalSilentQuoteValue,
          ),
          priority_band: audit.priorityBandLabel ?? "unknown",
          ...utms,
        });
        // No second scroll: the result reveals inside the already-anchored
        // output container, so the viewport stays where the user is reading.
      }, stepMs * ANALYSIS_STEPS.length),
    );
  }

  async function copyMessage() {
    if (!result?.suggestedMessage) return;
    try {
      await navigator.clipboard.writeText(result.suggestedMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the message is visible to copy by hand.
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="sr-only">Your three oldest silent quotes</legend>
          {rows.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-[1.5fr_1fr] gap-3 rounded-lg border border-line-subtle bg-surface-1 p-3"
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`amount-${i}`}
                  className="text-sm font-medium text-ink"
                >
                  Quote #{i + 1} amount
                </label>
                <input
                  id={`amount-${i}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="e.g. 2800"
                  value={row.amount}
                  onChange={(e) => updateRow(i, "amount", e.target.value)}
                  className="h-11 rounded-lg border border-line-subtle bg-surface-2 px-3 text-base text-ink-strong placeholder:font-normal placeholder:italic placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`days-${i}`}
                  className="text-sm font-medium text-ink-muted"
                >
                  Days since you sent it
                </label>
                <input
                  id={`days-${i}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="14"
                  value={row.days}
                  onChange={(e) => updateRow(i, "days", e.target.value)}
                  className="h-11 rounded-lg border border-line-subtle bg-surface-2 px-3 text-base text-ink-strong placeholder:font-normal placeholder:italic placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
                />
              </div>
            </div>
          ))}
        </fieldset>

        {error ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={analyzing}
          disabled={analyzing}
          data-testid="audit-submit"
        >
          {analyzing ? "Auditing..." : "Show me which quote to chase first →"}
        </Button>

        <p className="text-center text-xs text-ink-muted">
          First 3 free. No signup until you see the result. No card.
        </p>
        <p className="text-center text-xs text-ink-muted">
          You enter your own numbers — we don&apos;t need customer names for the
          audit.
        </p>
      </form>

      {/* Shared anchored output region: analysis transforms into the result
          in the same place, and the on-submit scroll targets this container. */}
      <div ref={outputRef} className="scroll-mt-4 empty:hidden">
      {analyzing ? (
        <div
          data-testid="audit-analysis"
          role="status"
          aria-live="polite"
          className="rounded-xl border border-line-subtle bg-surface-1 p-5"
        >
          <div className="flex items-center gap-3">
            <Loader2
              className="h-5 w-5 shrink-0 animate-spin text-brand motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p
              data-testid="audit-analysis-step"
              className="text-sm font-semibold text-ink-strong"
            >
              {ANALYSIS_STEPS[analysisStep ?? 0]}
            </p>
          </div>
          <ol className="mt-3 space-y-1 text-xs text-ink-muted">
            {ANALYSIS_STEPS.map((step, i) => (
              <li
                key={step}
                className={
                  analysisStep !== null && i < analysisStep
                    ? "text-ink-muted/60 line-through decoration-1"
                    : analysisStep !== null && i === analysisStep
                      ? "text-ink"
                      : "text-ink-muted/50"
                }
              >
                {step}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {result && !result.error ? (
        <div
          data-testid="audit-result"
          role="region"
          aria-label="Your silent quote audit"
          className="space-y-5 rounded-xl border border-brand/30 bg-surface-2 p-5 sm:p-6"
        >
          <p className="text-xs font-black uppercase tracking-widest text-success">
            Your audit is ready.
          </p>

          <div>
            <p className="text-3xl font-black leading-tight text-ink-strong sm:text-4xl">
              <span className="tabular-nums text-money">
                {formatCurrency(result.totalSilentQuoteValue)}
              </span>{" "}
              sitting in your quiet quotes.
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              Across {result.quotes.length} old{" "}
              {result.quotes.length === 1 ? "estimate" : "estimates"} that went
              quiet.
            </p>
          </div>

          {result.priority ? (
            <div
              data-testid="audit-start-here"
              className="rounded-lg border border-line-subtle bg-surface-1 p-4"
            >
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                Start here
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-bold text-ink-strong">
                <span>Start with Quote #{result.priority.index}</span>
                <span aria-hidden="true" className="text-ink-muted">
                  —
                </span>
                <span className="tabular-nums">
                  {formatCurrency(result.priority.amount)}
                </span>
                {result.priority.daysSilent != null ? (
                  <>
                    <span aria-hidden="true" className="text-sm text-ink-muted">
                      &middot;
                    </span>
                    <span className="text-sm font-semibold text-ink-muted">
                      {result.priority.daysSilent} days since sent
                    </span>
                  </>
                ) : null}
                <span aria-hidden="true" className="text-sm text-ink-muted">
                  &middot;
                </span>
                <span
                  data-testid="audit-start-window-badge"
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    WINDOW_TONES[result.priority.windowLabel] ?? WINDOW_TONES.Unknown
                  }`}
                >
                  {result.priority.windowLabel}
                </span>
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                <span className="font-semibold text-ink">
                  Why this quote first.
                </span>{" "}
                {result.priorityReason}
              </p>
            </div>
          ) : null}

          <FollowUpOrder ranked={result.rankedQuotes} />

          <div
            data-testid="audit-why-order"
            className="rounded-lg border border-line-subtle bg-surface-1 p-4"
          >
            <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
              Why this order?
            </p>
            <p className="mt-2 text-sm leading-6 text-ink">
              This order balances the money at stake with how long each quote
              has been quiet. The goal is to chase the biggest realistic
              opportunity first without sounding desperate.
            </p>
            {result.whyNotOthers.length > 0 ? (
              <ul
                data-testid="audit-why-not-others"
                className="mt-3 space-y-1.5 text-sm leading-6 text-ink-muted"
              >
                {result.whyNotOthers.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-muted"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-lg border border-line-subtle bg-surface-1 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
                Suggested message
              </p>
              <button
                type="button"
                onClick={copyMessage}
                className="rounded text-xs font-semibold text-brand hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-strong">
              {result.suggestedMessage}
            </p>
            <p className="mt-3 text-xs italic text-ink-muted">
              Send this today. Keep it short. Do not over-explain.
            </p>
          </div>

          <div
            data-testid="audit-next-moves"
            className="rounded-lg border border-line-subtle bg-surface-1 p-4"
          >
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Next 3 moves
            </p>
            <ol className="mt-2 space-y-2 text-sm leading-6 text-ink">
              {result.nextThreeMoves.map((move, i) => (
                <li key={move} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand/40 text-[11px] font-black text-brand"
                  >
                    {i + 1}
                  </span>
                  <span>{move}</span>
                </li>
              ))}
            </ol>
          </div>

          <p
            data-testid="audit-sequence-preview"
            className="rounded-lg border-l-2 border-brand bg-surface-1 px-4 py-3 text-sm leading-6 text-ink"
          >
            Quote Reclaim can turn this into a 5-message follow-up sequence so
            the quote does not disappear from your list after one try.
          </p>

          {/* Frames the saved-account product as the depth layer that takes
              over from here — the audit named where to start; Pro keeps each
              quote organized through the full 1/3/7-day cadence so the work
              compounds. No outcome guarantees, no probability claims. */}
          <div
            data-testid="audit-goes-deeper"
            className="rounded-lg border border-brand/30 bg-surface-1 p-4"
          >
            <p className="text-sm font-black uppercase tracking-widest text-brand">
              This audit shows where to start.
            </p>
            <p className="mt-2 text-sm leading-6 text-ink">
              Quote Reclaim goes deeper after you save it: it turns each quiet
              quote into a follow-up sequence, keeps your next steps organized,
              and shows what to send today, in 3 days, and after 7 days — so
              old estimates do not disappear after one try.
            </p>
          </div>

          <div className="space-y-2">
            <a
              href={signupHref}
              data-testid="audit-signup-cta"
              onClick={() => track("audit_signup_clicked", utms)}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-brand bg-brand px-4 py-3 text-base font-semibold text-canvas shadow-[0_0_36px_rgba(217,111,50,0.28)] transition-colors hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Save this audit and run your first 3 quotes free
            </a>
            <p className="text-center text-xs text-ink-muted">No card required.</p>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

function FollowUpOrder({ ranked }: { ranked: RankedAuditQuote[] }) {
  return (
    <div
      data-testid="audit-follow-up-order"
      className="rounded-lg border border-line-subtle bg-surface-1 p-4"
    >
      <p className="text-xs font-black uppercase tracking-widest text-brand">
        Your follow-up order
      </p>
      <ol className="mt-3 space-y-2">
        {ranked.map((q) => (
          <li
            key={q.index}
            data-testid={`audit-rank-row-${q.rank}`}
            className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border bg-surface-2 px-3 py-2 ${
              q.rank === 1 ? "border-brand/40" : "border-line-subtle"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                  q.rank === 1
                    ? "bg-brand text-canvas"
                    : "bg-surface-1 text-ink-muted"
                }`}
              >
                {q.rank}
              </span>
              <p className="text-sm font-bold text-ink-strong">
                Quote #{q.index}
              </p>
              <p className="text-sm tabular-nums text-ink">
                {formatCurrency(q.amount)}
              </p>
              {q.daysSilent != null ? (
                <p className="text-xs text-ink-muted">
                  · {q.daysSilent} days since sent{" "}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                  WINDOW_TONES[q.windowLabel] ?? WINDOW_TONES.Unknown
                }`}
              >
                {q.windowLabel}
              </span>
              <span
                className={`text-xs font-bold ${
                  PRIORITY_TONES[q.priorityLabel] ?? "text-ink-muted"
                }`}
              >
                {q.priorityLabel}
              </span>
            </div>
            {q.windowExplanation && q.rank === 1 ? (
              <p className="basis-full text-xs leading-5 text-ink-muted">
                {q.windowExplanation}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
