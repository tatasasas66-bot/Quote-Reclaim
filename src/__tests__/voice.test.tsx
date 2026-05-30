/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";

// Controllable fake of the speech hook so component tests are deterministic.
const mockSr = vi.hoisted(() => ({
  transcript: "",
  isListening: false,
  isSupported: true,
  error: null as string | null,
  start: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/hooks/useSpeechRecognition", () => ({
  useSpeechRecognition: () => mockSr,
  friendlySpeechError: (code: string) => code,
}));

// useFormState / useFormStatus are experimental react-dom hooks that the
// happy-dom test renderer does not wire up. QuoteForm uses them only for
// server-action plumbing; stub them so the form renders. These tests cover
// prefill + field presence, not server submission.
vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormState: (_action: unknown, initial: unknown) => [initial, () => {}],
    useFormStatus: () => ({ pending: false }),
  };
});

import { parseVoiceTranscript, EMPTY_PREFILL } from "@/lib/voice/parse-transcript";
import { VoiceModal } from "@/components/voice/VoiceModal";
import { QuoteForm } from "@/components/quotes/QuoteForm";
import type { ActionResult } from "@/lib/quotes/actions";

const noopAction = async (): Promise<ActionResult> => ({ ok: true });

beforeEach(() => {
  mockSr.transcript = "";
  mockSr.isListening = false;
  mockSr.isSupported = true;
  mockSr.error = null;
  mockSr.start.mockClear();
  mockSr.stop.mockClear();
  mockSr.reset.mockClear();
});

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe("parseVoiceTranscript", () => {
  it("parses the documented spoken example (number words + City State)", () => {
    expect(
      parseVoiceTranscript(
        "Tom, roofing, eighty five hundred, eight days quiet, Miami Florida.",
      ),
    ).toEqual({
      client_name: "Tom",
      trade: "Roofing",
      estimate_amount: "8500",
      days_silent: "8",
      city: "Miami",
      state: "FL",
    });
  });

  it("parses digit amounts, $ and commas, and 2-letter-free state names", () => {
    expect(
      parseVoiceTranscript("Sarah, plumbing, $2,400, 3 days quiet, Austin Texas"),
    ).toEqual({
      client_name: "Sarah",
      trade: "Plumbing",
      estimate_amount: "2400",
      days_silent: "3",
      city: "Austin",
      state: "TX",
    });
  });

  it("does not let the days number leak into the amount", () => {
    const parsed = parseVoiceTranscript("Dana, hvac, twelve thousand, 9 days quiet");
    expect(parsed.estimate_amount).toBe("12000");
    expect(parsed.days_silent).toBe("9");
    expect(parsed.trade).toBe("HVAC");
  });

  it("leaves unknown fields blank instead of guessing", () => {
    const parsed = parseVoiceTranscript("roofing job");
    expect(parsed.trade).toBe("Roofing");
    expect(parsed.estimate_amount).toBe("");
    expect(parsed.days_silent).toBe("");
    expect(parsed.state).toBe("");
  });

  it("returns an all-blank prefill for empty input", () => {
    expect(parseVoiceTranscript("   ")).toEqual(EMPTY_PREFILL);
  });
});

// ---------------------------------------------------------------------------
// VoiceModal — unsupported state
// ---------------------------------------------------------------------------

describe("VoiceModal", () => {
  it("renders the unsupported state (no crash) when isSupported is false", () => {
    mockSr.isSupported = false;
    render(
      React.createElement(VoiceModal, {
        open: true,
        onClose: vi.fn(),
        onComplete: vi.fn(),
      }),
    );
    expect(screen.getByText(/Voice isn.t available here/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("shows the manual-stop helper text while listening", () => {
    mockSr.isSupported = true;
    mockSr.isListening = true;
    render(
      React.createElement(VoiceModal, {
        open: true,
        onClose: vi.fn(),
        onComplete: vi.fn(),
      }),
    );
    expect(screen.getByText(/it will not\s+stop on its own/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Stop.*Review/ })).toBeTruthy();
  });

  it("surfaces the friendly error string in the error state", () => {
    mockSr.isSupported = true;
    mockSr.error = "Voice service unreachable. Type the quote instead.";
    render(
      React.createElement(VoiceModal, {
        open: true,
        onClose: vi.fn(),
        onComplete: vi.fn(),
      }),
    );
    expect(
      screen.getByText("Voice service unreachable. Type the quote instead."),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// VoiceButton -> QuoteForm prefill (enhancement wiring)
// ---------------------------------------------------------------------------

describe("VoiceButton prefills QuoteForm", () => {
  it("fills the form fields from a confirmed voice capture", () => {
    mockSr.isSupported = true;
    mockSr.transcript =
      "Tom, roofing, eighty five hundred, eight days quiet, Miami Florida.";

    const { container } = render(
      React.createElement(QuoteForm, { mode: "create", action: noopAction }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Add by voice/ }));
    fireEvent.click(screen.getByRole("button", { name: /Stop.*Review/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));

    const value = (sel: string) =>
      (container.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null)
        ?.value ?? null;

    expect(value('input[name="client_name"]')).toBe("Tom");
    expect(value('select[name="trade"]')).toBe("Roofing");
    expect(value('input[name="estimate_amount"]')).toBe("8500");
    expect(value('input[name="days_silent"]')).toBe("8");
    expect(value('input[name="city"]')).toBe("Miami");
    expect(value('select[name="state"]')).toBe("FL");
  });
});

// ---------------------------------------------------------------------------
// Enhancement-only: the manual form is fully usable without any voice
// ---------------------------------------------------------------------------

describe("QuoteForm works with no voice interaction", () => {
  it("renders all required manual fields and an enabled submit button", () => {
    const { container } = render(
      React.createElement(QuoteForm, { mode: "create", action: noopAction }),
    );

    // Manual fields exist and are editable without touching voice.
    for (const name of ["client_name", "trade", "estimate_amount", "days_silent"]) {
      const el = container.querySelector(`[name="${name}"]`) as HTMLElement | null;
      expect(el).not.toBeNull();
      expect(el?.hasAttribute("disabled")).toBe(false);
    }

    const submit = screen.getByRole("button", { name: "Build Recovery Plan" });
    expect(submit).toBeTruthy();
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not render the voice card in edit mode", () => {
    render(
      React.createElement(QuoteForm, { mode: "edit", action: noopAction }),
    );
    expect(screen.queryByRole("button", { name: /Add by voice/ })).toBeNull();
  });
});
