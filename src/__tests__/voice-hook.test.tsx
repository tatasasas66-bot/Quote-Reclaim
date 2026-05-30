/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

type ErrLike = { error: string; message?: string };

// Minimal stand-in for the browser SpeechRecognition object. Records start/stop
// counts and lets tests fire the lifecycle callbacks the hook wires up.
class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: ErrLike) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  startCount = 0;
  stopCount = 0;
  abortCount = 0;
  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
  start() {
    this.startCount++;
    this.onstart?.();
  }
  stop() {
    this.stopCount++;
  }
  abort() {
    this.abortCount++;
  }
}

function setCtor(ctor: unknown) {
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  w.SpeechRecognition = ctor;
  w.webkitSpeechRecognition = undefined;
}

const lastInstance = () =>
  MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];

beforeEach(() => {
  MockSpeechRecognition.instances = [];
  setCtor(MockSpeechRecognition);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSpeechRecognition — manual-stop guarantee", () => {
  it("restarts the session on onend when the user did NOT press stop", () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.start());
    const inst = lastInstance();
    expect(inst.startCount).toBe(1);

    // Browser fires onend after a brief silence — hook must restart.
    act(() => inst.onend?.());
    expect(inst.startCount).toBe(2);

    // And again — it never auto-stops on its own.
    act(() => inst.onend?.());
    expect(inst.startCount).toBe(3);
  });

  it("does NOT restart after the user presses stop()", () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.start());
    const inst = lastInstance();
    expect(inst.startCount).toBe(1);

    act(() => result.current.stop());
    expect(inst.stopCount).toBe(1);

    // The browser still fires onend after stop() — but stoppedByUser blocks the restart.
    act(() => inst.onend?.());
    expect(inst.startCount).toBe(1);
    expect(result.current.isListening).toBe(false);
  });

  it("treats no-speech as non-fatal and keeps the session alive on onend", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const inst = lastInstance();

    act(() => inst.onerror?.({ error: "no-speech" }));
    expect(result.current.error).toBeNull();

    act(() => inst.onend?.());
    expect(inst.startCount).toBe(2); // restarted despite the no-speech blip
  });
});

describe("useSpeechRecognition — error surfacing", () => {
  it('surfaces the friendly fallback string on a "network" error and stops restarting', () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const inst = lastInstance();

    act(() => inst.onerror?.({ error: "network" }));
    expect(result.current.error).toBe(
      "Voice service unreachable. Type the quote instead.",
    );

    // A fatal error must NOT trigger the onend restart.
    act(() => inst.onend?.());
    expect(inst.startCount).toBe(1);
  });

  it('maps "not-allowed" to the mic-blocked fallback string', () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    act(() => lastInstance().onerror?.({ error: "not-allowed" }));
    expect(result.current.error).toBe(
      "Microphone blocked. Allow mic access or type instead.",
    );
  });

  it("maps unknown error codes to the generic fallback", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    act(() => lastInstance().onerror?.({ error: "audio-capture" }));
    expect(result.current.error).toBe(
      "Voice recognition error. Type the quote instead.",
    );
  });
});

describe("useSpeechRecognition — support detection", () => {
  it("isSupported is true when a constructor exists", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(true);
  });

  it("isSupported is false when neither constructor exists", () => {
    setCtor(undefined);
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(false);
  });
});
