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

type Phase =
  | "checking"
  | "listening"
  | "review"
  | "clarify"
  | "unsupported"
  | "permission-denied"
  | "error";

// "recognition" = the browser's STT engine failed before any transcript;
// "parse"       = we got a transcript but couldn't extract the required fields.
type ErrorSource = "recognition" | "parse" | null;

export function VoiceModal({ onClose, onApprove }: VoiceModalProps) {
  const speech = useSpeechRecognition();
  const [phase, setPhase] = React.useState<Phase>("checking");
  const [parsed, setParsed] = React.useState<VoiceParseResult | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [errorSource, setErrorSource] = React.useState<ErrorSource>(null);
  const [manualEntry, setManualEntry] = React.useState("");
  const startAttemptedRef = React.useRef(false);

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

  // The browser's STT engine fired an error — speech never captured.
  React.useEffect(() => {
    if (!speech.error) return;
    if (speech.error === "permission-denied") {
      setPhase("permission-denied");
    } else {
      // "network", "audio-capture", "start-failed", etc. — the mic engine
      // itself failed, not the parser. Give the user a text entry instead.
      setErrorSource("recognition");
      setParseError(
        speech.error === "start-failed"
          ? "Microphone couldn't start in this browser."
          : "Voice recognition stopped unexpectedly.",
      );
      setPhase("error");
    }
  }, [speech.error]);

  // When listening ends, ship the transcript to the parser.
  React.useEffect(() => {
    if (!speech.isListening && speech.transcript && phase === "listening") {
      void runParser(speech.transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.isListening, speech.transcript, phase]);

  async function runParser(transcript: string) {
    setParsing(true);
    setParseError(null);

    let result: VoiceParseResult | null = null;

    try {
      const response = await fetch("/api/parse-speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { data?: VoiceParseResult };
      if (body.data) result = body.data;
    } catch {
      // Network or server error — fall through to local parser below.
    }

    // If the API was unreachable or returned nothing, run the local regex
    // parser client-side as a safety net before reaching the error state.
    if (!result) {
      result = parseSpeechLocal(transcript);
    }

    const missing = result.missing_required ?? [];
    if (missing.length === 4) {
      // Every required field is still null — nothing useful was extracted.
      setErrorSource("parse");
      setParseError(
        "Couldn't make sense of that. Try again or type the details below.",
      );
      setPhase("error");
    } else {
      setParsed({ ...result, _key: String(Date.now()) });
      setPhase(missing.length > 0 ? "clarify" : "review");
    }

    setParsing(false);
  }

  function stopAndReview() {
    speech.stop();
  }

  function recordAgain() {
    speech.reset();
    setParsed(null);
    setParseError(null);
    setErrorSource(null);
    setManualEntry("");
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

  const errorTitle =
    phase === "error"
      ? errorSource === "recognition"
        ? "Type it instead"
        : "Couldn't parse that"
      : null;

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
                : phase === "clarify"
                  ? "Almost there"
                  : phase === "unsupported"
                    ? "Type the quote details"
                    : phase === "permission-denied"
                      ? "Microphone blocked"
                      : (errorTitle ?? "Couldn't parse that")}
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

        {phase === "clarify" && parsed ? (
          <ClarifyBody
            parsed={parsed}
            onPatch={patchField}
            onContinue={() => setPhase("review")}
            onRecordAgain={recordAgain}
          />
        ) : null}

        {/* "unsupported" and "error" share the same manual-entry fallback UI. */}
        {phase === "unsupported" || phase === "error" ? (
          <ManualEntryBody
            hint={
              phase === "unsupported"
                ? "Voice entry is not supported in this browser."
                : (parseError ?? "Couldn't parse that.")
            }
            manualEntry={manualEntry}
            onManualEntry={setManualEntry}
            onSubmit={() => {
              if (manualEntry.trim()) void runParser(manualEntry.trim());
            }}
            onRecordAgain={phase === "error" ? recordAgain : undefined}
            parsing={parsing}
          />
        ) : null}

        {phase === "permission-denied" ? (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-ink">
            Microphone permission was blocked. You can enable it in your browser
            settings or type the quote below.
          </p>
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

function ManualEntryBody({
  hint,
  manualEntry,
  onManualEntry,
  onSubmit,
  onRecordAgain,
  parsing,
}: {
  hint: string;
  manualEntry: string;
  onManualEntry: (v: string) => void;
  onSubmit: () => void;
  onRecordAgain?: () => void;
  parsing: boolean;
}) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-ink-muted">{hint}</p>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
          Type the quote details
        </span>
        <textarea
          rows={3}
          value={manualEntry}
          onChange={(e) => onManualEntry(e.target.value)}
          placeholder='e.g. "Tom roofing 8500 9 days"'
          className="w-full resize-none rounded-lg border border-line-subtle bg-surface-2 px-3 py-2 text-sm text-ink-strong placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
        />
      </label>
      <Button
        type="button"
        fullWidth
        disabled={!manualEntry.trim() || parsing}
        loading={parsing}
        onClick={onSubmit}
      >
        {parsing ? "Parsing…" : "Parse it"}
      </Button>
      {onRecordAgain ? (
        <button
          type="button"
          onClick={onRecordAgain}
          className="block w-full text-center text-xs text-ink-muted underline hover:text-ink-strong focus:outline-none"
        >
          Record again
        </button>
      ) : null}
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

function ClarifyBody({
  parsed,
  onPatch,
  onContinue,
  onRecordAgain,
}: {
  parsed: VoiceParseResult;
  onPatch: <K extends keyof VoiceParseResult>(
    key: K,
    value: VoiceParseResult[K],
  ) => void;
  onContinue: () => void;
  onRecordAgain: () => void;
}) {
  const missing = parsed.missing_required ?? [];
  const nextField = missing[0];

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-ink">
        I caught most of it, but{" "}
        <span className="font-semibold text-warning">
          {missing.length} field{missing.length === 1 ? "" : "s"}
        </span>{" "}
        still need{missing.length === 1 ? "s" : ""} you.
      </p>
      {nextField === "estimate_amount" ? (
        <FieldRow
          label="How much was the estimate?"
          prefix="$"
          type="number"
          value={parsed.estimate_amount?.toString() ?? ""}
          onChange={(v) => onPatch("estimate_amount", v ? Number(v) : null)}
          autoFocus
        />
      ) : null}
      {nextField === "days_silent" ? (
        <FieldRow
          label="How many days quiet?"
          type="number"
          value={parsed.days_silent?.toString() ?? ""}
          onChange={(v) => onPatch("days_silent", v ? Number(v) : null)}
          autoFocus
        />
      ) : null}
      {nextField === "trade" ? (
        <FieldRow
          label="Which trade?"
          value={parsed.trade ?? ""}
          onChange={(v) => onPatch("trade", (v || null) as VoiceParseResult["trade"])}
          autoFocus
        />
      ) : null}
      {nextField === "client_name" ? (
        <FieldRow
          label="Client name?"
          value={parsed.client_name ?? ""}
          onChange={(v) => onPatch("client_name", v || null)}
          autoFocus
        />
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Button type="button" fullWidth onClick={onContinue}>
          Continue
        </Button>
        <Button type="button" fullWidth variant="ghost" onClick={onRecordAgain}>
          Record again
        </Button>
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
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  prefix?: string;
  type?: "text" | "number";
  maxLength?: number;
  autoFocus?: boolean;
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
          autoFocus={autoFocus}
          className="h-10 flex-1 rounded-lg border border-line-subtle bg-surface-2 px-3 text-base text-ink-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
        />
      </span>
    </label>
  );
}
