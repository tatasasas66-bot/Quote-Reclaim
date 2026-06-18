import { describe, expect, it } from "vitest";
import {
  buildCrewGapMessage,
  matchCrewGap,
  type CrewGapQuote,
} from "@/lib/crew-gap/match";

function quote(overrides: Partial<CrewGapQuote>): CrewGapQuote {
  return {
    id: "q1",
    trade: "Roofing",
    city: "Tampa",
    state: "FL",
    estimate_amount: 3200,
    job_description: "roof repair",
    days_silent: 18,
    quote_sent_at: null,
    client_name: "Sarah Mitchell",
    client_email: "sarah@example.com",
    client_phone: null,
    client_opted_out: false,
    ...overrides,
  };
}

const input = {
  openDate: "2026-06-23",
  crewSize: 2,
  jobTypeWanted: "roofing",
  minimumJobValue: 2000,
  driveRadiusMiles: 20,
  note: "",
};

describe("Crew Gap matching", () => {
  it("selects the highest defensible quote, not the biggest long-cold quote", () => {
    const result = matchCrewGap(
      [
        quote({ id: "warm", estimate_amount: 4800, days_silent: 16 }),
        quote({
          id: "stale",
          estimate_amount: 12000,
          days_silent: 120,
        }),
        quote({ id: "small", estimate_amount: 2600, days_silent: 8 }),
      ],
      input,
      new Date(2026, 5, 18),
    );

    expect(result.recommendation?.quote.id).toBe("warm");
    expect(result.recommendation?.windowLabel).toBe("Cooling");
    expect(result.backupQuotes.map((candidate) => candidate.quote.id)).toContain(
      "small",
    );
  });

  it("requires the quote to fit the minimum, job type, contactability, and recovery window", () => {
    const result = matchCrewGap(
      [
        quote({ id: "too-low", estimate_amount: 900, days_silent: 10 }),
        quote({
          id: "wrong-trade",
          trade: "Painting",
          job_description: "interior repaint",
          estimate_amount: 5000,
          days_silent: 12,
        }),
        quote({
          id: "no-contact",
          estimate_amount: 4500,
          days_silent: 12,
          client_email: null,
          client_phone: null,
        }),
      ],
      input,
      new Date(2026, 5, 18),
    );

    expect(result.recommendation).toBeNull();
    expect(result.warning).toMatch(/No good quote fits this crew gap/i);
    expect(result.backupQuotes.length).toBeGreaterThan(0);
  });

  it("uses the open date to create a real reason without inventing a deadline", () => {
    const message = buildCrewGapMessage(quote({}), input);

    expect(message).toMatch(/opening come up around/i);
    expect(message).toMatch(/Tuesday, Jun 23/i);
    expect(message).not.toMatch(/hold.*until|deadline|last chance/i);
    expect(message).not.toMatch(/desperate|need work|empty crew/i);
  });

  it("does not mention an open slot when no open date exists", () => {
    const message = buildCrewGapMessage(quote({}), {
      openDate: "",
      jobTypeWanted: "roofing",
    });

    expect(message).not.toMatch(/opening|open slot|crew day|hold/i);
    expect(message).toMatch(/still thinking about/i);
  });

  it("explains the decision in plain contractor logic", () => {
    const result = matchCrewGap(
      [quote({ id: "best", days_silent: 8, estimate_amount: 6200 })],
      input,
      new Date(2026, 5, 18),
    );

    expect(result.recommendation?.reasons.join(" ")).toMatch(
      /minimum job value/i,
    );
    expect(result.recommendation?.reasons.join(" ")).toMatch(
      /recent enough to reopen/i,
    );
    expect(result.nextThreeMoves.join(" ")).toMatch(/20-mile drive radius/i);
  });
});
