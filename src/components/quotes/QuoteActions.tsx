"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import {
  closeQuoteAction,
  markQuoteWonAction,
  pauseSequenceAction,
  resumeSequenceAction,
  type ActionResult,
} from "@/lib/quotes/actions";

export type RecoveryStatus = "running" | "paused" | "won" | "closed";

type Pending = "won" | "close" | "pause" | "resume" | null;

type Props = {
  quoteId: string;
  status: RecoveryStatus;
};

export function QuoteActions({ quoteId, status }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<Pending>(null);
  const [error, setError] = React.useState<string | null>(null);

  function run(
    label: Exclude<Pending, null>,
    fn: () => Promise<ActionResult>,
    confirmMessage: string | null,
  ) {
    setError(null);
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setPending(label);
    fn()
      .then((result) => {
        if (!result.ok) setError(result.error);
        else router.refresh();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Something went wrong");
      })
      .finally(() => setPending(null));
  }

  if (status === "won" || status === "closed") return null;

  const busy = pending !== null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "running" ? (
          <Button
            type="button"
            variant="secondary"
            loading={pending === "pause"}
            disabled={busy}
            onClick={() =>
              run(
                "pause",
                () => pauseSequenceAction(quoteId),
                "Pause this recovery sequence? Future reminders will not send until you resume.",
              )
            }
          >
            Pause sequence
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            loading={pending === "resume"}
            disabled={busy}
            onClick={() =>
              run(
                "resume",
                () => resumeSequenceAction(quoteId),
                null,
              )
            }
          >
            Resume sequence
          </Button>
        )}

        <Button
          type="button"
          variant="success"
          loading={pending === "won"}
          disabled={busy}
          onClick={() =>
            run(
              "won",
              () => markQuoteWonAction(quoteId),
              "Mark this quote as won? Reminders pause and your totals update.",
            )
          }
        >
          Mark as won
        </Button>

        <Button
          type="button"
          variant="ghost"
          loading={pending === "close"}
          disabled={busy}
          onClick={() =>
            run(
              "close",
              () => closeQuoteAction(quoteId),
              "Close this quote? It will leave your recovery queue and stop reminders.",
            )
          }
        >
          Close quote
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
