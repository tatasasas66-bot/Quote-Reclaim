"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import {
  closeQuoteAction,
  markQuoteWonAction,
  type ActionResult,
} from "@/lib/quotes/actions";

type Props = { quoteId: string };

export function QuoteActions({ quoteId }: Props) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = React.useState<
    "won" | "close" | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);

  function run(
    label: "won" | "close",
    fn: () => Promise<ActionResult>,
    confirmMessage: string,
  ) {
    setError(null);
    if (!window.confirm(confirmMessage)) return;
    setPendingAction(label);
    fn()
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
        } else {
          router.refresh();
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Something went wrong");
      })
      .finally(() => setPendingAction(null));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="success"
          loading={pendingAction === "won"}
          disabled={pendingAction !== null}
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
          variant="secondary"
          loading={pendingAction === "close"}
          disabled={pendingAction !== null}
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
