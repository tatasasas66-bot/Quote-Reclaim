"use client";

import * as React from "react";

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
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

const SILENCE_MS = 1000;

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

function isPermissionDenied(event: unknown): boolean {
  const error =
    typeof event === "object" && event !== null && "error" in event
      ? String((event as { error?: unknown }).error)
      : "";
  return error === "not-allowed" || error === "service-not-allowed";
}

/**
 * Web Speech API wrapper. Returns a tiny imperative API so the modal can drive
 * start/stop without re-render churn. `supported` is detected on mount, never
 * at module load (avoids SSR `window` access).
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
  const silenceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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

  const clearSilenceTimer = React.useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stop = React.useCallback(() => {
    clearSilenceTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      // browser may throw if not started yet — ignore
    }
  }, [clearSilenceTimer]);

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
    recognition.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        const alt = event.results[i][0];
        if (alt) combined += alt.transcript;
      }
      setTranscript(combined);
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      }, SILENCE_MS);
    };
    recognition.onend = () => {
      setIsListening(false);
      clearSilenceTimer();
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      clearSilenceTimer();
      setError(
        isPermissionDenied(event) ? "permission-denied" : "recognition-error",
      );
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
  }, [clearSilenceTimer]);

  const reset = React.useCallback(() => {
    clearSilenceTimer();
    setTranscript("");
    setIsListening(false);
    setError(null);
  }, [clearSilenceTimer]);

  React.useEffect(() => {
    return () => {
      clearSilenceTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, [clearSilenceTimer]);

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
