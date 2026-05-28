"use client";

import * as React from "react";
import { Mic, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { parseSpeechLocal } from "@/lib/voice/parse-local";
import type { VoiceParseResult } from "@/lib/voice/types";

type VoiceModalProps = {
  onClose: () => void;
  onApprove: (result: VoiceParseResult) => void;
};

type Phase = "checking" | "listening" | "review" | "unsupported" | "error";

export function VoiceModal({ onClose, onApprove }: VoiceModalProps) {
  const speech = useSpeechRecognition();
  const [phase, setPhase] = React.useState<Phase>("checking");
  const [parsed, setParsed] = React.useState<VoiceParseResult | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const startAttemptedRef = React.useRef(false);
  const wasListeningRef = React.useRef(false);

  // Initial state: wait for client-side support detection before deciding.
  React.useEffect(() => {
    if (!speech.supportChecked) return;
    if (speech.supported && !startAttemptedRef.current) {
      startAttemptedRef.current = true;
      setPhase("listening");
      speech.start();
    } else if (!speech.supported) {
      setPhase("unsupported");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.supportChecked, speech.supported]);

  // A fatal recognition error (network, permission, etc.) routes to the error
  // screen, which offers a clean exit so the contractor can type instead.
  React.useEffect(() => {
    if (speech.error) setPhase("error");
  }, [speech.error]);

  // When listening stops (falling edge) the final transcript has landed — ship
  // it to the parser. Guarded so it fires once per recording, never on error.
  React.useEffect(() => {
    const was = wasListeningRef.current;
    wasListeningRef.current = speech.isListening;
    if (was && !speech.isListening && phase === "listening" && !speech.error) {
      void runParser(speech.transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.isListening, speech.error, phase]);

  async function runParser(transcript: string) {
    setParsing(true);
    const text = transcript.trim();

    // Empty recording — drop straight into review with blank fields.
    if (!text) {
      setParsed(emptyResult());
      setPhase("review");
      setParsing(false);
      return;
    }

    let result: VoiceParseResult | null = null;
    try {
      const response = await fetch("/api/parse-speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { data?: VoiceParseResult };
      if (body.data) result = body.data;
    } catch {
      // Network or server error — fall back to the local regex parser.
    }

    if (!result) result = parseSpeechLocal(text);

    setParsed({ ...result, _key: String(Date.now()) });
    setPhase("review");
    setParsing(false);
  }

  function stopAndReview() {
    speech.stop();
  }

  function recordAgain() {
    setParsed(null);
    setPhase("listening");
    startAttemptedRef.current = true;
    speech.start();
  }

  function patchField<K extends keyof VoiceParseResult>(
    key: K,
    value: VoiceParseResult[K],
  ) {
    setParsed((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function approve() {
    if (!parsed) return;
    onApprove(parsed);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-line-subtle bg-surface-1 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2
            id="voice-modal-title"
            className="text-lg font-bold text-ink-strong"
          >
            {phase === "checking"
              ? "Checking voice support"
              : phase === "listening"
                ? "Listening…"
                : phase === "review"
                  ? "Here's what I heard"
                  : phase === "unsupported"
                    ? "Type the quote details"
                    : "Couldn't capture that"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {phase === "checking" ? (
          <p className="mt-3 text-sm text-ink-muted">
            Checking whether voice entry is available in this browser.
          </p>
        ) : null}

        {phase === "listening" ? (
          <ListeningBody
            transcript={speech.transcript}
            onStop={stopAndReview}
            onCancel={onClose}
            parsing={parsing}
          />
        ) : null}

        {phase === "review" && parsed ? (
          <ReviewBody
            parsed={parsed}
            onPatch={patchField}
            onApprove={approve}
            onRecordAgain={recordAgain}
          />
        ) : null}

        {phase === "unsupported" ? (
          <div className="mt-3 space-y-3">
            <p className="rounded-lg border border-line-subtle bg-surface-2 p-3 text-sm text-ink-muted">
              Voice entry is not supported in this browser. Close this and type
              the quote details on the form.
            </p>
            <Button type="button" fullWidth variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="mt-3 space-y-3">
            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-ink">
              {speech.error ?? "Voice recognition error. Type the quote instead."}
            </p>
            <Button type="button" fullWidth variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ListeningBody({
  transcript,
  onStop,
  onCancel,
  parsing,
}: {
  transcript: string;
  onStop: () => void;
  onCancel: () => void;
  parsing: boolean;
}) {
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/15">
          <Mic className="h-10 w-10 animate-pulse text-brand" aria-hidden="true" />
        </div>
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm font-semibold text-brand"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 animate-pulse rounded-full bg-brand"
          />
          Listening…
        </p>
      </div>
      {transcript ? (
        <p className="rounded-lg border border-line-subtle bg-surface-2 p-3 text-sm text-ink">
          {transcript}
        </p>
      ) : (
        <p className="text-center text-sm text-ink-muted">
          Say the client&apos;s first name, the trade, the estimate, and how
          many days they&apos;ve been silent.
        </p>
      )}
      <p className="text-center text-xs text-ink-muted">
        Take your time. Press Stop &amp; Review when done.
      </p>
      <div className="space-y-3">
        <Button
          type="button"
          fullWidth
          size="lg"
          className="min-h-14"
          onClick={onStop}
          loading={parsing}
        >
          {parsing ? "Parsing…" : "Stop & Review"}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          disabled={parsing}
          className="block w-full text-center text-xs text-ink-muted underline hover:text-ink-strong focus:outline-none disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReviewBody({
  parsed,
  onPatch,
  onApprove,
  onRecordAgain,
}: {
  parsed: VoiceParseResult;
  onPatch: <K extends keyof VoiceParseResult>(
    key: K,
    value: VoiceParseResult[K],
  ) => void;
  onApprove: () => void;
  onRecordAgain: () => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <FieldRow
        label="Client"
        value={parsed.client_name ?? ""}
        onChange={(v) => onPatch("client_name", v || null)}
      />
      <FieldRow
        label="Trade"
        value={parsed.trade ?? ""}
        onChange={(v) => onPatch("trade", (v || null) as VoiceParseResult["trade"])}
      />
      <FieldRow
        label="Estimate"
        prefix="$"
        type="number"
        value={parsed.estimate_amount?.toString() ?? ""}
        onChange={(v) => onPatch("estimate_amount", v ? Number(v) : null)}
      />
      <FieldRow
        label="Days quiet"
        type="number"
        value={parsed.days_silent?.toString() ?? ""}
        onChange={(v) => onPatch("days_silent", v ? Number(v) : null)}
      />
      <FieldRow
        label="City"
        value={parsed.city ?? ""}
        onChange={(v) => onPatch("city", v || null)}
      />
      <FieldRow
        label="State"
        maxLength={2}
        value={parsed.state ?? ""}
        onChange={(v) => onPatch("state", (v || null) as string | null)}
      />

      <div className="pt-2">
        <Button type="button" fullWidth size="lg" onClick={onApprove}>
          Build Recovery Plan
        </Button>
        <button
          type="button"
          onClick={onRecordAgain}
          className="mt-3 w-full text-xs text-ink-muted underline hover:text-ink-strong focus:outline-none"
        >
          Record again
        </button>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  prefix,
  type,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  prefix?: string;
  type?: "text" | "number";
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <span className="flex items-center gap-2">
        {prefix ? <span className="text-ink-muted">{prefix}</span> : null}
        <input
          type={type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className="h-10 flex-1 rounded-lg border border-line-subtle bg-surface-2 px-3 text-base text-ink-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
        />
      </span>
    </label>
  );
}

function emptyResult(): VoiceParseResult {
  return {
    client_name: null,
    trade: null,
    estimate_amount: null,
    days_silent: null,
    city: null,
    state: null,
    client_phone: null,
    client_email: null,
    job_description: null,
    missing_required: [
      "client_name",
      "trade",
      "estimate_amount",
      "days_silent",
    ],
    _key: String(Date.now()),
  };
}
