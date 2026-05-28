/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { parseSpeechLocal } from "@/lib/voice/parse-local";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

describe("parseSpeechLocal — full sentences", () => {
  it('parses "Tom roofing eighty five hundred eight days silent Miami Florida"', () => {
    const result = parseSpeechLocal(
      "Tom roofing eighty five hundred eight days silent Miami Florida",
    );
    expect(result.client_name).toBe("Tom");
    expect(result.trade).toBe("Roofing");
    expect(result.estimate_amount).toBe(8500);
    expect(result.days_silent).toBe(8);
    expect(result.city).toBe("Miami");
    expect(result.state).toBe("FL");
    expect(result.missing_required).toEqual([]);
  });

  it('parses "HVAC quote for Tom forty two hundred sent yesterday"', () => {
    const result = parseSpeechLocal(
      "HVAC quote for Tom forty two hundred sent yesterday",
    );
    expect(result.trade).toBe("HVAC");
    expect(result.client_name).toBe("Tom");
    expect(result.estimate_amount).toBe(4200);
    expect(result.days_silent).toBe(1);
  });

  it('parses "twenty four hundred" as 2400, not 24', () => {
    const result = parseSpeechLocal(
      "Mary plumbing twenty four hundred three days silent",
    );
    expect(result.estimate_amount).toBe(2400);
  });

  it('parses "seven thousand nine hundred" as 7900', () => {
    const result = parseSpeechLocal(
      "Bob electrical seven thousand nine hundred five days silent",
    );
    expect(result.estimate_amount).toBe(7900);
  });

  it('parses "ten days silent" as days_silent: 10 (NEVER estimate_amount)', () => {
    const result = parseSpeechLocal("HVAC 10 days silent");
    expect(result.days_silent).toBe(10);
    expect(result.estimate_amount).toBeNull();
  });

  it('parses "10 days silent" word-form as days_silent: 10', () => {
    const result = parseSpeechLocal("Tom HVAC ten days silent");
    expect(result.days_silent).toBe(10);
    expect(result.estimate_amount).toBeNull();
  });

  it("extracts phone number into client_phone, not estimate_amount", () => {
    const result = parseSpeechLocal(
      "Phone 555-123-4567 HVAC Tom 4200 dollars 6 days",
    );
    expect(result.client_phone).toContain("555");
    expect(result.estimate_amount).toBe(4200);
    expect(result.days_silent).toBe(6);
  });

  it('marks missing_required when "Tom HVAC 6 days silent" has no amount', () => {
    const result = parseSpeechLocal("Tom HVAC 6 days silent");
    expect(result.client_name).toBe("Tom");
    expect(result.trade).toBe("HVAC");
    expect(result.days_silent).toBe(6);
    expect(result.estimate_amount).toBeNull();
    expect(result.missing_required).toContain("estimate_amount");
  });

  it('parses "a week ago" as 7 days silent', () => {
    const result = parseSpeechLocal("Sarah remodeling 12000 a week ago");
    expect(result.days_silent).toBe(7);
    expect(result.estimate_amount).toBe(12000);
  });

  it('rejects amount under 100 when picked from digit fallback', () => {
    // The fallback rule kicks in only for 3-7 digit runs, so "7" alone
    // can't be misread as $7. Stays null instead.
    const result = parseSpeechLocal("HVAC 7 days silent");
    expect(result.estimate_amount).toBeNull();
    expect(result.days_silent).toBe(7);
  });
});

describe("parseSpeechLocal — trade aliases", () => {
  it("maps HVAC variants", () => {
    expect(parseSpeechLocal("ac quote tom 4200 3 days").trade).toBe("HVAC");
    expect(parseSpeechLocal("furnace job 4200 3 days").trade).toBe("HVAC");
    expect(parseSpeechLocal("heating and cooling 4200 3 days").trade).toBe(
      "HVAC",
    );
  });

  it("maps trade variants for each canonical name", () => {
    expect(parseSpeechLocal("plumber tom 4200 3 days").trade).toBe("Plumbing");
    expect(parseSpeechLocal("roof tom 4200 3 days").trade).toBe("Roofing");
    expect(parseSpeechLocal("electrician tom 4200 3 days").trade).toBe(
      "Electrical",
    );
    expect(parseSpeechLocal("renovation tom 4200 3 days").trade).toBe(
      "Remodeling",
    );
    expect(parseSpeechLocal("general contractor tom 4200 3 days").trade).toBe(
      "General Contracting",
    );
  });
});

describe("parseSpeechLocal — state handling", () => {
  it("expands state names", () => {
    expect(parseSpeechLocal("tom hvac 4200 3 days texas").state).toBe("TX");
    expect(parseSpeechLocal("tom hvac 4200 3 days new york").state).toBe("NY");
  });

  it("accepts 2-letter codes", () => {
    expect(parseSpeechLocal("Tom HVAC 4200 3 days NY").state).toBe("NY");
  });
});

describe("parseSpeechLocal — dollar formats", () => {
  it("parses $8,500", () => {
    expect(parseSpeechLocal("tom roofing $8,500 8 days").estimate_amount).toBe(
      8500,
    );
  });

  it('parses "8500 dollars"', () => {
    expect(
      parseSpeechLocal("tom roofing 8500 dollars 8 days").estimate_amount,
    ).toBe(8500);
  });
});

describe("parseSpeechLocal — teen-hundred spoken amounts", () => {
  it('parses "twelve hundred" as 1200', () => {
    expect(
      parseSpeechLocal("Sara roofing twelve hundred 5 days").estimate_amount,
    ).toBe(1200);
  });

  it('parses "fifteen hundred" as 1500', () => {
    expect(
      parseSpeechLocal("Dave plumbing fifteen hundred 3 days").estimate_amount,
    ).toBe(1500);
  });

  it('parses "eleven hundred" as 1100', () => {
    expect(
      parseSpeechLocal("Mike electrical eleven hundred 7 days").estimate_amount,
    ).toBe(1100);
  });

  it('parses "nineteen hundred" as 1900', () => {
    expect(
      parseSpeechLocal("Ann HVAC nineteen hundred 10 days").estimate_amount,
    ).toBe(1900);
  });
});

// ---------------------------------------------------------------------------
// useSpeechRecognition — contractor-controlled start/stop (no auto-stop)
// ---------------------------------------------------------------------------

type MockRecognition = {
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

function installMockSpeech(): MockRecognition[] {
  const instances: MockRecognition[] = [];
  class Recognition implements MockRecognition {
    start = vi.fn();
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
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: Recognition,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  return instances;
}

/** Build a Web-Speech-style result list with the `isFinal` flag attached. */
function resultEvent(transcript: string, isFinal: boolean) {
  const result = Object.assign([{ transcript }], { isFinal });
  return { resultIndex: 0, results: [result] };
}

describe("useSpeechRecognition — manual stop control", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT auto-stop on silence — onend restarts the same session", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const instances = installMockSpeech();
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.start());
    expect(instances).toHaveLength(1);
    const rec = instances[0];
    expect(rec.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(true);

    // The engine ends the session after a silence pause.
    act(() => rec.onend?.());

    // The mic must keep listening: same instance restarted, no new instance.
    expect(instances).toHaveLength(1);
    expect(rec.start).toHaveBeenCalledTimes(2);
    expect(result.current.isListening).toBe(true);

    // Another silence pause — still restarts.
    act(() => rec.onend?.());
    expect(rec.start).toHaveBeenCalledTimes(3);
    expect(result.current.isListening).toBe(true);
  });

  it("stops only when the contractor presses stop (no restart after stop)", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const instances = installMockSpeech();
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.start());
    const rec = instances[0];
    expect(rec.start).toHaveBeenCalledTimes(1);

    act(() => result.current.stop());
    expect(rec.stop).toHaveBeenCalledTimes(1);

    // The engine fires onend after stop(); the hook must NOT restart.
    act(() => rec.onend?.());
    expect(rec.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(false);
  });

  it("treats no-speech and aborted errors as non-fatal (keeps listening)", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const instances = installMockSpeech();
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.start());
    const rec = instances[0];

    act(() => rec.onerror?.({ error: "no-speech" }));
    expect(result.current.error).toBeNull();
    expect(result.current.isListening).toBe(true);

    // onend after a no-speech error still restarts the mic.
    act(() => rec.onend?.());
    expect(rec.start).toHaveBeenCalledTimes(2);
    expect(result.current.isListening).toBe(true);
  });

  it("surfaces permission-denied as a fatal error and does not restart", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const instances = installMockSpeech();
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.start());
    const rec = instances[0];

    act(() => rec.onerror?.({ error: "not-allowed" }));
    expect(result.current.error).toBe("permission-denied");
    expect(result.current.isListening).toBe(false);

    act(() => rec.onend?.());
    expect(rec.start).toHaveBeenCalledTimes(1);
  });

  it("accumulates finalized transcript across restarts", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const instances = installMockSpeech();
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.start());
    const rec = instances[0];

    act(() => rec.onresult?.(resultEvent("tom roofing", true)));
    expect(result.current.transcript).toBe("tom roofing");

    // Silence pause ends and restarts the session (results list resets).
    act(() => rec.onend?.());
    act(() => rec.onresult?.(resultEvent("eight thousand", true)));
    expect(result.current.transcript).toBe("tom roofing eight thousand");
  });
});
