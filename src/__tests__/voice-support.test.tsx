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

type MockMediaRecorder = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  ondataavailable: ((event: unknown) => void) | null;
  onstop: (() => void) | null;
  state: "inactive" | "recording" | "paused";
};

function setMediaRecorderMock(options?: { shouldFail?: boolean }) {
  if (options?.shouldFail) {
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    return;
  }

  class MockMediaRecorder {
    ondataavailable: ((event: unknown) => void) | null = null;
    onstop: (() => void) | null = null;
    state: "inactive" | "recording" | "paused" = "recording";
    start = vi.fn(() => {
      this.state = "recording";
    });
    stop = vi.fn(() => {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob() });
      setTimeout(() => this.onstop?.(), 0);
    });
  }

  Object.defineProperty(window, "MediaRecorder", {
    configurable: true,
    value: MockMediaRecorder,
  });

  const mockStream = {
    getTracks: vi.fn(() => [{ stop: vi.fn() }]),
  };

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setMediaRecorderMock({ shouldFail: true });
});

describe("voice support detection", () => {
  it("MediaRecorder + getUserMedia is treated as supported", () => {
    setMediaRecorderMock();
    expect(getSpeechRecognitionConstructor()).toBe(true);
    const support = getVoiceSupport();
    expect(support.mediaRecorder).toBe(true);
    expect(support.getUserMedia).toBe(true);
  });

  it("reports unsupported when MediaRecorder is missing", () => {
    setMediaRecorderMock({ shouldFail: true });
    // After setting to fail, check the result
    const isSupported = getSpeechRecognitionConstructor();
    expect(isSupported).toBe(false);
  });

  it("no window on SSR does not crash", () => {
    expect(() => getSpeechRecognitionConstructor()).not.toThrow();
    expect(() => getVoiceSupport()).not.toThrow();
  });
});

describe("VoiceModal support states", () => {
  it("unsupported browser shows text-entry fallback", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    setMediaRecorderMock({ shouldFail: true });

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Voice entry is not supported in this browser\./),
      ).toBeTruthy();
    });
    // A textarea must be present so the user can type the quote details.
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeTruthy();
    expect(screen.getByText(/Parse it/)).toBeTruthy();
  });

  it("permission denied shows microphone permission message", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: class {
        start() {}
        stop() {}
        ondataavailable: null = null;
        onstop: null = null;
      },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    });

    render(<VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /Microphone permission was blocked\. You can enable it in your browser settings or type the quote below\./,
        ),
      ).toBeTruthy();
    });
  });

  it("supported browser initializes without crashing", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    setMediaRecorderMock();

    const { container } = render(
      <VoiceModal onClose={vi.fn()} onApprove={vi.fn()} />,
    );

    // The modal should render without errors and eventually show either
    // "Checking" or "Recording" or the listening prompt
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    });

    // Check that some listening-related text exists
    const text = container.textContent || "";
    expect(
      text.includes("Checking") ||
        text.includes("Recording") ||
        text.includes("Listening"),
    ).toBe(true);
  });
});
