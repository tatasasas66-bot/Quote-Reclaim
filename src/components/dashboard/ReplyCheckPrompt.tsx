"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { recordReplyCheckAction } from "@/app/(app)/dashboard/actions";

export function ReplyCheckPrompt({
  quoteId,
  clientName,
  reaskCount,
}: {
  quoteId: string;
  clientName: string;
  reaskCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function answer(value: "yes" | "no" | "not_yet") {
    setPending(true);
    const result = await recordReplyCheckAction({
      quoteId,
      answer: value,
      reaskCount,
    });
    if (result.href) {
      router.push(result.href);
      return;
    }
    router.refresh();
  }

  return (
    <div className="border-b border-brand/30 bg-brand/10 px-4 py-3">
      <p className="text-sm font-black text-ink-strong">
        Did {clientName} reply?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["yes", "no", "not_yet"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            aria-label={`${value === "not_yet" ? "Not yet" : value} for ${clientName}`}
            onClick={() => void answer(value)}
            className="min-h-10 rounded-md border border-line-strong bg-surface-1 px-3 py-2 text-xs font-black text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
          >
            {value === "yes" ? "Yes" : value === "no" ? "No" : "Not yet"}
          </button>
        ))}
      </div>
    </div>
  );
}
