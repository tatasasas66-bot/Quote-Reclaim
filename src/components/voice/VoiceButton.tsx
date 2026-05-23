"use client";

import * as React from "react";
import { Mic } from "lucide-react";
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
        className="flex w-full min-w-0 items-center justify-center gap-3 rounded-xl border border-brand/40 bg-brand/10 px-5 py-4 text-base font-semibold text-ink-strong transition-colors hover:bg-brand/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <Mic className="h-5 w-5 text-brand" aria-hidden="true" />
        <span>Dictate this quote</span>
      </button>
      <p className="mt-2 text-center text-xs text-ink-muted">
        Try:{" "}
        <span className="text-ink">
          &ldquo;HVAC quote for Tom, forty two hundred, sent yesterday.&rdquo;
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
