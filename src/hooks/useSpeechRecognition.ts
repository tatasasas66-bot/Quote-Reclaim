"use client";

import * as React from "react";

type VoiceError = "permission-denied" | "audio-capture-failed" | "recording-failed";

export function getSpeechRecognitionConstructor(): boolean {
  if (typeof window === "undefined") return false;
  return "MediaRecorder" in window && navigator.mediaDevices?.getUserMedia != null;
}

export function getVoiceSupport(): {
  mediaRecorder: boolean;
  getUserMedia: boolean;
  isSecureContext: boolean;
} {
  return {
    mediaRecorder: typeof window !== "undefined" && "MediaRecorder" in window,
    getUserMedia: typeof window !== "undefined" && navigator.mediaDevices?.getUserMedia != null,
    isSecureContext: typeof window !== "undefined" ? Boolean((window as any).isSecureContext) : false,
  };
}

/**
 * Browser MediaRecorder wrapper for capturing microphone audio.
 * Records continuously while the contractor speaks and packages audio as a
 * Blob when stop() is called. The parent component POSTs the blob to the
 * backend transcription endpoint.
 *
 * The mic is contractor-controlled: starts on demand, stops on demand,
 * and only fails on permission denial or hardware failure.
 */
export function useSpeechRecognition(): {
  supportChecked: boolean;
  supported: boolean;
  isListening: boolean;
  audioBlob: Blob | null;
  error: VoiceError | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
} {
  const [supportChecked, setSupportChecked] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const [audioBlob, setAudioBlob] = React.useState<Blob | null>(null);
  const [error, setError] = React.useState<VoiceError | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      setSupportChecked(true);
      setSupported(false);
      return;
    }
    const isSupported = getSpeechRecognitionConstructor();
    setSupported(isSupported);
    setSupportChecked(true);

    if (process.env.NODE_ENV !== "production") {
      console.info("voiceSupport:", getVoiceSupport());
    }
  }, []);

  const start = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("MediaRecorder" in window)) return;

    setError(null);
    chunksRef.current = [];
    setAudioBlob(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      setIsListening(false);
      if ((err as DOMException).name === "NotAllowedError") {
        setError("permission-denied");
      } else {
        setError("audio-capture-failed");
      }
    }
  }, []);

  const stop = React.useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;

    if (!recorder) {
      setIsListening(false);
      return;
    }

    return new Promise<void>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setIsListening(false);

        if (stream) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
        }
        streamRef.current = null;
        mediaRecorderRef.current = null;
        resolve();
      };

      try {
        recorder.stop();
      } catch {
        setIsListening(false);
        setError("recording-failed");
        resolve();
      }
    });
  }, []);

  const reset = React.useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    mediaRecorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];
    setIsListening(false);
    setAudioBlob(null);
    setError(null);
  }, []);

  React.useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      const stream = streamRef.current;

      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  return {
    supportChecked,
    supported,
    isListening,
    audioBlob,
    error,
    start,
    stop,
    reset,
  };
}

