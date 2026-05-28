/**
 * @vitest-environment happy-dom
 */
import * as React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceModal } from "@/components/voice/VoiceModal";

type MockRecognition = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
};

function installMockSpeech(target: "standard" | "webkit" = "standard"): MockRecognition[] {
  const instances: MockRecognition[] = [];
  class Recognition implements MockRecognition {
    start = vi.fn();
    stop = vi.fn();
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
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: target === "standard" ? Recognition : undefined,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    configurable: true,
    value: target === "webkit" ? Recognition : undefined,
  });
  return instances;
}

function clearSpeech() {
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    configurable: true,
    value: undefined,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearSpeech();
});

describe("VoiceModal support states", () => {
  it("unsupported browser shows the type-instead fallback", async () => {
    clearSpeech();

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Voice entry is not supported in this browser/),
      ).toBeTruthy();
    });
    expect(screen.getByText(/Cancel/)).toBeTruthy();
  });

  it("supported browser opens the listening flow", async () => {
    const instances = installMockSpeech("standard");

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Listening/ }),
      ).toBeTruthy();
    });
    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledTimes(1);
  });

  it("webkitSpeechRecognition opens the listening flow in Chrome", async () => {
    const instances = installMockSpeech("webkit");

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Listening/ }),
      ).toBeTruthy();
    });
    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledTimes(1);
  });

  it("network error shows the friendly type-instead message", async () => {
    const instances = installMockSpeech("standard");

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Listening/ }),
      ).toBeTruthy();
    });

    act(() => {
      instances[0].onerror?.({ error: "network" });
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          /Voice service unreachable\. Type the quote instead\./,
        ),
      ).toBeTruthy();
    });
  });

  it("permission denied shows the microphone permission message", async () => {
    const instances = installMockSpeech("standard");

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Listening/ }),
      ).toBeTruthy();
    });

    act(() => {
      instances[0].onerror?.({ error: "not-allowed" });
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Microphone permission denied/),
      ).toBeTruthy();
    });
  });
});
