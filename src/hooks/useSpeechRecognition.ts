"use client";

import * as React from "react";

type SpeechAlternativeLike = { transcript: string };
type SpeechResultLike = ArrayLike<SpeechAlternativeLike> & { isFinal: boolean };
type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
};
type SpeechErrorEvent = { error: string };

type SpeechRecognitionInstance = {
  start: () => void;
  stop: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
};

type WindowWithSpeech = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
};

/**
 * Web Speech API wrapper. The mic is contractor-controlled: it keeps listening
 * across silence pauses (each engine-initiated `onend` immediately restarts the
 * same session) and only stops when `stop()` is called or a fatal error fires.
 *
 * `error` is a user-facing string ready to render — network failures map to a
 * "type it instead" message rather than a raw error code.
 */
export function useSpeechRecognition(): {
  supportChecked: boolean;
  supported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
} {
  const [supportChecked, setSupportChecked] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const [transcript, setTranscript] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const recognitionRef = React.useRef<SpeechRecognitionInstance | null>(null);
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
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      setSupportChecked(true);
      return;
    }
    setSupported(true);
    setSupportChecked(true);

    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (event: SpeechResultEvent) => {
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

    r.onerror = (event: SpeechErrorEvent) => {
      // Silence and self-triggered aborts are non-fatal — keep listening.
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "network") {
        setError("Voice service unreachable. Type the quote instead.");
      } else if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setError("Microphone permission denied. Enable it in browser settings.");
      } else {
        setError("Voice recognition error. Type the quote instead.");
      }
      userStoppedRef.current = true;
      setIsListening(false);
    };

    r.onend = () => {
      // The engine ends the session on silence. Unless the contractor pressed
      // stop (or a fatal error fired), restart so the mic stays open.
      if (!userStoppedRef.current) {
        try {
          r.start();
        } catch {
          // already started — ignore
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = r;
    return () => {
      userStoppedRef.current = true;
      try {
        r.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const start = React.useCallback(() => {
    if (!recognitionRef.current) return;
    transcriptRef.current = "";
    setTranscript("");
    setError(null);
    userStoppedRef.current = false;
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      // Calling start() twice throws; treat as already-listening, not an error.
    }
  }, []);

  const stop = React.useCallback(() => {
    if (!recognitionRef.current) return;
    userStoppedRef.current = true;
    try {
      recognitionRef.current.stop();
    } catch {
      // ignore
    }
    // isListening flips false in onend, once the final transcript has landed.
  }, []);

  return { supportChecked, supported, isListening, transcript, error, start, stop };
}
