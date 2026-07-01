"use client";

import * as React from "react";
import { Mic, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import {
  EMPTY_PREFILL,
  parseVoiceTranscript,
  type VoicePrefill,
} from "@/lib/voice/parse-transcript";
import { TRADES, US_STATES } from "@/lib/utils/normalize";

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete: (parsed: VoicePrefill) => void;
};

type View = "listening" | "review" | "unsupported" | "error";

const fieldClass =
  "h-[52px] w-full rounded-xl border border-line-subtle bg-white px-4 text-base text-ink-strong shadow-premium focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/25";

export function VoiceModal({ open, onClose, onComplete }: Props) {
  const { transcript, isListening, isSupported, error, start, stop, reset } =
    useSpeechRecognition();
  const [view, setView] = React.useState<View>("listening");
  const [fields, setFields] = React.useState<VoicePrefill>(EMPTY_PREFILL);

  // Drive the view when the modal opens. start/reset are stable (useCallback).
  React.useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (!isSupported) {
      setView("unsupported");
      return;
    }
    setFields(EMPTY_PREFILL);
    setView("listening");
    reset();
    start();
  }, [open, isSupported, start, reset]);

  // A fatal recognition error flips to the error view.
  React.useEffect(() => {
    if (open && error) setView("error");
  }, [open, error]);

  if (!open) return null;

  function handleStopAndReview() {
    stop();
    setFields(parseVoiceTranscript(transcript));
    setView("review");
  }

  function handleStartOver() {
    setFields(EMPTY_PREFILL);
    reset();
    start();
    setView("listening");
  }

  function handleUseThis() {
    onComplete(fields);
  }

  function setField(key: keyof VoicePrefill, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a quote by voice"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-line-subtle bg-white p-6 shadow-premium">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded p-1 text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {view === "unsupported" ? (
          <div className="space-y-4">
            <h2 className="text-xl font-black text-ink-strong">
              Voice isn&apos;t available here
            </h2>
            <p className="text-sm text-ink-muted">
              This browser doesn&apos;t support voice capture. Type the quote in
              the form instead — every field works the same.
            </p>
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : null}

        {view === "error" ? (
          <div className="space-y-4">
            <h2 className="text-xl font-black text-ink-strong">
              Voice hit a snag
            </h2>
            <p role="alert" className="text-sm text-danger">
              {error ?? "Voice recognition error. Type the quote instead."}
            </p>
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : null}

        {view === "listening" ? (
          <div className="space-y-5 text-center">
            <div
              className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 ${
                isListening
                  ? "animate-pulse border-brand bg-brand/15 text-brand"
                  : "border-line-subtle bg-surface-2 text-ink-muted"
              }`}
            >
              <Mic className="h-9 w-9" aria-hidden="true" />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              {isListening ? "Listening" : "Starting…"}
            </p>

            <div className="min-h-[5rem] rounded-lg border border-line-subtle bg-surface-2 p-3 text-left text-sm leading-6 text-ink-strong">
              {transcript ? (
                transcript
              ) : (
                <span className="text-ink-muted">
                  Speak the customer, trade, amount, and days quiet…
                </span>
              )}
            </div>

            <Button
              type="button"
              fullWidth
              onClick={handleStopAndReview}
              className="min-h-14 bg-brand"
            >
              Stop &amp; Review
            </Button>
            <p className="text-xs text-ink-muted">
              Tap &quot;Stop &amp; Review&quot; when you are done — it will not
              stop on its own.
            </p>
          </div>
        ) : null}

        {view === "review" ? (
          <div className="space-y-4">
            <h2 className="text-xl font-black text-ink-strong">
              Check what we heard
            </h2>
            <p className="text-sm text-ink-muted">
              Fix anything that&apos;s off, then drop it into the form.
            </p>

            <div className="space-y-3">
              <ReviewField label="Client name">
                <input
                  className={fieldClass}
                  value={fields.client_name}
                  onChange={(e) => setField("client_name", e.target.value)}
                  autoComplete="off"
                />
              </ReviewField>

              <ReviewField label="Trade">
                <select
                  className={fieldClass}
                  value={fields.trade}
                  onChange={(e) => setField("trade", e.target.value)}
                >
                  <option value="">Choose a trade</option>
                  {TRADES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </ReviewField>

              <div className="grid grid-cols-2 gap-3">
                <ReviewField label="Amount (USD)">
                  <input
                    className={fieldClass}
                    inputMode="decimal"
                    value={fields.estimate_amount}
                    onChange={(e) => setField("estimate_amount", e.target.value)}
                  />
                </ReviewField>
                <ReviewField label="Days quiet">
                  <input
                    className={fieldClass}
                    inputMode="numeric"
                    value={fields.days_silent}
                    onChange={(e) => setField("days_silent", e.target.value)}
                  />
                </ReviewField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ReviewField label="City">
                  <input
                    className={fieldClass}
                    value={fields.city}
                    onChange={(e) => setField("city", e.target.value)}
                    autoComplete="off"
                  />
                </ReviewField>
                <ReviewField label="State">
                  <select
                    className={fieldClass}
                    value={fields.state}
                    onChange={(e) => setField("state", e.target.value)}
                  >
                    <option value="">—</option>
                    {US_STATES.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name} ({code})
                      </option>
                    ))}
                  </select>
                </ReviewField>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                type="button"
                fullWidth
                onClick={handleUseThis}
                className="min-h-12"
              >
                Use this
              </Button>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={handleStartOver}
                className="min-h-12"
              >
                Start over
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReviewField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-left">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
