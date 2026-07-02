import {
  ArrowRight,
  BadgeCheck,
  Check,
  Clipboard,
  Clock3,
  FileClock,
  LockKeyhole,
  MessageCircleReply,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import type {
  AuditResult,
  RecoveryWindow,
} from "@/lib/audit/silent-quote-audit";
import type { TradeConfig } from "@/lib/audit/trade-config";
import { AuditFaq } from "./AuditFaq";
import { AuditFollowUpOrder } from "./AuditFollowUpOrder";
import { AuditReplyPlaybook } from "./AuditReplyPlaybook";
import {
  appendAuditSignupReason,
  buildAuditResultCta,
  capitalizeDisplayMessage,
  directiveForWindow,
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

const CONTINUATION_TIMELINE = [
  {
    when: "Today",
    body: "You send the first clean reopen.",
    caption: "Silent Quote Command",
    icon: Send,
  },
  {
    when: "In 3 days",
    body: "Quote Reclaim hands you the next text. Copy, paste, send.",
    caption: "Recovery Sequence",
    icon: Clock3,
  },
  {
    when: "If they reply",
    body: "Pick the branch - price, timing, scope, or no. Get the exact reply.",
    caption: "Reply Playbook + One-Tap Reply",
    icon: MessageCircleReply,
  },
  {
    when: "If it books",
    body: "Tap Got the Job. See recovered revenue in your Monthly Recovery Report.",
    caption: "Got the Job + Monthly Recovery Report",
    icon: BadgeCheck,
  },
] as const;

type ResultCtaAnalytics = {
  quoteN: number;
  window: string;
  daysUntilCold: number;
};

type AuditResultViewProps = {
  result: AuditResult;
  copied: boolean;
  signupHref: string;
  tradeConfig: TradeConfig;
  onCopy: () => void;
  onOpenSms: () => void;
  onOpenWhatsapp: () => void;
  onReplyBranchUnlock: (branchId: string) => void;
  onFollowUpUnlock: () => void;
  onResultCtaClick: (details: ResultCtaAnalytics) => void;
  onFaqExpanded: (questionId: string) => void;
  onSignupClick: () => void;
};

function resultIntro(count: number): { headline: string; body: string } {
  if (count === 1) {
    return {
      headline: "Your recovery move is ready.",
      body: "You entered one quiet quote. Here's the move for it - and add two more anytime to rank which to text first.",
    };
  }
  if (count === 2) {
    return {
      headline: "Your first move is clear.",
      body: "You entered two quiet quotes. Here's the one to text first.",
    };
  }
  return {
    headline: "Your first move is clear.",
    body: "This is a prioritization report, not a recovery promise. It turns three quiet quotes into one next action.",
  };
}

export function AuditResultView({
  result,
  copied,
  signupHref,
  tradeConfig,
  onCopy,
  onOpenSms,
  onOpenWhatsapp,
  onReplyBranchUnlock,
  onFollowUpUnlock,
  onResultCtaClick,
  onFaqExpanded,
  onSignupClick,
}: AuditResultViewProps) {
  const priority = result.priority;
  const windowLabel = priority?.windowLabel ?? "Unknown";
  const intro = resultIntro(result.rankedQuotes.length);
  const displayMessage = capitalizeDisplayMessage(result.suggestedMessage);
  const followUpHref = appendAuditSignupReason(signupHref, "follow-up");
  const replyUnlockHref = appendAuditSignupReason(
    signupHref,
    "reply-branches",
  );
  const resultCta = priority
    ? buildAuditResultCta(priority, signupHref)
    : null;

  return (
    <article
      data-testid="audit-result"
      role="region"
      aria-label="Your silent quote recovery diagnostic"
      className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-line-subtle bg-white shadow-premium"
    >
      <header className="border-b border-line-subtle bg-brand/5 px-5 py-7 sm:px-8">
        <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-success">
              {tradeConfig.resultEyebrow}
            </p>
            <h2 className="mt-2 max-w-3xl break-words text-3xl font-black leading-tight text-ink-strong sm:text-4xl">
              {intro.headline}
            </h2>
            <p
              data-testid="audit-result-intro"
              className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted"
            >
              {intro.body}
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
            {result.totalSilentQuoteValue > 0 ? (
              <p
                data-testid="audit-value-bridge"
                className="mt-3 max-w-sm text-sm font-bold leading-6 text-ink-strong"
              >
                {formatCurrency(result.totalSilentQuoteValue)} in quiet
                estimates vs $79/month. Before buying another lead, reopen
                the estimates you already paid to create.
              </p>
            ) : null}
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

        <AuditFollowUpOrder ranked={result.rankedQuotes} />

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
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
              <p className="text-xs text-ink-muted">
                Nothing sends until you tap send.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={onOpenSms}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface-1 px-4 py-2 text-sm font-black text-ink-strong transition hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto"
              >
                <Smartphone className="h-4 w-4 text-brand" aria-hidden="true" />
                Open in SMS
              </button>
              <button
                type="button"
                onClick={onOpenWhatsapp}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface-1 px-4 py-2 text-sm font-black text-ink-strong transition hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto"
              >
                <Send className="h-4 w-4 text-success" aria-hidden="true" />
                Open in WhatsApp
              </button>
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-brand/50 bg-brand/10 px-4 py-2 text-sm font-black text-brand transition hover:bg-brand/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto"
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
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-brand/20 bg-brand/5 px-4 py-5 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
              Paste this into your text thread:
            </p>
            <p
              data-testid="audit-display-message"
              className="mt-3 max-w-3xl whitespace-pre-wrap break-words text-base font-semibold leading-8 text-ink-strong"
            >
              {displayMessage}
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
                Keep the cadence. Unlock the words when you need them.
              </h3>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-ink">
                <li className="flex items-start gap-3">
                  <span className="font-mono font-black text-money">1</span>
                  <span>
                    <strong className="text-ink-strong">Send today.</strong> Use
                    the clean reopen above.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono font-black text-money">3</span>
                  <span>
                    <strong className="text-ink-strong">Day 3 follow-up.</strong>{" "}
                    One short text if it stays quiet.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono font-black text-money">7</span>
                  <span>
                    <strong className="text-ink-strong">Day 7 closeout.</strong>{" "}
                    Stop chasing and leave the door open.
                  </span>
                </li>
              </ol>
            </div>
            <div className="min-w-0 border border-brand/35 bg-brand/5 p-5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand">
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                Follow-up to send next
              </div>
              <p className="mt-3 break-words text-base font-semibold leading-7 text-ink-strong">
                Day 3: one short follow-up. It&apos;s 2 sentences - shorter than
                the first, and gives them a one-word exit so they don&apos;t
                have to explain.
              </p>
              <a
                href={followUpHref}
                data-testid="audit-follow-up-unlock"
                onClick={onFollowUpUnlock}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-brand bg-brand px-4 py-2 text-center text-sm font-bold text-white shadow-premium transition hover:bg-brand-dark hover:shadow-premium-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto"
              >
                Get the day-3 text &mdash; free, no card
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <AuditReplyPlaybook
          unlockHref={replyUnlockHref}
          onUnlock={onReplyBranchUnlock}
        />

        <section
          data-testid="audit-product-preview"
          aria-labelledby="product-preview-title"
          className="border-t border-line-strong pt-7"
        >
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            The continuation
          </p>
          <div className="mt-2 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h3
              id="product-preview-title"
              className="max-w-3xl text-2xl font-black text-ink-strong"
            >
              What happens after today&apos;s text
            </h3>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line-subtle bg-surface-1 px-3 py-1.5 text-xs font-bold text-ink-muted">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
              Sample preview, not customer data
            </span>
          </div>

          <ol className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line-subtle bg-line-subtle lg:grid-cols-4">
            {CONTINUATION_TIMELINE.map(
              ({ when, body, caption, icon: Icon }, index) => (
                <li key={when} className="relative min-w-0 bg-surface-1 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
                    <span className="font-mono text-xs font-black text-money">
                      0{index + 1}
                    </span>
                  </div>
                  <h4 className="mt-5 font-black text-ink-strong">{when}</h4>
                  <p className="mt-2 text-sm leading-6 text-ink">{body}</p>
                  <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-ink-muted">
                    {caption}
                  </p>
                </li>
              ),
            )}
          </ol>
          <p className="mt-4 text-sm leading-6 text-ink-muted">
            $79/month after the free audit. First 3 estimates free. No card to
            see your result. One reopened job can cover years of it.
          </p>
        </section>

        <AuditFaq onExpand={onFaqExpanded} />

        {priority && resultCta ? (
          <section
            data-testid="audit-goes-deeper"
            className="mt-7 border border-brand/45 bg-brand/10 p-5 sm:p-7"
          >
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-brand">
                  You found the first move
                </p>
                <h3 className="mt-2 max-w-3xl break-words text-2xl font-black leading-tight text-ink-strong sm:text-3xl">
                  {resultCta.headline}
                </h3>
                <p
                  data-testid="audit-result-cta-urgency"
                  className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-ink-strong"
                >
                  {resultCta.urgency}
                </p>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-ink">
                  Today you send the first clean reopen. In 3 days, Quote Reclaim
                  hands you the next text. If they reply with price, you get the
                  price reply. If it books, you tap Got the Job.
                </p>
                <p className="mt-3 text-sm font-bold text-ink-strong">
                  You send every text. We just hand you the next move.
                </p>
              </div>
              <a
                href={resultCta.href}
                data-testid="audit-signup-cta"
                onClick={() => {
                  onSignupClick();
                  onResultCtaClick({
                    quoteN: priority.index,
                    window: priority.window,
                    daysUntilCold: resultCta.daysUntilCold,
                  });
                }}
                className="inline-flex min-h-12 w-full max-w-md shrink-0 items-center justify-center gap-2 rounded-[10px] border border-brand bg-brand px-5 py-3 text-center text-base font-bold leading-tight text-white shadow-premium transition-all hover:bg-brand-dark hover:shadow-premium-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas lg:w-auto"
              >
                {resultCta.button}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted lg:justify-end">
              <FileClock className="h-4 w-4" aria-hidden="true" />
              No card. You send every text - we just hand you the words. First 3
              estimates free.
            </p>
          </section>
        ) : null}
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
