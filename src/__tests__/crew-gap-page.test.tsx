/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as React from "react";

import { CrewGapClient } from "@/app/(app)/crew-gap/CrewGapClient";
import type { CrewGapQuote } from "@/lib/crew-gap/match";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

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
    client_phone: "555-123-4567",
    client_opted_out: false,
    ...overrides,
  };
}

const pageSrc = readSource("../app/(app)/crew-gap/page.tsx");
const clientSrc = readSource("../app/(app)/crew-gap/CrewGapClient.tsx");
const matchSrc = readSource("../lib/crew-gap/match.ts");
const dashboardSrc = readSource("../app/(app)/dashboard/page.tsx");
const paddleWebhookSrc = readSource("../app/api/webhooks/paddle/route.ts");

beforeEach(() => {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
  const w = window as unknown as { __qrEvents?: unknown; posthog?: unknown };
  delete w.__qrEvents;
  delete w.posthog;
});

afterEach(cleanup);

describe("Crew Gap Rescue page", () => {
  it("renders broad contractor copy and the complete input form", () => {
    render(
      <CrewGapClient
        quotes={[quote({})]}
        isPaid={false}
        freeRemaining={2}
      />,
    );

    expect(screen.getByText("Crew Gap Rescue")).toBeTruthy();
    expect(screen.getByLabelText(/open date/i)).toBeTruthy();
    expect(screen.getByLabelText(/crew size/i)).toBeTruthy();
    expect(screen.getByLabelText(/job type wanted/i)).toBeTruthy();
    expect(screen.getByLabelText(/minimum job value/i)).toBeTruthy();
    expect(screen.getByLabelText(/drive radius/i)).toBeTruthy();
    expect(screen.getByLabelText(/optional note/i)).toBeTruthy();
    expect(screen.getByText(/Then \$79\/month/i)).toBeTruthy();
    expect(screen.getByText(/not scheduling software/i)).toBeTruthy();
    expect(screen.getByText(/quiet quotes/i)).toBeTruthy();
  });

  it("runs the form and shows the best quote, reasons, backup quotes, message, and next moves", () => {
    render(
      <CrewGapClient
        quotes={[
          quote({ id: "best", estimate_amount: 4800, days_silent: 16 }),
          quote({
            id: "backup",
            estimate_amount: 2800,
            days_silent: 9,
            client_name: "Mike Jones",
          }),
        ]}
        isPaid={false}
        freeRemaining={1}
      />,
    );

    fireEvent.change(screen.getByLabelText(/open date/i), {
      target: { value: "2026-06-23" },
    });
    fireEvent.change(screen.getByLabelText(/job type wanted/i), {
      target: { value: "roofing" },
    });
    fireEvent.change(screen.getByLabelText(/minimum job value/i), {
      target: { value: "2000" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /find the quote most likely to fill it/i,
      }),
    );

    const result = screen.getByTestId("crew-gap-result");
    expect(result.textContent).toMatch(/Best quote to revive/i);
    expect(result.textContent).toMatch(/Sarah Mitchell/i);
    expect(result.textContent).toMatch(/\$4,800/);
    expect(result.textContent).toMatch(/Why this quote/i);
    expect(result.textContent).toMatch(/Backup quotes/i);
    expect(result.textContent).toMatch(/Next 3 moves/i);
    expect(screen.getByDisplayValue(/opening come up around/i)).toBeTruthy();
  });

  it("shows a no-fit warning instead of forcing an open-slot message", () => {
    render(
      <CrewGapClient
        quotes={[
          quote({
            id: "stale",
            estimate_amount: 800,
            days_silent: 120,
          }),
        ]}
        isPaid={false}
        freeRemaining={0}
      />,
    );

    fireEvent.change(screen.getByLabelText(/open date/i), {
      target: { value: "2026-06-23" },
    });
    fireEvent.change(screen.getByLabelText(/job type wanted/i), {
      target: { value: "roofing" },
    });
    fireEvent.change(screen.getByLabelText(/minimum job value/i), {
      target: { value: "3000" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /find the quote most likely to fill it/i,
      }),
    );

    expect(screen.getByTestId("crew-gap-no-fit").textContent).toMatch(
      /Do not force an open-slot message/i,
    );
    expect(screen.queryByDisplayValue(/opening come up around/i)).toBeNull();
  });

  it("tracks only privacy-safe crew-gap metadata", () => {
    render(
      <CrewGapClient
        quotes={[quote({ estimate_amount: 3200 })]}
        isPaid={false}
        freeRemaining={1}
      />,
    );

    fireEvent.change(screen.getByLabelText(/open date/i), {
      target: { value: "2026-06-23" },
    });
    fireEvent.change(screen.getByLabelText(/minimum job value/i), {
      target: { value: "2000" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /find the quote most likely to fill it/i,
      }),
    );

    const events =
      (window as unknown as {
        __qrEvents?: Array<{ event: string; props: Record<string, unknown> }>;
      }).__qrEvents ?? [];
    expect(events.map((event) => event.event)).toEqual([
      "crew_gap_page_viewed",
      "crew_gap_started",
      "crew_gap_completed",
    ]);
    const payload = JSON.stringify(events.map((event) => event.props));
    expect(payload).toContain("2500_4999");
    expect(payload).not.toContain("3200");
    expect(payload).not.toContain("Sarah");
    expect(payload).not.toContain("555");
    expect(payload).not.toContain("roof repair");
  });
});

describe("Crew Gap source guardrails", () => {
  const crewGapSrc = `${pageSrc}\n${clientSrc}\n${matchSrc}`;

  it("adds the /crew-gap route and dashboard entry point", () => {
    expect(pageSrc).toContain("Crew Gap Rescue");
    expect(dashboardSrc).toContain('href="/crew-gap"');
    expect(dashboardSrc).toContain("before buying another lead");
  });

  it("uses broad contractor language, not painter-only Crew Gap copy", () => {
    expect(crewGapSrc).not.toMatch(/\bpainters?\b|\bpainting\b/i);
    expect(crewGapSrc).toContain("home-service");
    expect(crewGapSrc).toContain("crew day");
    expect(crewGapSrc).toContain("quiet quotes");
  });

  it("uses the shared $79 price label and does not leak $49", () => {
    expect(clientSrc).toContain("PAYWALL_PRICE_LABEL");
    expect(crewGapSrc).not.toMatch(/\$49\b|49\/month/);
  });

  it("does not touch Paddle webhook or subscription state from Crew Gap", () => {
    expect(crewGapSrc).not.toMatch(/PADDLE_|paddle-provider|paddle-signature/i);
    expect(crewGapSrc).not.toMatch(/subscriptions|subscription state/i);
    expect(paddleWebhookSrc).not.toContain("crew_gap");
  });

  it("does not enable or import Supabase auth provider features", () => {
    expect(crewGapSrc).not.toMatch(/google|otp|signInWithOAuth|verifyOtp/i);
  });

  it("adds crew-gap analytics without changing the existing audit event names", () => {
    const trackSrc = readSource("../lib/analytics/track.ts");
    expect(trackSrc).toContain("crew_gap_page_viewed");
    expect(trackSrc).toContain("crew_gap_started");
    expect(trackSrc).toContain("crew_gap_completed");
    expect(trackSrc).toContain("audit_page_viewed");
    expect(trackSrc).toContain("audit_started");
    expect(trackSrc).toContain("audit_completed");
    expect(trackSrc).toContain("audit_signup_clicked");
    expect(clientSrc).not.toMatch(/from ["']posthog-js["']/);
  });
});
