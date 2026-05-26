"use client";

import * as React from "react";

type SpeechAlternativeLike = { transcript: string };
type SpeechResultLike = ArrayLike<SpeechAlternativeLike> & { isFinal: boolean };
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
};

type SpeechRecognitionLike = {
  start(): void;
  stop(): void;
  abort(): void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type VoiceError = "permission-denied" | "start-failed" | "recognition-error";

type WindowWithSpeech = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

export function getSpeechRecognitionConstructor(
  source: WindowWithSpeech | undefined | null,
): SpeechRecognitionCtor | null {
  if (!source) return null;
  return source.SpeechRecognition ?? source.webkitSpeechRecognition ?? null;
}

export function getVoiceSupport(
  source: WindowWithSpeech | undefined | null,
): {
  speechRecognition: boolean;
  webkitSpeechRecognition: boolean;
  isSecureContext: boolean;
} {
  return {
    speechRecognition: Boolean(source?.SpeechRecognition),
    webkitSpeechRecognition: Boolean(source?.webkitSpeechRecognition),
    isSecureContext: Boolean(source?.isSecureContext),
  };
}

function errorName(event: unknown): string {
  return typeof event === "object" && event !== null && "error" in event
    ? String((event as { error?: unknown }).error)
    : "";
}

function isPermissionDenied(event: unknown): boolean {
  const error = errorName(event);
  return error === "not-allowed" || error === "service-not-allowed";
}

/**
 * Errors the engine raises on its own during normal use. "no-speech" fires
 * after a silence pause and "aborted" fires when we call stop()/abort() — both
 * must be ignored so the mic keeps listening until the contractor stops it.
 */
function isNonFatalError(event: unknown): boolean {
  const error = errorName(event);
  return error === "no-speech" || error === "aborted";
}

/**
 * Web Speech API wrapper. Returns a tiny imperative API so the modal can drive
 * start/stop without re-render churn. `supported` is detected on mount, never
 * at module load (avoids SSR `window` access).
 *
 * The mic is contractor-controlled: it keeps listening across silence pauses
 * (each engine-initiated `onend` immediately restarts the same session) and
 * only stops when `stop()` is called or a fatal error occurs.
 */
export function useSpeechRecognition(): {
  supportChecked: boolean;
  supported: boolean;
  isListening: boolean;
  transcript: string;
  error: VoiceError | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
} {
  const [supportChecked, setSupportChecked] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const [transcript, setTranscript] = React.useState("");
  const [error, setError] = React.useState<VoiceError | null>(null);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  // True only when the contractor (or a fatal error) ended the session — gates
  // the auto-restart in onend so silence never closes the mic.
  const userStoppedRef = React.useRef(false);
  // Finalized text accumulated across restarts. Each restart resets the
  // engine's own results list, so we keep our own running transcript here.
  const transcriptRef = React.useRef("");

  React.useEffect(() => {
    if (typeof window === "undefined") {
      setSupportChecked(true);
      setSupported(false);
      return;
    }
    const w = window as WindowWithSpeech;
    const Ctor = getSpeechRecognitionConstructor(w);
    setSupported(Boolean(Ctor));
    setSupportChecked(true);

    if (process.env.NODE_ENV !== "production") {
      // Debug-safe: support flags only, never transcripts or customer data.
      console.info("voiceSupport:", getVoiceSupport(w));
    }
  }, []);

  const stop = React.useCallback(() => {
    userStoppedRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {
      // browser may throw if not started yet — ignore
    }
  }, []);

  const start = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const w = window as WindowWithSpeech;
    const Ctor = getSpeechRecognitionConstructor(w);
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    setError(null);
    userStoppedRef.current = false;
    transcriptRef.current = "";

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const alt = res[0];
        if (!alt) continue;
        if (res.isFinal) finalChunk += alt.transcript;
        else interimChunk += alt.transcript;
      }
      if (finalChunk) {
        transcriptRef.current = `${transcriptRef.current} ${finalChunk}`.trim();
      }
      setTranscript(`${transcriptRef.current} ${interimChunk}`.trim());
    };

    recognition.onerror = (event) => {
      // Silence and self-triggered aborts are non-fatal — keep listening.
      if (isNonFatalError(event)) return;
      userStoppedRef.current = true;
      setIsListening(false);
      setError(
        isPermissionDenied(event) ? "permission-denied" : "recognition-error",
      );
    };

    recognition.onend = () => {
      // A newer session replaced this one — let it own the state.
      if (recognitionRef.current !== recognition) return;
      // The engine ends the session on silence. Unless the contractor pressed
      // stop (or a fatal error fired), restart so the mic stays open.
      if (userStoppedRef.current) {
        setIsListening(false);
        return;
      }
      try {
        recognition.start();
      } catch {
        // already running — ignore
      }
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setError("start-failed");
    }
  }, []);

  const reset = React.useCallback(() => {
    userStoppedRef.current = true;
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    transcriptRef.current = "";
    setTranscript("");
    setIsListening(false);
    setError(null);
  }, []);

  React.useEffect(() => {
    return () => {
      userStoppedRef.current = true;
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    supportChecked,
    supported,
    isListening,
    transcript,
    error,
    start,
    stop,
    reset,
  };
}
