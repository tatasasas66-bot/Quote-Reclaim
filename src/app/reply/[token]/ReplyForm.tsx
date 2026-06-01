"use client";

import * as React from "react";
import { submitOneTapReply, type ReplyActionResult } from "./actions";
import type { ReplyOption } from "@/lib/quotes/one-tap-reply-server";
import type { OneTapAnswerType } from "@/lib/quotes/one-tap-reply";
import { formatCurrency } from "@/lib/utils/currency";

type ReplyFormProps = {
  token: string;
  contractorFirstName: string;
  options: ReplyOption[];
};

type ViewState =
  | { kind: "choose" }
  | { kind: "question" }
  | { kind: "submitting" }
  | { kind: "done"; result: ReplyActionResult }
  | { kind: "error"; message: string };

export function ReplyForm({ token, contractorFirstName, options }: ReplyFormProps) {
  const [view, setView] = React.useState<ViewState>({ kind: "choose" });
  const [questionText, setQuestionText] = React.useState("");

  const submit = React.useCallback(
    async (input: Parameters<typeof submitOneTapReply>[0]) => {
      setView({ kind: "submitting" });
      const result = await submitOneTapReply(input);
      if (result.ok) {
        setView({ kind: "done", result });
      } else {
        setView({ kind: "error", message: result.reason });
      }
    },
    [],
  );

  if (view.kind === "submitting") {
    return (
      <p
        role="status"
        className="mt-6 rounded-lg border border-line-subtle bg-surface-1 p-5 text-center text-sm text-ink-muted"
      >
        Sending your reply…
      </p>
    );
  }

  if (view.kind === "done" && view.result.ok) {
    return (
      <ThanksPanel
        kind={view.result.kind}
        contractorFirstName={view.result.contractorFirstName}
      />
    );
  }

  if (view.kind === "error") {
    return (
      <p
        role="alert"
        className="mt-6 rounded-lg border border-line-subtle bg-surface-1 p-5 text-center text-sm text-ink-muted"
      >
        {view.message}
      </p>
    );
  }

  if (view.kind === "question") {
    return (
      <form
        className="mt-6 space-y-4 rounded-lg border border-line-subtle bg-surface-1 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit({
            token,
            answerType: "question",
            questionText,
          });
        }}
      >
        <label
          htmlFor="otr-question"
          className="block text-sm font-bold text-ink-strong"
        >
          What question do you have?
        </label>
        <textarea
          id="otr-question"
          name="question"
          required
          minLength={3}
          maxLength={1000}
          rows={4}
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          className="w-full rounded-md border border-line-subtle bg-canvas p-3 text-base leading-7 text-ink-strong outline-none placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-focus"
          placeholder="Type your question here…"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setView({ kind: "choose" })}
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-line-subtle px-5 py-3 text-base font-semibold text-ink hover:text-ink-strong"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={questionText.trim().length < 3}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-brand px-5 py-3 text-base font-bold text-canvas shadow-[0_0_36px_rgba(217,111,50,0.35)] disabled:opacity-50"
          >
            Send question
          </button>
        </div>
      </form>
    );
  }

  // view.kind === "choose"
  return (
    <div className="mt-6 space-y-4">
      <p className="text-center text-sm font-bold uppercase tracking-widest text-ink-muted">
        Where are you on this?
      </p>

      <div className="grid gap-3">
        <PrimaryButton
          onClick={() => submit({ token, answerType: "interested" })}
          tone="success"
        >
          Let&apos;s do it — what&apos;s next?
        </PrimaryButton>
        <PrimaryButton
          onClick={() => setView({ kind: "question" })}
          tone="brand"
        >
          I have one question
        </PrimaryButton>
        <PrimaryButton
          onClick={() => submit({ token, answerType: "not_now" })}
          tone="neutral"
        >
          Not right now
        </PrimaryButton>
      </div>

      {options.length > 0 ? (
        <section
          aria-label="Another way to move forward"
          className="mt-2 space-y-3 rounded-lg border border-line-subtle bg-surface-1 p-5"
        >
          <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
            Another way to move forward
          </p>
          <p className="text-sm text-ink-muted">
            {contractorFirstName} also approved these alternatives.
          </p>
          <div className="grid gap-2">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  submit({
                    token,
                    answerType: "option_selected",
                    selectedOptionId: o.id,
                  })
                }
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-md border border-line-subtle bg-canvas px-4 py-3 text-left hover:border-brand/60"
              >
                <span className="min-w-0">
                  <span className="block text-base font-bold text-ink-strong">
                    {o.label}
                  </span>
                  {o.note ? (
                    <span className="mt-0.5 block text-sm text-ink-muted">
                      {o.note}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-base font-black tabular-nums text-ink-strong">
                  {o.amountCents != null
                    ? formatCurrency(o.amountCents / 100)
                    : ""}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PrimaryButton({
  onClick,
  children,
  tone,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone: "success" | "brand" | "neutral";
}) {
  const cls =
    tone === "success"
      ? "bg-brand text-canvas shadow-[0_0_36px_rgba(217,111,50,0.35)] active:scale-[0.99]"
      : tone === "brand"
        ? "border border-brand/60 bg-surface-1 text-ink-strong hover:bg-brand/10"
        : "border border-line-subtle bg-surface-1 text-ink hover:text-ink-strong";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-14 w-full items-center justify-center rounded-md px-5 py-4 text-base font-bold ${cls}`}
    >
      {children}
    </button>
  );
}

function ThanksPanel({
  kind,
  contractorFirstName,
}: {
  kind: OneTapAnswerType;
  contractorFirstName: string;
}) {
  const message =
    kind === "interested"
      ? `Thanks — ${contractorFirstName} will follow up with the next step.`
      : kind === "question"
        ? `Thanks — your question was sent to ${contractorFirstName}.`
        : kind === "not_now"
          ? `Thanks — we'll let ${contractorFirstName} know.`
          : `Thanks — ${contractorFirstName} will follow up about this option.`;

  return (
    <section
      aria-label="Reply sent"
      className="mt-6 rounded-lg border-2 border-success/40 bg-surface-1 p-6 text-center"
    >
      <p className="text-xs font-black uppercase tracking-widest text-success">
        Reply sent
      </p>
      <p className="mt-3 text-base leading-7 text-ink-strong">{message}</p>
    </section>
  );
}
