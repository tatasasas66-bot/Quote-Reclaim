import {
  ArrowRight,
  BarChart3,
  Check,
  Clipboard,
  FileClock,
  Gauge,
  MessageCircleReply,
  MessageSquareText,
  Route,
  ShieldCheck,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import type {
  AuditResult,
  RecoveryWindow,
} from "@/lib/audit/silent-quote-audit";
import type { TradeConfig } from "@/lib/audit/trade-config";
import { AuditFollowUpOrder } from "./AuditFollowUpOrder";
import { AuditReplyPlaybook } from "./AuditReplyPlaybook";
import {
  directiveForWindow,
  nextFollowupForWindow,
  WINDOW_DEFINITIONS,
  WINDOW_TONES,
} from "./audit-presentation";

const SILENCE_REASONS = [
  "Budget hesitation",
  "Waiting on a spouse",
  "Comparing bids",
  "Scope confusion",
  "Bad timing",
  "Avoiding the awkward no",
] as const;

const PRODUCT_PREVIEW = [
  {
    name: "Silent Quote Command",
    body: "The next quote worth working is already at the top.",
    icon: Gauge,
  },
  {
    name: "Recovery Sequence",
    body: "A clear follow-up order instead of repeating the same text.",
    icon: Route,
  },
  {
    name: "Reply Playbook",
    body: "Price, timing, scope, and no each get a different next move.",
    icon: MessageSquareText,
  },
  {
    name: "One-Tap Reply",
    body: "Make it easier for the homeowner to answer without a long explanation.",
    icon: MessageCircleReply,
  },
  {
    name: "Got the Job",
    body: "Mark the result and keep closed work out of the chase list.",
    icon: Check,
  },
  {
    name: "Monthly Recovery Report",
    body: "See what was worked, reopened, booked, paused, or closed.",
    icon: BarChart3,
  },
] as const;

type AuditResultViewProps = {
  result: AuditResult;
  copied: boolean;
  signupHref: string;
  tradeConfig: TradeConfig;
  onCopy: () => void;
  onSignupClick: () => void;
};

export function AuditResultView({
  result,
  copied,
  signupHref,
  tradeConfig,
  onCopy,
  onSignupClick,
}: AuditResultViewProps) {
  const priority = result.priority;
  const windowLabel = priority?.windowLabel ?? "Unknown";
  const window = priority?.window ?? "unknown";
  const nextFollowup = nextFollowupForWindow(window);

  return (
    <article
      data-testid="audit-result"
      role="region"
      aria-label="Your silent quote recovery diagnostic"
      className="w-full max-w-full min-w-0 border border-brand/45 bg-surface-2 shadow-[0_28px_90px_rgba(0,0,0,0.34)]"
    >
      <header className="border-b border-line-strong bg-canvas px-4 py-6 sm:px-7">
        <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-success">
              {tradeConfig.resultEyebrow}
            </p>
            <h2 className="mt-2 max-w-3xl break-words text-3xl font-black leading-tight text-ink-strong sm:text-4xl">
              Your first move is clear.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">
              This is a prioritization report, not a recovery promise. It turns
              three quiet quotes into one next action.
            </p>
          </div>
          <div
            data-testid="audit-input-recap"
            className="flex min-w-0 flex-wrap gap-2"
          >
            {result.rankedQuotes.map((quote) => (
              <span
                key={quote.index}
                className="inline-flex items-center gap-2 rounded-full border border-line-subtle bg-surface-2 px-3 py-1.5 text-xs"
              >
                <span className="font-bold text-ink-strong">#{quote.index}</span>
                <span className="font-mono text-money">
                  {formatCurrency(quote.amount)}
                </span>
                {quote.daysSilent != null ? (
                  <span className="text-ink-muted">{quote.daysSilent}d</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-7">
        <section
          aria-labelledby="quiet-money-title"
          className="grid gap-px overflow-hidden rounded-lg border border-line-subtle bg-line-subtle lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]"
        >
          <div className="min-w-0 bg-surface-1 p-5 sm:p-6">
            <p
              id="quiet-money-title"
              className="text-xs font-black uppercase tracking-widest text-ink-muted"
            >
              Money still quiet
            </p>
            <p className="mt-3 break-words font-mono text-4xl font-black leading-none text-money sm:text-5xl">
              {formatCurrency(result.totalSilentQuoteValue)}
            </p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-ink-muted">
              You already paid for the gas, drive, measure, pricing, and time
              behind these quotes.
            </p>
          </div>

          {priority ? (
            <div
              data-testid="audit-start-here"
              className="min-w-0 bg-brand/10 p-5 sm:p-6"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-widest text-brand">
                  The first quote to reopen
                </p>
                <span className="rounded-full border border-brand/45 bg-brand/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-brand">
                  {directiveForWindow(priority.window)}
                </span>
              </div>
              <div className="mt-4 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-2xl font-black text-ink-strong">
                    Start with Quote #{priority.index}
                  </p>
                  <p className="mt-2 font-mono text-4xl font-black text-ink-strong">
                    {formatCurrency(priority.amount)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-ink-muted">
                  <span>
                    {priority.daysSilent != null
                      ? `${priority.daysSilent} days quiet`
                      : "Days quiet not entered"}
                  </span>
                  <span
                    data-testid="audit-start-window-badge"
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                      WINDOW_TONES[windowLabel] ?? WINDOW_TONES.Unknown
                    }`}
                  >
                    {windowLabel}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {priority ? (
          <section
            data-testid="audit-why-order"
            className="grid gap-6 border-t border-line-strong pt-7 lg:grid-cols-2"
          >
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                Why this one first
              </p>
              <h3 className="mt-2 text-2xl font-black text-ink-strong">
                The amount is worth the text. The timing still gives it a path.
              </h3>
              <p className="mt-4 break-words text-base leading-7 text-ink">
                {result.priorityReason}
              </p>
              {result.whyNotOthers.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm leading-6 text-ink-muted">
                  {result.whyNotOthers.map((reason) => (
                    <li key={reason} className="flex items-start gap-2">
                      <ArrowRight
                        className="mt-1 h-4 w-4 shrink-0 text-brand"
                        aria-hidden="true"
                      />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="min-w-0 border-l border-line-strong pl-5 sm:pl-7">
              <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
                Recovery window
              </p>
              <p className="mt-2 text-3xl font-black text-ink-strong">
                {windowLabel}
              </p>
              <p className="mt-3 text-base leading-7 text-ink">
                {WINDOW_DEFINITIONS[windowLabel] ?? WINDOW_DEFINITIONS.Unknown}
              </p>
              <p className="mt-4 text-sm leading-6 text-ink-muted">
                This label only reflects how long the quote has been quiet. It
                does not claim to know whether the job will come back.
              </p>
            </div>
          </section>
        ) : null}

        <section
          aria-labelledby="silence-meaning-title"
          className="border-t border-line-strong pt-7"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                What the silence probably means
              </p>
              <h3
                id="silence-meaning-title"
                className="mt-2 text-2xl font-black text-ink-strong"
              >
                Quiet is an unanswered question, not proof of a hard no.
              </h3>
              <p className="mt-3 text-sm leading-6 text-ink-muted">
                No software can know for sure. The point is to send a message
                that makes replying easier.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SILENCE_REASONS.map((reason) => (
                <div
                  key={reason}
                  className="flex min-h-20 min-w-0 items-center border border-line-subtle bg-surface-1 px-3 py-3 text-sm font-bold leading-5 text-ink"
                >
                  <span className="break-words">{reason}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="message-today-title"
          className="border-t border-line-strong pt-7"
        >
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                Message to send today
              </p>
              <h3
                id="message-today-title"
                className="mt-2 text-2xl font-black text-ink-strong"
              >
                Give them an easier answer than silence.
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                Not &quot;just checking in.&quot; This message gives the
                homeowner a low-pressure way to name the actual holdup.
              </p>
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-brand/50 bg-brand/10 px-4 py-2 text-sm font-black text-brand transition hover:bg-brand/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Clipboard className="h-4 w-4" aria-hidden="true" />
                  Copy message
                </>
              )}
            </button>
          </div>

          <div className="mt-5 border-l-4 border-brand bg-canvas px-4 py-5 sm:px-6">
            <p className="max-w-3xl whitespace-pre-wrap break-words text-base font-semibold leading-8 text-ink-strong">
              {result.suggestedMessage}
            </p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 border border-line-subtle bg-surface-1 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
                Why this message
              </p>
              <p className="mt-2 text-sm leading-6 text-ink">
                {result.whyThisMessage}{" "}
                {lowPressureReasonForWindow(priority?.window)}
              </p>
            </div>
            <div className="min-w-0 border border-line-subtle bg-surface-1 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
                Easy reply paths
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.oneTapOptions.map((option) => (
                  <span
                    key={option}
                    className="rounded-full border border-success/30 bg-success/5 px-2.5 py-1 text-xs font-semibold text-success"
                  >
                    {option}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          data-testid="audit-next-moves"
          aria-labelledby="next-followup-title"
          className="border-t border-line-strong pt-7"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                If it stays quiet
              </p>
              <h3
                id="next-followup-title"
                className="mt-2 text-2xl font-black text-ink-strong"
              >
                Follow up once more. Then stop chasing.
              </h3>
              <ol className="mt-4 space-y-2">
                {result.nextThreeMoves.map((move, index) => (
                  <li
                    key={move}
                    className="flex items-start gap-3 text-sm leading-6 text-ink"
                  >
                    <span className="font-mono font-black text-money">
                      {index + 1}
                    </span>
                    <span>{move}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="min-w-0 border border-line-subtle bg-canvas p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
                Follow-up to send next
              </p>
              <p className="mt-3 whitespace-pre-wrap break-words text-base font-semibold leading-7 text-ink-strong">
                {nextFollowup}
              </p>
            </div>
          </div>
        </section>

        <AuditFollowUpOrder ranked={result.rankedQuotes} />
        <AuditReplyPlaybook />

        <section
          data-testid="audit-product-preview"
          aria-labelledby="product-preview-title"
          className="border-t border-line-strong pt-7"
        >
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                What this looks like inside Quote Reclaim
              </p>
              <h3
                id="product-preview-title"
                className="mt-2 max-w-3xl text-2xl font-black text-ink-strong"
              >
                Every quiet quote gets a next move, not a guess.
              </h3>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line-subtle bg-surface-1 px-3 py-1.5 text-xs font-bold text-ink-muted">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
              Sample preview, not customer data
            </span>
          </div>

          <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line-subtle bg-line-subtle sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_PREVIEW.map(({ name, body, icon: Icon }) => (
              <div key={name} className="min-w-0 bg-surface-1 p-5">
                <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
                <h4 className="mt-4 font-black text-ink-strong">{name}</h4>
                <p className="mt-2 break-words text-sm leading-6 text-ink-muted">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          data-testid="audit-goes-deeper"
          className="mt-7 border border-brand/45 bg-brand/10 p-5 sm:p-7"
        >
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                You found the first quote
              </p>
              <h3 className="mt-2 max-w-3xl break-words text-2xl font-black leading-tight text-ink-strong sm:text-3xl">
                Quote Reclaim keeps the rest from going quiet.
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink">
                Save this recovery plan, work the follow-up order, and know what
                to do when the homeowner answers. First 3 estimates are free.
              </p>
            </div>
            <a
              href={signupHref}
              data-testid="audit-signup-cta"
              onClick={onSignupClick}
              className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-5 py-3 text-center text-base font-black leading-tight text-canvas transition-colors hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas lg:w-auto"
            >
              Turn this into a follow-up system
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted lg:justify-end">
            <FileClock className="h-4 w-4" aria-hidden="true" />
            No card required. Nothing is sent without you.
          </p>
        </section>
      </div>
    </article>
  );
}

function lowPressureReasonForWindow(
  window: RecoveryWindow | undefined,
): string {
  switch (window) {
    case "warm":
      return "It asks one easy question instead of forcing a decision.";
    case "cooling":
      return "It gives the homeowner clear ways to answer: timing, budget, scope, or comparison.";
    case "cold":
      return "It avoids pressure and gives a simple open, revise, or close path.";
    case "closeout":
      return "It removes the awkwardness of saying no while leaving the door open.";
    default:
      return "It asks a specific question instead of asking for a vague update.";
  }
}
