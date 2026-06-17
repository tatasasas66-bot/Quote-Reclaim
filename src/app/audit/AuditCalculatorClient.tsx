"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { track } from "@/lib/analytics/track";
import { bucketCurrency, readUtms } from "@/lib/analytics/privacy";
import {
  buildSignupHref,
  runSilentQuoteAudit,
  type AuditResult,
} from "@/lib/audit/silent-quote-audit";

const ROW_COUNT = 3;

type Row = { amount: string; days: string };

function emptyRows(): Row[] {
  return Array.from({ length: ROW_COUNT }, () => ({ amount: "", days: "" }));
}

export function AuditCalculatorClient() {
  const [rows, setRows] = React.useState<Row[]>(emptyRows);
  const [result, setResult] = React.useState<AuditResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const startedRef = React.useRef(false);
  const [signupHref, setSignupHref] = React.useState("/sign-up?next=/onboarding/reveal");
  const [utms, setUtms] = React.useState<Record<string, string>>({});
  const resultRef = React.useRef<HTMLDivElement | null>(null);

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
    const audit = runSilentQuoteAudit(
      rows.map((r) => ({ amountRaw: r.amount, daysSilentRaw: r.days })),
    );
    if (audit.error) {
      setResult(null);
      setError(audit.error);
      return;
    }
    setError(null);
    setResult(audit);
    setCopied(false);
    track("audit_completed", {
      // PRIVACY: never send raw dollar amounts. We bucket the total into a
      // coarse range and report counts/flags only — never the customer's
      // quote values, names, or any input string.
      quote_count: audit.quotes.length,
      has_days_silent: audit.quotes.some((q) => q.daysSilent != null),
      total_silent_quote_value_bucket: bucketCurrency(
        audit.totalSilentQuoteValue,
      ),
      priority_band: audit.priorityBandLabel ?? "unknown",
      ...utms,
    });
    // Bring the result into view on mobile without a heavy scroll library.
    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
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
          <legend className="sr-only">Your three oldest silent painting quotes</legend>
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

        <Button type="submit" fullWidth size="lg" data-testid="audit-submit">
          Show me which quote to chase first →
        </Button>

        <p className="text-center text-xs text-ink-muted">
          First 3 free. No signup until you see the result. No card.
        </p>
        <p className="text-center text-xs text-ink-muted">
          You enter your own numbers — we don&apos;t need customer names for the
          audit.
        </p>
      </form>

      {result && !result.error ? (
        <div
          ref={resultRef}
          data-testid="audit-result"
          role="region"
          aria-label="Your silent quote audit"
          className="space-y-5 rounded-xl border border-brand/30 bg-surface-2 p-5 sm:p-6"
        >
          <div>
            <p className="text-3xl font-black leading-tight text-ink-strong sm:text-4xl">
              <span className="tabular-nums text-money">
                {formatCurrency(result.totalSilentQuoteValue)}
              </span>{" "}
              sitting in your quiet quotes.
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              Across {result.quotes.length} old painting{" "}
              {result.quotes.length === 1 ? "quote" : "quotes"} that went quiet.
            </p>
          </div>

          {result.priority ? (
            <div className="rounded-lg border border-line-subtle bg-surface-1 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                Start here
              </p>
              <p className="mt-1 text-lg font-bold text-ink-strong">
                Start with Quote #{result.priority.index} —{" "}
                <span className="tabular-nums">
                  {formatCurrency(result.priority.amount)}
                </span>
                {result.priority.daysSilent != null ? (
                  <>
                    {" "}
                    — {result.priority.daysSilent} days since sent
                  </>
                ) : null}
                {result.priorityBandLabel ? (
                  <span className="ml-2 text-xs font-black uppercase tracking-widest text-warning">
                    {result.priorityBandLabel}
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                <span className="font-semibold text-ink">
                  Why this quote first.
                </span>{" "}
                {result.priorityReason}
              </p>
            </div>
          ) : null}

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
  );
}
