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

type WindowWithSpeech = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

const SILENCE_MS = 1000;

/**
 * Web Speech API wrapper. Returns a tiny imperative API so the modal can drive
 * start/stop without re-render churn. `supported` is detected on mount, never
 * at module load (avoids SSR `window` access).
 */
export function useSpeechRecognition(): {
  supported: boolean;
  isListening: boolean;
  transcript: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
} {
  const [supported, setSupported] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const [transcript, setTranscript] = React.useState("");
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as WindowWithSpeech;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setSupported(Boolean(Ctor));
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
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
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
    recognition.onerror = () => {
      setIsListening(false);
      clearSilenceTimer();
    };
    recognitionRef.current = recognition;
    setTranscript("");
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }, [clearSilenceTimer]);

  const reset = React.useCallback(() => {
    clearSilenceTimer();
    setTranscript("");
    setIsListening(false);
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

  return { supported, isListening, transcript, start, stop, reset };
}
