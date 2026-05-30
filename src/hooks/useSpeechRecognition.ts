"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal Web Speech API typings. The standard lib.dom.d.ts does not ship
 * SpeechRecognition (it is non-standardized / vendor-prefixed), so we declare
 * just enough to use it without `any`.
 */
interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function friendlySpeechError(code: string): string {
  switch (code) {
    case "network":
      return "Voice service unreachable. Type the quote instead.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone blocked. Allow mic access or type instead.";
    default:
      return "Voice recognition error. Type the quote instead.";
  }
}

export type UseSpeechRecognition = {
  transcript: string;
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

export function useSpeechRecognition(): UseSpeechRecognition {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  // The whole manual-stop guarantee hinges on these two flags: onend only
  // restarts the session when neither is set.
  const stoppedByUserRef = useRef(false);
  const fatalErrorRef = useRef(false);

  useEffect(() => {
    setIsSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  const ensureInstance = useCallback((): SpeechRecognitionLike | null => {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalRef.current = `${finalRef.current}${text} `;
        } else {
          interim += text;
        }
      }
      setTranscript(`${finalRef.current}${interim}`.replace(/\s+/g, " ").trimStart());
    };

    recognition.onerror = (event) => {
      // "no-speech" / "aborted" are normal during pauses — never fatal.
      // Returning here lets onend fire and restart, defeating auto-stop.
      if (event.error === "no-speech" || event.error === "aborted") return;
      fatalErrorRef.current = true;
      setError(friendlySpeechError(event.error));
      setIsListening(false);
    };

    recognition.onend = () => {
      // Browsers fire onend after a short silence even with continuous=true.
      // Restart immediately to keep the session alive UNLESS the user pressed
      // stop or a fatal error fired. This is the manual-stop guarantee.
      if (stoppedByUserRef.current || fatalErrorRef.current) {
        setIsListening(false);
        return;
      }
      try {
        recognition.start();
      } catch {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, []);

  const start = useCallback(() => {
    const recognition = ensureInstance();
    if (!recognition) {
      setError(friendlySpeechError("default"));
      return;
    }
    stoppedByUserRef.current = false;
    fatalErrorRef.current = false;
    setError(null);
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      // start() throws if already running — that just means we are listening.
      setIsListening(true);
    }
  }, [ensureInstance]);

  const stop = useCallback(() => {
    stoppedByUserRef.current = true;
    setIsListening(false);
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    stoppedByUserRef.current = true;
    fatalErrorRef.current = false;
    finalRef.current = "";
    setTranscript("");
    setError(null);
    setIsListening(false);
    recognitionRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => {
      stoppedByUserRef.current = true;
      recognitionRef.current?.abort();
    };
  }, []);

  return { transcript, isListening, isSupported, error, start, stop, reset };
}
