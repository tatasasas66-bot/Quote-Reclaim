"use client";

import * as React from "react";
import { Mic, Waves } from "lucide-react";
import { VoiceModal } from "./VoiceModal";
import type { VoiceParseResult } from "@/lib/voice/types";

type VoiceButtonProps = {
  onParsed: (result: VoiceParseResult) => void;
};

export function VoiceButton({ onParsed }: VoiceButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group grid w-full min-w-0 gap-4 rounded-lg border border-brand/45 bg-brand/10 px-5 py-4 text-left text-ink-strong shadow-[0_18px_54px_rgba(217,111,50,0.12)] transition-colors hover:border-brand hover:bg-brand/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:grid-cols-[auto_1fr_auto] sm:items-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-brand/35 bg-brand/15">
          <Mic className="h-6 w-6 text-brand" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-lg font-black">Add by voice</span>
          <span className="mt-1 block text-sm font-normal text-ink-muted">
            Speak the customer, trade, amount, and days quiet.
          </span>
        </span>
        <span className="hidden items-center gap-2 rounded-md border border-line-subtle bg-canvas/40 px-3 py-2 text-xs font-bold uppercase tracking-widest text-brand sm:inline-flex">
          <Waves className="h-4 w-4" aria-hidden="true" />
          Fast intake
        </span>
      </button>
      <p className="mt-2 text-center text-xs text-ink-muted">
        Say:{" "}
        <span className="text-ink">
          &ldquo;Tom, roofing, eighty five hundred, eight days quiet, Miami
          Florida.&rdquo;
        </span>
      </p>
      {open ? (
        <VoiceModal
          onClose={() => setOpen(false)}
          onApprove={(result) => {
            onParsed(result);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
