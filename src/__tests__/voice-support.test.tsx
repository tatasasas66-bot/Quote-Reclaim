/**
 * @vitest-environment happy-dom
 */
import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceModal } from "@/components/voice/VoiceModal";
import {
  getSpeechRecognitionConstructor,
  getVoiceSupport,
} from "@/hooks/useSpeechRecognition";

type MockRecognitionInstance = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
};

function makeRecognitionMock(options?: {
  onStart?: (instance: MockRecognitionInstance) => void;
}) {
  const instances: MockRecognitionInstance[] = [];

  class MockRecognition implements MockRecognitionInstance {
    start = vi.fn(() => options?.onStart?.(this));
    stop = vi.fn();
    abort = vi.fn();
    continuous = false;
    interimResults = false;
    lang = "";
    onresult: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;

    constructor() {
      instances.push(this);
    }
  }

  return {
    Ctor: MockRecognition,
    instances,
  };
}

function setSpeechConstructors({
  SpeechRecognition,
  webkitSpeechRecognition,
}: {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
}) {
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: SpeechRecognition,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    configurable: true,
    value: webkitSpeechRecognition,
  });
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setSpeechConstructors({});
});

describe("voice support detection", () => {
  it("Chrome-style webkitSpeechRecognition is treated as supported", () => {
    const { Ctor } = makeRecognitionMock();
    const source = { webkitSpeechRecognition: Ctor, isSecureContext: true };

    expect(getSpeechRecognitionConstructor(source as never)).toBe(Ctor);
    expect(getVoiceSupport(source as never)).toEqual({
      speechRecognition: false,
      webkitSpeechRecognition: true,
      isSecureContext: true,
    });
  });

  it("SpeechRecognition is treated as supported", () => {
    const { Ctor } = makeRecognitionMock();
    const source = { SpeechRecognition: Ctor, isSecureContext: true };

    expect(getSpeechRecognitionConstructor(source as never)).toBe(Ctor);
    expect(getVoiceSupport(source as never).speechRecognition).toBe(true);
  });

  it("no window on SSR does not crash", () => {
    expect(() => getSpeechRecognitionConstructor(undefined)).not.toThrow();
    expect(() => getVoiceSupport(undefined)).not.toThrow();
    expect(getSpeechRecognitionConstructor(undefined)).toBeNull();
  });
});

describe("VoiceModal support states", () => {
  it("unsupported browser shows muted fallback", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    setSpeechConstructors({});

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /Voice entry is not supported in this browser\. You can still type the quote below\./,
        ),
      ).toBeTruthy();
    });
  });

  it("permission denied shows microphone permission message", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { Ctor } = makeRecognitionMock({
      onStart: (instance) => instance.onerror?.({ error: "not-allowed" }),
    });
    setSpeechConstructors({ SpeechRecognition: Ctor });

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /Microphone permission was blocked\. You can enable it in your browser settings or type the quote below\./,
        ),
      ).toBeTruthy();
    });
  });

  it("supported browser opens listening flow", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { Ctor, instances } = makeRecognitionMock();
    setSpeechConstructors({ SpeechRecognition: Ctor });

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Listening/)).toBeTruthy();
    });
    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledTimes(1);
  });

  it("webkitSpeechRecognition opens listening flow in Chrome", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { Ctor, instances } = makeRecognitionMock();
    setSpeechConstructors({ webkitSpeechRecognition: Ctor });

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Listening/)).toBeTruthy();
    });
    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledTimes(1);
  });
});
