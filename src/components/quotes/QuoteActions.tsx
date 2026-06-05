"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { WinMomentOverlay } from "@/components/dashboard/WinMomentOverlay";
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
  amount: number;
  allTimeRecovered: number;
};

export function QuoteActions({
  quoteId,
  status,
  amount,
  allTimeRecovered,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<Pending>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showWinMoment, setShowWinMoment] = React.useState(false);

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
        else if (label === "won") setShowWinMoment(true);
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
      {showWinMoment ? (
        <WinMomentOverlay
          amount={amount}
          allTimeRecovered={allTimeRecovered}
          onDismiss={() => router.push("/dashboard")}
        />
      ) : null}
      {/*
        Order: dominant green CTA → secondary toggle → terminal destructive.
        Got-the-Job leads so the contractor's eye lands on the win action
        first; Close (terminal) sits last with the quietest variant.
      */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="success"
          loading={pending === "won"}
          disabled={busy}
          className="shadow-[0_0_30px_rgba(31,169,113,0.2)]"
          onClick={() =>
            run(
              "won",
              () => markQuoteWonAction(quoteId),
              "Mark this quote as won? Reminders pause and your totals update.",
            )
          }
        >
          Got the Job
        </Button>

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
