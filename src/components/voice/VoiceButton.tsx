"use client";

import * as React from "react";
import { Mic } from "lucide-react";
import { VoiceModal } from "./VoiceModal";
import type { VoicePrefill } from "@/lib/voice/parse-transcript";

type Props = {
  onComplete: (parsed: VoicePrefill) => void;
};

/**
 * Optional fast-entry card. Voice is an enhancement — the manual form below
 * works fully without it, and any field voice can't fill stays empty for
 * typing.
 */
export function VoiceButton({ onComplete }: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <div className="rounded-lg border border-brand/30 bg-surface-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-ink-strong">Add by voice</p>
            <p className="mt-1 text-sm text-ink-muted">
              Tap, speak the customer, trade, amount, and days quiet. Stop when
              you&apos;re done.
            </p>
            <p className="mt-2 text-xs italic text-ink-muted">
              Say: &quot;Tom, roofing, eighty five hundred, eight days quiet,
              Miami Florida.&quot;
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-brand bg-brand/10 px-3 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            Add by voice
          </button>
        </div>
      </div>

      <VoiceModal
        open={open}
        onClose={() => setOpen(false)}
        onComplete={(parsed) => {
          onComplete(parsed);
          setOpen(false);
        }}
      />
    </>
  );
}
