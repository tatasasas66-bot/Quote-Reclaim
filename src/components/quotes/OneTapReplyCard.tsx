"use client";

import * as React from "react";
import { createOneTapLinkForQuote } from "@/app/(app)/quotes/[id]/one-tap-actions";
import type { LatestOneTapReply } from "@/lib/quotes/one-tap-reply-server";
import { ONE_TAP_CHOICES } from "@/lib/quotes/one-tap-choices";
import { getReplyPlaybook } from "@/lib/recovery/recovery-logic";

type OneTapReplyCardProps = {
  quoteId: string;
  clientFirstName: string;
  trade: string;
  latestReply: LatestOneTapReply | null;
};

/**
 * Contractor-facing card for One-Tap Reply.
 *
 * - When no reply has landed yet, the card explains the feature, exposes a
 *   "Copy link" affordance, and lets the contractor add/remove up to 2
 * - When a reply HAS landed, the card surfaces the most recent answer with
 *   a clear recommended next move. It NEVER claims the job is booked.
 */
export function OneTapReplyCard({
  quoteId,
  clientFirstName,
  trade,
  latestReply,
}: OneTapReplyCardProps) {
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const copyLink = React.useCallback(async () => {
    setLinkError(null);
    const result = await createOneTapLinkForQuote(quoteId);
    if (!result.ok) {
      setLinkError(result.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(result.data!.url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2_000);
    } catch {
      setLinkError("Copy failed — your browser blocked clipboard access.");
    }
  }, [quoteId]);

  return (
    <section
      aria-label="One-Tap Reply"
      className="space-y-4 rounded-lg border border-brand/40 bg-surface-1 p-5 shadow-[0_0_28px_rgba(217,111,50,0.10)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            One-Tap Reply
          </p>
          <h3 className="mt-2 text-balance text-xl font-black leading-tight text-ink-strong sm:text-2xl">
            Make it easy for the homeowner to answer.
          </h3>
          <p className="mt-3 max-w-prose text-sm leading-6 text-ink">
            Your follow-up email can include a simple reply link, so the
            homeowner does not have to write an awkward message from scratch.
          </p>
          <p className="mt-3 text-sm font-semibold leading-6 text-ink-strong">
            Turn silence into a yes, a question, or a clean no.
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Five-second reply for the homeowner. Clear next move for you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ONE_TAP_CHOICES.map((option) => (
              <span
                key={option.id}
                className="rounded-full border border-line-subtle bg-canvas/45 px-3 py-1 text-xs font-semibold text-ink"
              >
                {option.label}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex min-h-10 items-center rounded border border-line-subtle px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {linkCopied ? "Link copied" : "Copy One-Tap Reply link"}
        </button>
      </div>

      {linkError ? (
        <p role="alert" className="text-xs text-warning">
          {linkError}
        </p>
      ) : null}

      <LatestReplyPanel
        latestReply={latestReply}
        clientFirstName={clientFirstName}
        trade={trade}
      />
    </section>
  );
}
function LatestReplyPanel({
  latestReply,
  clientFirstName,
  trade,
}: {
  latestReply: LatestOneTapReply | null;
  clientFirstName: string;
  trade: string;
}) {
  if (!latestReply) {
    return (
      <p className="rounded-md border border-dashed border-line-subtle bg-canvas/40 p-3 text-sm leading-6 text-ink-muted">
        Customers can reply to this estimate in one tap from the follow-up
        email.
      </p>
    );
  }

  const branchMap = {
    interested: "still_interested",
    price_concern: "price_concern",
    bad_timing: "bad_timing",
    need_to_talk: "need_to_talk",
    went_another_way: "went_another_way",
  } as const;
  const branchId =
    latestReply.answerType in branchMap
      ? branchMap[latestReply.answerType as keyof typeof branchMap]
      : null;
  const branch = branchId
    ? getReplyPlaybook(trade).find((path) => path.id === branchId)
    : null;

  if (branch) {
    return (
      <Panel
        tone={latestReply.answerType === "interested" ? "success" : "brand"}
        eyebrow={`${clientFirstName} tapped`}
        title={`"${branch.trigger}"`}
        move={branch.response}
      />
    );
  }

  if (latestReply.answerType === "question") {
    return (
      <Panel
        tone="brand"
        eyebrow={`${clientFirstName} asked`}
        title={`"${latestReply.questionText ?? "(no question text)"}"`}
        move="Answer directly. The suggested response is in Reply Radar below."
      />
    );
  }

  if (latestReply.answerType === "not_now") {
    return (
      <Panel
        tone="neutral"
        eyebrow={`${clientFirstName} tapped`}
        title='"Not right now."'
        move="Close the quote or leave it paused — no chase needed."
      />
    );
  }

  return (
    <Panel
      tone="success"
      eyebrow={`${clientFirstName} chose`}
      title="an approved option"
      move="Confirm scope and next steps."
    />
  );
}

function Panel({
  tone,
  eyebrow,
  title,
  move,
}: {
  tone: "success" | "brand" | "neutral";
  eyebrow: string;
  title: string;
  move: string;
}) {
  const border =
    tone === "success"
      ? "border-success/40"
      : tone === "brand"
        ? "border-brand/40"
        : "border-line-subtle";
  const accent =
    tone === "success"
      ? "text-success"
      : tone === "brand"
        ? "text-brand"
        : "text-ink-muted";
  return (
    <div className={`rounded-md border-2 ${border} bg-canvas/40 p-4`}>
      <p
        className={`text-xs font-black uppercase tracking-widest ${accent}`}
      >
        {eyebrow}
      </p>
      {/* Plain text content, never raw HTML. `title` can include a
          homeowner-submitted question (one_tap_replies.question_text), so
          rendering it via dangerouslySetInnerHTML was a stored-XSS vector —
          a reply of "<img src=x onerror=...>" would execute in the
          contractor's authenticated session. React escapes text children, so
          the apostrophes/quotes in the hardcoded titles still render fine. */}
      <p className="mt-1 break-words text-base font-bold leading-7 text-ink-strong">
        {title}
      </p>
      <p className="mt-2 text-xs leading-5 text-ink-muted">
        <span className="font-bold text-ink">Recommended next move:</span> {move}
      </p>
    </div>
  );
}
