"use client";

import * as React from "react";
import {
  createOneTapLinkForQuote,
  addReplyOption,
  removeReplyOption,
} from "@/app/(app)/quotes/[id]/one-tap-actions";
import { formatCurrency } from "@/lib/utils/currency";
import type {
  LatestOneTapReply,
  ReplyOption,
} from "@/lib/quotes/one-tap-reply-server";

type OneTapReplyCardProps = {
  quoteId: string;
  clientFirstName: string;
  latestReply: LatestOneTapReply | null;
  options: ReplyOption[];
};

/**
 * Contractor-facing card for One-Tap Reply.
 *
 * - When no reply has landed yet, the card explains the feature, exposes a
 *   "Copy link" affordance, and lets the contractor add/remove up to 2
 *   alternative options.
 * - When a reply HAS landed, the card surfaces the most recent answer with
 *   a clear recommended next move. It NEVER claims the job is booked.
 */
export function OneTapReplyCard({
  quoteId,
  clientFirstName,
  latestReply,
  options,
}: OneTapReplyCardProps) {
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [managingOptions, setManagingOptions] = React.useState(false);

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
      className="space-y-4 rounded-lg border border-line-subtle bg-surface-1 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            One-Tap Reply
          </p>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            Turn silence into a yes, a question, or a clean no.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex min-h-10 items-center rounded border border-line-subtle px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {linkCopied ? "Link copied" : "Copy One-Tap Reply link"}
          </button>
          <button
            type="button"
            onClick={() => setManagingOptions((v) => !v)}
            className="inline-flex min-h-10 items-center rounded border border-line-subtle px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Manage reply options
          </button>
        </div>
      </div>

      {linkError ? (
        <p role="alert" className="text-xs text-warning">
          {linkError}
        </p>
      ) : null}

      <LatestReplyPanel
        latestReply={latestReply}
        clientFirstName={clientFirstName}
        options={options}
      />

      {managingOptions ? (
        <OptionsManager quoteId={quoteId} options={options} />
      ) : null}
    </section>
  );
}

function LatestReplyPanel({
  latestReply,
  clientFirstName,
  options,
}: {
  latestReply: LatestOneTapReply | null;
  clientFirstName: string;
  options: ReplyOption[];
}) {
  if (!latestReply) {
    return (
      <p className="rounded-md border border-dashed border-line-subtle bg-canvas/40 p-3 text-sm leading-6 text-ink-muted">
        Homeowners can reply to this estimate in one tap from the follow-up
        email.
      </p>
    );
  }

  if (latestReply.answerType === "interested") {
    return (
      <Panel
        tone="success"
        eyebrow={`${clientFirstName} tapped`}
        title='"Let&apos;s do it — what&apos;s next?"'
        move="Call or reply with scheduling options."
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

  // option_selected
  const opt = options.find((o) => o.id === latestReply.selectedOptionId);
  const optTitle = opt
    ? `${opt.label}${opt.amountCents != null ? ` — ${formatCurrency(opt.amountCents / 100)}` : ""}`
    : "an approved option";
  return (
    <Panel
      tone="success"
      eyebrow={`${clientFirstName} chose`}
      title={optTitle}
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

function OptionsManager({
  quoteId,
  options,
}: {
  quoteId: string;
  options: ReplyOption[];
}) {
  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const atCap = options.length >= 2;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const numeric = amount.trim() === "" ? null : Number(amount);
    if (numeric != null && (!Number.isFinite(numeric) || numeric < 0)) {
      setError("Amount must be a positive number.");
      setBusy(false);
      return;
    }
    const res = await addReplyOption({
      quoteId,
      label,
      amount: numeric,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLabel("");
    setAmount("");
  };

  return (
    <div className="rounded-md border border-line-subtle bg-canvas/40 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
        Reply options
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">
        Up to two alternatives the homeowner can choose from. These are
        contractor-approved offers — not discounts.
      </p>

      {options.length === 0 ? (
        <p className="mt-2 text-xs text-ink-muted">No options yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {options.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-3 rounded border border-line-subtle bg-surface-1 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink-strong">
                  {o.label}
                </span>
                <span className="block text-xs text-ink-muted">
                  {o.amountCents != null
                    ? formatCurrency(o.amountCents / 100)
                    : "Price on request"}
                </span>
              </span>
              <form
                action={async () => {
                  await removeReplyOption({ quoteId, optionId: o.id });
                }}
              >
                <button
                  type="submit"
                  className="rounded text-xs font-semibold text-ink-muted hover:text-warning"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {atCap ? (
        <p className="mt-3 text-xs text-ink-muted">
          You have the maximum of 2 active options. Remove one to add another.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="Option label (e.g. Essentials first)"
            className="rounded border border-line-subtle bg-surface-1 px-3 py-2 text-sm text-ink-strong placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="Amount (USD)"
            className="rounded border border-line-subtle bg-surface-1 px-3 py-2 text-sm text-ink-strong placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus"
          />
          <button
            type="submit"
            disabled={busy || label.trim().length === 0}
            className="rounded border border-brand bg-brand px-4 py-2 text-sm font-bold text-canvas disabled:opacity-50"
          >
            Add option
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-warning">
          {error}
        </p>
      ) : null}
    </div>
  );
}
