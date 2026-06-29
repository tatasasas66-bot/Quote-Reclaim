"use client";

import * as React from "react";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { track } from "@/lib/analytics/track";
import { bucketCurrency, readUtms } from "@/lib/analytics/privacy";
import {
  buildSignupHref,
  describeRecoveryWindow,
  parseDaysSilent,
  parseQuoteAmount,
  runSilentQuoteAudit,
  type AuditResult,
} from "@/lib/audit/silent-quote-audit";
import { resolveTradeConfig, type TradeConfig } from "@/lib/audit/trade-config";
import { AUDIT_HANDOFF_KEY } from "@/lib/onboarding/audit-handoff";
import { AuditResultView } from "./AuditResultView";
import { WINDOW_TONES } from "./audit-presentation";

const ROW_COUNT = 3;
export { AUDIT_HANDOFF_KEY } from "@/lib/onboarding/audit-handoff";
const DEFAULT_SAMPLE_ROWS = [
  { amount: "3200", days: "14" },
  { amount: "5800", days: "24" },
  { amount: "2400", days: "7" },
] as const;

const QUOTE_PROMPTS = [
  "the one that went quiet",
  "the one sitting in limbo",
  "the one you keep meaning to text",
] as const;

export const ANALYSIS_STEPS: readonly string[] = [
  "Counting the money still quiet...",
  "Comparing value against days quiet...",
  "Finding the quote closest to alive...",
  "Putting all three in follow-up order...",
  "Writing the first clean reopen...",
];

export const ANALYSIS_STEP_MS_DEFAULT = 700;
export const ANALYSIS_STEP_MS_REDUCED = 160;

type Row = { amount: string; days: string };

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

export function AuditCalculatorClient() {
  const [rows, setRows] = React.useState<Row[]>(emptyRows);
  const [result, setResult] = React.useState<AuditResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [signupHref, setSignupHref] = React.useState(
    "/sign-up?next=/onboarding/reveal",
  );
  const [utms, setUtms] = React.useState<Record<string, string>>({});
  const [tradeConfig, setTradeConfig] = React.useState<TradeConfig>(
    resolveTradeConfig(null),
  );
  const [analysisStep, setAnalysisStep] = React.useState<number | null>(null);
  const startedRef = React.useRef(false);
  const outputRef = React.useRef<HTMLDivElement | null>(null);
  const timersRef = React.useRef<number[]>([]);
  const analyzing = analysisStep !== null;

  const liveQuotes = rows.map((row, index) => {
    const amount = parseQuoteAmount(row.amount);
    const days = parseDaysSilent(row.days);
    const descriptor = describeRecoveryWindow(days);
    return {
      index: index + 1,
      amount,
      days,
      descriptor,
      hasDaysInput: row.days.trim() !== "",
    };
  });
  const liveTotal = liveQuotes.reduce(
    (total, quote) => total + (quote.amount ?? 0),
    0,
  );
  const enteredCount = liveQuotes.filter((quote) => quote.amount != null).length;

  function clearAnalysisTimers() {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }

  React.useEffect(() => clearAnalysisTimers, []);

  React.useEffect(() => {
    const captured = readUtms(window.location.search);
    setUtms(captured);
    setSignupHref(buildSignupHref(window.location.search));
    const params = new URLSearchParams(window.location.search);
    setTradeConfig(resolveTradeConfig(params.get("utm_trade")));
    track("audit_page_viewed", captured);
  }, []);

  function markStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    track("audit_started", utms);
  }

  function updateRow(index: number, key: keyof Row, value: string) {
    markStarted();
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    );
  }

  function loadSampleRows() {
    markStarted();
    clearAnalysisTimers();
    const samples =
      tradeConfig.sampleRows.length === ROW_COUNT
        ? tradeConfig.sampleRows.map((row) => ({
            amount: row.amount,
            days: row.days,
          }))
        : DEFAULT_SAMPLE_ROWS.map((row) => ({ ...row }));
    setRows(samples);
    setResult(null);
    setError(null);
    setCopied(false);
    setAnalysisStep(null);
  }

  function validateRows(): string | null {
    const hasAmountInput = rows.some((row) => row.amount.trim() !== "");
    const hasValidAmount = rows.some(
      (row) => parseQuoteAmount(row.amount) != null,
    );
    if (!hasAmountInput || !hasValidAmount) {
      return "Enter at least one quiet quote to see your first move.";
    }

    const invalidDays = rows.some(
      (row) =>
        row.days.trim() !== "" && parseDaysSilent(row.days) == null,
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
      { trade: tradeConfig.trade },
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

    for (let index = 1; index < ANALYSIS_STEPS.length; index += 1) {
      timersRef.current.push(
        window.setTimeout(() => setAnalysisStep(index), stepMs * index),
      );
    }

    timersRef.current.push(
      window.setTimeout(() => {
        setAnalysisStep(null);
        setResult(audit);
        try {
          window.sessionStorage.setItem(
            AUDIT_HANDOFF_KEY,
            JSON.stringify({
              trade: tradeConfig.trade,
              quotes: audit.quotes.map((quote) => ({
                name: `Quote #${quote.index}`,
                amount: quote.amount,
                daysSilent: quote.daysSilent ?? 0,
                email: null,
              })),
              priorityIndex: audit.priority?.index ?? null,
              window: audit.priority?.window ?? null,
            }),
          );
        } catch {
          // The audit result remains usable when session storage is blocked.
        }
        track("audit_completed", {
          quote_count: audit.quotes.length,
          has_days_silent: audit.quotes.some((quote) => quote.daysSilent != null),
          total_silent_quote_value_bucket: bucketCurrency(
            audit.totalSilentQuoteValue,
          ),
          priority_band: audit.priorityBandLabel ?? "unknown",
          ...utms,
        });

        try {
          const params = new URLSearchParams(window.location.search);
          const visitorHash = (() => {
            const ledger = (
              window as unknown as { __qrEvents?: Array<{ t: number }> }
            ).__qrEvents;
            const seed =
              ledger && ledger.length > 0 ? ledger[0]!.t : Date.now();
            return String(seed).slice(0, 16);
          })();

          void fetch("/api/admin/auto-marketing/audit-attribution", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              utm_source:
                params.get("utm_source") ?? utms.utm_source ?? null,
              utm_campaign:
                params.get("utm_campaign") ?? utms.utm_campaign ?? null,
              utm_trade: params.get("utm_trade") ?? null,
              utm_city: params.get("utm_city") ?? null,
              visitor_hash: visitorHash,
              audit_completed: true,
              total_quiet_value_bucket: bucketCurrency(
                audit.totalSilentQuoteValue,
              ),
              top_recovery_window: audit.priorityBandLabel ?? null,
            }),
          }).catch(() => undefined);
        } catch {
          // Analytics attribution is best-effort and must never break the audit.
        }
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
      // The message stays visible when clipboard access is unavailable.
    }
  }

  function openMessageInSms() {
    if (!result?.suggestedMessage) return;
    window.open(`sms:?&body=${encodeURIComponent(result.suggestedMessage)}`);
    track("sms_opened", {
      surface: "audit_result",
      quote_n: result.priority?.index ?? null,
      message_type: `${result.priority?.window ?? "unknown"}_recovery`,
      trade: tradeConfig.trade,
      recovery_window: result.priority?.window ?? null,
      quote_amount: result.priority?.amount ?? null,
      days_quiet: result.priority?.daysSilent ?? null,
      ...utms,
    });
    track("audit_open_in_sms_clicked", {
      quote_n: result.priority?.index ?? null,
      ...utms,
    });
  }

  function openMessageInWhatsapp() {
    if (!result?.suggestedMessage) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(result.suggestedMessage)}`,
      "_blank",
      "noopener,noreferrer",
    );
    track("whatsapp_opened", {
      surface: "audit_result",
      quote_n: result.priority?.index ?? null,
      message_type: `${result.priority?.window ?? "unknown"}_recovery`,
      trade: tradeConfig.trade,
      recovery_window: result.priority?.window ?? null,
      quote_amount: result.priority?.amount ?? null,
      days_quiet: result.priority?.daysSilent ?? null,
      ...utms,
    });
  }

  return (
    <div
      id="quote-audit"
      data-audit-state={analyzing ? "analyzing" : result ? "result" : "idle"}
      className="w-full max-w-full min-w-0 scroll-mt-4"
    >
      <section
        data-testid="audit-form-card"
        aria-labelledby="audit-form-title"
        className="w-full max-w-full min-w-0 border border-line-strong bg-canvas shadow-[0_24px_70px_rgba(0,0,0,0.24)]"
      >
        <header className="border-b border-line-strong px-4 py-5 sm:px-6">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                Run the diagnostic
              </div>
              <h2
                id="audit-form-title"
                className="mt-2 max-w-3xl break-words text-2xl font-black leading-tight text-ink-strong sm:text-3xl"
              >
                Pull three old bids from the truck, sent folder, or notebook.
              </h2>
              <p
                id="audit-form-helper"
                className="mt-3 max-w-3xl break-words text-sm leading-6 text-ink-muted"
              >
                Use rough numbers. No customer names. No phone numbers. This is
                not a CRM import. {tradeConfig.bridgeLine}
              </p>
            </div>
            <button
              type="button"
              onClick={loadSampleRows}
              className="inline-flex min-h-10 w-full shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-2 px-4 py-2 text-sm font-bold text-ink-strong transition hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto"
            >
              Load sample quotes
            </button>
          </div>
        </header>

        <form onSubmit={handleSubmit} noValidate className="p-4 sm:p-6">
          <fieldset
            aria-describedby="audit-form-helper"
            className="grid min-w-0 gap-3 lg:grid-cols-3"
          >
            <legend className="sr-only">Enter three quiet quotes</legend>
            {rows.map((row, index) => {
              const liveQuote = liveQuotes[index]!;
              const hasValidWindow =
                liveQuote.amount != null &&
                (!liveQuote.hasDaysInput || liveQuote.days != null);
              const liveWindowLabel =
                liveQuote.hasDaysInput && liveQuote.days != null
                  ? liveQuote.descriptor.label
                  : null;

              return (
                <div
                  key={index}
                  className="w-full max-w-full min-w-0 border border-line-subtle bg-surface-1 p-4"
                >
                  <div className="flex min-h-11 min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-widest text-brand">
                        Quote #{index + 1}
                      </p>
                      <p className="mt-1 break-words text-sm font-semibold leading-5 text-ink">
                        {QUOTE_PROMPTS[index]}
                      </p>
                    </div>
                    {liveWindowLabel && hasValidWindow ? (
                      <span
                        className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                          WINDOW_TONES[liveWindowLabel] ?? WINDOW_TONES.Unknown
                        }`}
                      >
                        {liveWindowLabel}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.6fr)] lg:grid-cols-1">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label
                        htmlFor={`amount-${index}`}
                        className="text-sm font-semibold text-ink"
                      >
                        Quote amount
                      </label>
                      <div className="relative">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-ink-muted"
                        >
                          $
                        </span>
                        <input
                          id={`amount-${index}`}
                          aria-label={`Quote #${index + 1} amount`}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={DEFAULT_SAMPLE_ROWS[index]?.amount ?? "3200"}
                          value={row.amount}
                          onChange={(event) =>
                            updateRow(index, "amount", event.target.value)
                          }
                          className="h-12 w-full max-w-full min-w-0 rounded-lg border border-line-subtle bg-canvas pl-7 pr-3 font-mono text-base text-ink-strong placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
                        />
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label
                        htmlFor={`days-${index}`}
                        className="text-sm font-semibold text-ink"
                      >
                        Days quiet
                      </label>
                      <input
                        id={`days-${index}`}
                        aria-label={`Quote #${index + 1} days quiet`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={DEFAULT_SAMPLE_ROWS[index]?.days ?? "14"}
                        value={row.days}
                        onChange={(event) =>
                          updateRow(index, "days", event.target.value)
                        }
                        className="h-12 w-full max-w-full min-w-0 rounded-lg border border-line-subtle bg-canvas px-3 font-mono text-base text-ink-strong placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </fieldset>

          <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line-subtle bg-line-subtle md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div
              data-testid="audit-live-total"
              aria-live="polite"
              className="min-w-0 bg-surface-2 p-4"
            >
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-ink-muted">
                <Banknote className="h-4 w-4 text-money" aria-hidden="true" />
                Money still quiet
              </div>
              <p className="mt-2 break-words font-mono text-3xl font-black text-money">
                {formatCurrency(liveTotal)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {enteredCount} of 3 quote amounts entered
              </p>
              {enteredCount < ROW_COUNT ? (
                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  One quote is enough for a recovery move. Two or three make the
                  ranking sharper.
                </p>
              ) : null}
            </div>
            <div className="min-w-0 bg-surface-1 p-4">
              <p className="text-sm font-black text-ink-strong">
                You already paid to create these quotes.
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                This check tells you which quote to follow up first. Rough
                numbers are enough.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-success">
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                Quote amounts stay in this diagnostic. Analytics only receives
                a broad value bucket.
              </div>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              aria-live="polite"
              className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.55fr)] lg:items-center">
            <div className="min-w-0">
              <p className="max-w-full whitespace-normal break-words text-sm leading-6 text-ink-muted">
                {tradeConfig.exampleLine}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                No perfect inputs needed. No customer data. Result first.
              </p>
            </div>
            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={analyzing}
              disabled={analyzing}
              data-testid="audit-submit"
              className="h-auto min-h-14 whitespace-normal px-4 py-3 text-center text-base font-black leading-tight sm:text-lg"
            >
              {analyzing ? (
                "Finding the first move..."
              ) : (
                <>
                  <span className="min-w-0">
                    Show me which quote to text first
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </form>
      </section>

      <div
        ref={outputRef}
        className="mt-6 min-w-0 max-w-full scroll-mt-4 empty:hidden"
      >
        {analyzing ? (
          <div
            data-testid="audit-analysis"
            role="status"
            aria-live="polite"
            className="w-full max-w-full min-w-0 border border-line-strong bg-canvas p-5 sm:p-7"
          >
            <div className="flex items-center gap-3">
              <Loader2
                className="h-5 w-5 shrink-0 animate-spin text-brand"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-brand">
                  Silent quote diagnostic
                </p>
                <p
                  data-testid="audit-analysis-step"
                  className="mt-1 break-words text-lg font-black text-ink-strong"
                >
                  {ANALYSIS_STEPS[analysisStep ?? 0]}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {ANALYSIS_STEPS.map((step, index) => (
                <span
                  key={step}
                  className={`h-1.5 rounded-full ${
                    index <= (analysisStep ?? 0) ? "bg-brand" : "bg-surface-3"
                  }`}
                />
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              Using only quote amount, days quiet, and your selected trade.
            </p>
          </div>
        ) : result ? (
          <AuditResultView
            result={result}
            copied={copied}
            signupHref={signupHref}
            tradeConfig={tradeConfig}
            onCopy={copyMessage}
            onOpenSms={openMessageInSms}
            onOpenWhatsapp={openMessageInWhatsapp}
            onReplyBranchUnlock={(branch) =>
              track("audit_reply_branch_unlock_clicked", {
                branch,
                ...utms,
              })
            }
            onFollowUpUnlock={() =>
              track("audit_follow_up_unlock_clicked", utms)
            }
            onResultCtaClick={({ quoteN, window, daysUntilCold }) =>
              track("audit_result_cta_clicked", {
                quote_n: quoteN,
                window,
                days_until_cold: daysUntilCold,
                ...utms,
              })
            }
            onFaqExpanded={(questionId) =>
              track("audit_faq_expanded", {
                question_id: questionId,
                ...utms,
              })
            }
            onSignupClick={() => track("audit_signup_clicked", utms)}
          />
        ) : null}
      </div>
    </div>
  );
}
