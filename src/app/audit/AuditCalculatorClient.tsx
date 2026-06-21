"use client";

import * as React from "react";
import { ArrowRight, Check, Clipboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { track } from "@/lib/analytics/track";
import { bucketCurrency, readUtms } from "@/lib/analytics/privacy";
import {
  buildSignupHref,
  parseDaysSilent,
  parseQuoteAmount,
  runSilentQuoteAudit,
  type AuditResult,
  type RankedAuditQuote,
} from "@/lib/audit/silent-quote-audit";

const ROW_COUNT = 3;
const SAMPLE_ROWS = [
  { amount: "3200", days: "14" },
  { amount: "5800", days: "24" },
  { amount: "2400", days: "7" },
] as const;

/**
 * Honest analysis steps shown between submit and result render. Each line names
 * a thing the audit actually computed. No fake server work, no fake AI magic.
 */
export const ANALYSIS_STEPS: readonly string[] = [
  "Totaling your quiet estimates...",
  "Scoring by value and days quiet...",
  "Finding the estimate to follow up first...",
  "Building your follow-up order...",
  "Preparing the message to send today...",
];

/** Default per-step duration: 700ms x 5 steps = 3.5s total. */
export const ANALYSIS_STEP_MS_DEFAULT = 700;
/** Reduced-motion per-step duration: 160ms x 5 steps = 800ms total. */
export const ANALYSIS_STEP_MS_REDUCED = 160;

type Row = { amount: string; days: string };

const WINDOW_TONES: Record<string, string> = {
  Warm: "border-success/40 bg-success/10 text-success",
  Cooling: "border-warning/40 bg-warning/10 text-warning",
  Cold: "border-danger/40 bg-danger/10 text-danger",
  Unknown: "border-line-subtle bg-surface-2 text-ink-muted",
};

const WINDOW_DEFINITIONS: Record<string, string> = {
  Warm: "Recent enough for a direct, simple follow-up.",
  Cooling: "Worth reopening now before it gets harder to restart.",
  Cold: "Use a lighter check-in. Still worth testing, but expect lower response.",
  Unknown: "Add days quiet when you know them for a clearer window.",
};

function emptyRows(): Row[] {
  return Array.from({ length: ROW_COUNT }, () => ({ amount: "", days: "" }));
}

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

function actionForRank(q: RankedAuditQuote): string {
  if (q.rank === 1) return "Send today";
  if (q.rank === 2) return "Follow up next";
  return q.window === "cold" ? "Use lighter check-in" : "Check after the first";
}

export function AuditCalculatorClient() {
  const [rows, setRows] = React.useState<Row[]>(emptyRows);
  const [result, setResult] = React.useState<AuditResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [signupHref, setSignupHref] = React.useState(
    "/sign-up?next=/onboarding/reveal",
  );
  const [utms, setUtms] = React.useState<Record<string, string>>({});
  const startedRef = React.useRef(false);
  const outputRef = React.useRef<HTMLDivElement | null>(null);
  const [analysisStep, setAnalysisStep] = React.useState<number | null>(null);
  const analyzing = analysisStep !== null;
  const timersRef = React.useRef<number[]>([]);

  function clearAnalysisTimers() {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }

  React.useEffect(() => clearAnalysisTimers, []);

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

  function loadSampleRows() {
    markStarted();
    clearAnalysisTimers();
    setRows(SAMPLE_ROWS.map((row) => ({ ...row })));
    setResult(null);
    setError(null);
    setCopied(false);
    setAnalysisStep(null);
  }

  function validateRows(): string | null {
    const hasAmountInput = rows.some((row) => row.amount.trim() !== "");
    const hasValidAmount = rows.some((row) => parseQuoteAmount(row.amount) != null);
    if (!hasAmountInput || !hasValidAmount) return "Enter an estimate amount.";

    const invalidDays = rows.some(
      (row) => row.days.trim() !== "" && parseDaysSilent(row.days) == null,
    );
    if (invalidDays) return "Use numbers only for days quiet.";

    return null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analyzing) return;

    const validationError = validateRows();
    if (validationError) {
      clearAnalysisTimers();
      setAnalysisStep(null);
      setResult(null);
      setError(validationError);
      return;
    }

    const audit = runSilentQuoteAudit(
      rows.map((row) => ({
        amountRaw: row.amount,
        daysSilentRaw: row.days,
      })),
    );
    if (audit.error) {
      clearAnalysisTimers();
      setAnalysisStep(null);
      setResult(null);
      setError(audit.error);
      return;
    }

    const reduced = prefersReducedMotion();
    const stepMs = reduced
      ? ANALYSIS_STEP_MS_REDUCED
      : ANALYSIS_STEP_MS_DEFAULT;

    clearAnalysisTimers();
    setError(null);
    setResult(null);
    setCopied(false);
    setAnalysisStep(0);

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
        track("audit_completed", {
          quote_count: audit.quotes.length,
          has_days_silent: audit.quotes.some((q) => q.daysSilent != null),
          total_silent_quote_value_bucket: bucketCurrency(
            audit.totalSilentQuoteValue,
          ),
          priority_band: audit.priorityBandLabel ?? "unknown",
          ...utms,
        });
      }, stepMs * ANALYSIS_STEPS.length),
    );
  }

  async function copyMessage() {
    if (!result?.suggestedMessage) return;
    try {
      await navigator.clipboard?.writeText(result.suggestedMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the message is visible to copy by hand.
    }
  }

  return (
    <div
      id="quote-audit"
      data-audit-state={analyzing ? "analyzing" : result ? "result" : "idle"}
      className="w-full max-w-full min-w-0 space-y-5 scroll-mt-6 data-[audit-state=result]:lg:mx-auto data-[audit-state=result]:lg:max-w-3xl data-[audit-state=analyzing]:lg:mx-auto data-[audit-state=analyzing]:lg:max-w-3xl"
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        data-testid="audit-form-card"
        className="w-full max-w-full min-w-0 rounded-2xl border border-line-strong/50 bg-surface-1/95 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-5"
      >
        <div className="mb-4 min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Run a 60-second estimate audit
          </p>
          <h2 className="mt-2 break-words text-2xl font-black leading-tight text-ink-strong">
            Find the estimate worth following up first.
          </h2>
          <p
            id="audit-form-helper"
            className="mt-2 max-w-full break-words text-sm leading-6 text-ink-muted"
          >
            Use estimates you already sent and have not heard back on. Rough
            numbers are fine — this is a priority check, not accounting.
          </p>
        </div>

        <fieldset
          aria-describedby="audit-form-helper"
          className="min-w-0 space-y-3"
        >
          <legend className="sr-only">Enter three quiet estimates</legend>
          {rows.map((row, i) => (
            <div
              key={i}
              className="w-full max-w-full min-w-0 rounded-xl border border-line-subtle bg-surface-2/90 p-3"
            >
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-ink-muted">
                Estimate {i + 1}
              </p>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.55fr)]">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label
                    htmlFor={`amount-${i}`}
                    className="text-sm font-semibold text-ink"
                  >
                    Estimate amount
                  </label>
                  <input
                    id={`amount-${i}`}
                    aria-label={`Estimate #${i + 1} amount`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={SAMPLE_ROWS[i]?.amount ?? "3200"}
                    value={row.amount}
                    onChange={(e) => updateRow(i, "amount", e.target.value)}
                    className="h-12 w-full max-w-full min-w-0 rounded-lg border border-line-subtle bg-canvas px-3 text-base text-ink-strong placeholder:font-normal placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label
                    htmlFor={`days-${i}`}
                    className="text-sm font-semibold text-ink"
                  >
                    Days quiet
                  </label>
                  <input
                    id={`days-${i}`}
                    aria-label={`Estimate #${i + 1} days quiet`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={SAMPLE_ROWS[i]?.days ?? "14"}
                    value={row.days}
                    onChange={(e) => updateRow(i, "days", e.target.value)}
                    className="h-12 w-full max-w-full min-w-0 rounded-lg border border-line-subtle bg-canvas px-3 text-base text-ink-strong placeholder:font-normal placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
                  />
                </div>
              </div>
            </div>
          ))}
        </fieldset>

        {error ? (
          <p
            role="alert"
            aria-live="polite"
            className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-4 w-full max-w-full rounded-xl border border-line-subtle bg-canvas p-3 text-sm leading-6 text-ink-muted">
          <p className="max-w-full whitespace-normal break-words">
            Example: $3,200 quiet for 14 days, $5,800 quiet for 24 days,
            $2,400 quiet for 7 days.
          </p>
          <button
            type="button"
            onClick={loadSampleRows}
            className="mt-2 text-sm font-bold text-brand transition hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Try sample numbers
          </button>
        </div>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={analyzing}
          disabled={analyzing}
          data-testid="audit-submit"
          className="mt-4 h-auto min-h-12 whitespace-normal px-4 py-3 text-center text-base leading-tight sm:text-lg"
        >
          {analyzing ? (
            "Auditing..."
          ) : (
            <>
              <span className="min-w-0">
                Show me which estimate to follow up first
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </Button>

        <p className="mt-3 max-w-full break-words text-center text-xs leading-5 text-ink-muted">
          No customer names. No phone numbers. No card. No signup before result.
        </p>
      </form>

      <div
        ref={outputRef}
        className="min-w-0 max-w-full scroll-mt-4 empty:hidden"
      >
        {analyzing ? (
          <div
            data-testid="audit-analysis"
            role="status"
            aria-live="polite"
            className="w-full max-w-full min-w-0 rounded-2xl border border-line-subtle bg-surface-1 p-4 sm:p-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Loader2
                className="h-5 w-5 shrink-0 animate-spin text-brand motion-reduce:animate-none"
                aria-hidden="true"
              />
              <p
                data-testid="audit-analysis-step"
                className="min-w-0 break-words text-sm font-semibold text-ink-strong"
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
          <AuditResultView
            result={result}
            copied={copied}
            signupHref={signupHref}
            utms={utms}
            onCopy={copyMessage}
          />
        ) : null}
      </div>
    </div>
  );
}

function AuditResultView({
  result,
  copied,
  signupHref,
  utms,
  onCopy,
}: {
  result: AuditResult;
  copied: boolean;
  signupHref: string;
  utms: Record<string, string>;
  onCopy: () => void;
}) {
  const priority = result.priority;
  const windowLabel = priority?.windowLabel ?? "Unknown";

  return (
    <div
      data-testid="audit-result"
      role="region"
      aria-label="Your estimate audit result"
      className="w-full max-w-full min-w-0 space-y-4 rounded-2xl border border-brand/45 bg-[linear-gradient(180deg,rgba(217,111,50,0.08),rgba(24,28,34,0.98))] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.34)] sm:p-6"
    >
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-widest text-success">
          Your 60-second estimate audit
        </p>
        <h2 className="mt-2 break-words text-2xl font-black leading-tight text-ink-strong">
          Here is what to do today.
        </h2>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
            Total quiet estimate value
          </p>
          <p className="mt-2 whitespace-nowrap text-3xl font-black leading-none text-money sm:text-5xl">
            {formatCurrency(result.totalSilentQuoteValue)}
          </p>
          <p className="mt-3 break-words text-sm leading-6 text-ink-muted">
            This is the value sitting in the estimates you entered.
          </p>
        </section>

        {priority ? (
          <section
            data-testid="audit-start-here"
            className="min-w-0 rounded-xl border border-brand/30 bg-brand/10 p-4"
          >
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Follow up this estimate first
            </p>
            <p className="mt-2 break-words text-xl font-black text-ink-strong">
              Start with Estimate #{priority.index}
            </p>
            <p className="mt-1 whitespace-nowrap text-3xl font-black text-ink-strong">
              {formatCurrency(priority.amount)}
            </p>
            <p className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm text-ink-muted">
              {priority.daysSilent != null ? (
                <span>{priority.daysSilent} days quiet</span>
              ) : (
                <span>Days quiet not entered</span>
              )}
              <span aria-hidden="true" className="text-ink-muted">
                -
              </span>
              <span
                data-testid="audit-start-window-badge"
                className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                  WINDOW_TONES[windowLabel] ?? WINDOW_TONES.Unknown
                }`}
              >
                {windowLabel}
              </span>
            </p>
          </section>
        ) : null}
      </div>

      {priority ? (
        <section className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
              Recovery window
            </p>
            <p className="mt-2 text-lg font-black text-ink-strong">
              {windowLabel}
            </p>
            <p className="mt-2 break-words text-sm leading-6 text-ink-muted">
              {WINDOW_DEFINITIONS[windowLabel] ?? WINDOW_DEFINITIONS.Unknown}
            </p>
          </div>

          <div
            data-testid="audit-why-order"
            className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-4"
          >
            <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
              Why this one first
            </p>
            <p className="mt-2 break-words text-sm leading-6 text-ink">
              We ranked this estimate using amount and days quiet.{" "}
              {result.priorityReason}
            </p>
          </div>
        </section>
      ) : null}

      <section className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Message to send today
            </p>
            <p className="mt-1 break-words text-sm text-ink-muted">
              Short, professional, and easy for the customer to answer.
            </p>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex w-full shrink-0 items-center justify-center gap-1 rounded-lg border border-line-subtle bg-surface-2 px-3 py-2 text-sm font-bold text-ink-strong transition hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-success" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Clipboard className="h-4 w-4 text-brand" aria-hidden="true" />
                Copy
              </>
            )}
          </button>
        </div>
        <p className="mt-4 max-w-full whitespace-pre-wrap break-words rounded-xl border border-line-subtle bg-canvas p-4 text-base font-semibold leading-7 text-ink-strong">
          {result.suggestedMessage}
        </p>
      </section>

      <FollowUpOrder ranked={result.rankedQuotes} />

      <section
        data-testid="audit-next-moves"
        className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-4"
      >
        <p className="text-xs font-black uppercase tracking-widest text-brand">
          Next move
        </p>
        <p className="mt-2 break-words text-sm leading-6 text-ink">
          Send the message to the first estimate today. Then check the next
          estimate in the order above.
        </p>
      </section>

      <section
        data-testid="audit-sequence-preview"
        className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-4"
      >
        <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
          If you save the plan
        </p>
        <p className="mt-2 break-words text-sm leading-6 text-ink">
          Quote Reclaim keeps the follow-up order in one place and turns quiet
          estimates into a 5-message recovery sequence you can work through.
        </p>
      </section>

      <section
        data-testid="audit-goes-deeper"
        className="min-w-0 space-y-3 rounded-xl border border-brand/35 bg-brand/10 p-4"
      >
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Save this recovery plan
          </p>
          <p className="mt-2 break-words text-sm leading-6 text-ink">
            Create an account to track more estimates, save messages, and keep
            your follow-up order in one place.
          </p>
          <p className="mt-2 text-sm font-bold text-ink-strong">
            First 3 estimates are free.
          </p>
        </div>
        <a
          href={signupHref}
          data-testid="audit-signup-cta"
          onClick={() => track("audit_signup_clicked", utms)}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-4 py-3 text-center text-base font-semibold leading-tight text-canvas shadow-[0_0_36px_rgba(217,111,50,0.28)] transition-colors hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          Save this recovery plan
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
        <p className="text-center text-xs text-ink-muted">No card required.</p>
      </section>
    </div>
  );
}

function FollowUpOrder({ ranked }: { ranked: RankedAuditQuote[] }) {
  return (
    <section
      data-testid="audit-follow-up-order"
      className="min-w-0 rounded-xl border border-line-subtle bg-surface-1 p-4"
    >
      <p className="text-xs font-black uppercase tracking-widest text-brand">
        Follow-up order
      </p>
      <ol className="mt-3 min-w-0 space-y-2">
        {ranked.map((q) => (
          <li
            key={q.index}
            data-testid={`audit-rank-row-${q.rank}`}
            className={`min-w-0 rounded-lg border bg-surface-2 p-3 ${
              q.rank === 1 ? "border-brand/45" : "border-line-subtle"
            }`}
          >
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                    q.rank === 1
                      ? "bg-brand text-canvas"
                      : "bg-surface-1 text-ink-muted"
                  }`}
                >
                  {q.rank}
                </span>
                <div className="min-w-0">
                  <p className="break-words text-sm font-black text-ink-strong">
                    Estimate #{q.index} - {formatCurrency(q.amount)}
                  </p>
                  <p className="break-words text-xs text-ink-muted">
                    {q.daysSilent != null
                      ? `${q.daysSilent} days quiet`
                      : "Days quiet not entered"}
                    <span className="sr-only"> - </span>
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                    WINDOW_TONES[q.windowLabel] ?? WINDOW_TONES.Unknown
                  }`}
                >
                  {q.windowLabel}
                </span>
                <span className="break-words text-xs font-black uppercase tracking-widest text-brand">
                  {actionForRank(q)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
