import { describe, expect, it } from "vitest";
import { parseSpeechLocal } from "@/lib/voice/parse-local";

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
