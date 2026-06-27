"use client";

import * as React from "react";
import { submitOneTapReply, type ReplyActionResult } from "./actions";
import {
  type OneTapAnswerType,
} from "@/lib/quotes/one-tap-reply";
import { ONE_TAP_CHOICES } from "@/lib/quotes/one-tap-choices";

type ReplyFormProps = {
  token: string;
};

type ViewState =
  | { kind: "choose" }
  | { kind: "submitting" }
  | { kind: "done"; result: ReplyActionResult }
  | { kind: "error"; message: string };

export function ReplyForm({ token }: ReplyFormProps) {
  const [view, setView] = React.useState<ViewState>({ kind: "choose" });

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

  // view.kind === "choose"
  return (
    <div className="mt-6 space-y-4">
      <p className="text-center text-sm font-bold uppercase tracking-widest text-ink-muted">
        Where are you on this?
      </p>

      <div className="grid gap-3">
        {ONE_TAP_CHOICES.map((choice, index) => (
          <PrimaryButton
            key={choice.id}
            onClick={() => submit({ token, answerType: choice.id })}
            tone={index === 0 ? "success" : "neutral"}
          >
            {choice.label}
          </PrimaryButton>
        ))}
      </div>
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
      : kind === "price_concern"
        ? `Thanks — ${contractorFirstName} will follow up about the price.`
        : kind === "bad_timing"
          ? `Thanks — ${contractorFirstName} will follow up about timing.`
          : kind === "need_to_talk"
            ? `Thanks — ${contractorFirstName} will reach out to talk.`
            : kind === "went_another_way"
              ? `Thanks — we'll let ${contractorFirstName} know.`
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
