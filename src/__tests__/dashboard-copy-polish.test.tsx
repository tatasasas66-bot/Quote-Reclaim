/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import { HeroMetric } from "@/components/dashboard/HeroMetric";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { QuoteListItem } from "@/components/quotes/QuoteListItem";
import type { QuoteRow } from "@/lib/quotes/repo";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const heroSrc = readSource("../components/dashboard/HeroMetric.tsx");
const metricsSrc = readSource("../components/dashboard/MetricCards.tsx");

function makeQuote(daysSilent: number): QuoteRow {
  return {
    id: "q-1",
    user_id: "u-1",
    client_name: "Jane Doe",
    client_email: null,
    client_phone: null,
    trade: "Roofing",
    estimate_amount: 8500,
    days_silent: daysSilent,
    quote_sent_at: new Date(Date.now() - daysSilent * 86_400_000).toISOString(),
    city: null,
    state: null,
    job_description: null,
    outcome: "pending",
    won_at: null,
    closed_at: null,
    client_opted_out: false,
    sequence_id: "s-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as QuoteRow;
}

afterEach(cleanup);

function heroProps(over: Partial<React.ComponentProps<typeof HeroMetric>> = {}) {
  return {
    stillBleeding: 8_500,
    pendingCount: 3,
    // Default to an at-risk dashboard so the "STILL BLEEDING" grammar lines
    // render; the calm-state cases override atRiskCount: 0 explicitly.
    atRiskCount: 1,
    recoveredThisMonth: 0,
    jobsWonThisMonth: 0,
    quotesBeingWorked: 3,
    emailFollowupsSent: 0,
    allTimeRecovered: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Still Bleeding grammar — has/have agreement (at-risk dashboards)
// ---------------------------------------------------------------------------

describe("HeroMetric — Still Bleeding grammar", () => {
  it("singular: '1 quiet estimate still has money on the table.'", () => {
    render(
      React.createElement(HeroMetric, heroProps({ pendingCount: 1, atRiskCount: 1 })),
    );
    expect(
      screen.getByText(
        /^1 quiet estimate still has money on the table\.$/,
      ),
    ).toBeTruthy();
    // No accidental 'have' in singular.
    expect(
      screen.queryByText(/1 quiet estimate still have/),
    ).toBeNull();
  });

  it("plural: '3 quiet estimates still have money on the table.'", () => {
    render(
      React.createElement(HeroMetric, heroProps({ pendingCount: 3, atRiskCount: 2 })),
    );
    expect(
      screen.getByText(
        /^3 quiet estimates still have money on the table\.$/,
      ),
    ).toBeTruthy();
  });

  it("at-risk dashboard keeps the STILL BLEEDING heading", () => {
    render(
      React.createElement(HeroMetric, heroProps({ pendingCount: 3, atRiskCount: 1 })),
    );
    expect(screen.getByText("STILL BLEEDING")).toBeTruthy();
    expect(screen.queryByText("MONEY ON THE TABLE")).toBeNull();
  });

  it("Fresh-only dashboard (no at-risk) shows MONEY ON THE TABLE, not STILL BLEEDING", () => {
    render(
      React.createElement(HeroMetric, heroProps({ pendingCount: 3, atRiskCount: 0 })),
    );
    expect(screen.getByText("MONEY ON THE TABLE")).toBeTruthy();
    expect(screen.queryByText("STILL BLEEDING")).toBeNull();
    expect(
      screen.getByText("3 estimates are in recovery."),
    ).toBeTruthy();
  });

  it("Fresh-only singular: '1 estimate is in recovery.'", () => {
    render(
      React.createElement(HeroMetric, heroProps({ pendingCount: 1, atRiskCount: 0 })),
    );
    expect(screen.getByText("MONEY ON THE TABLE")).toBeTruthy();
    expect(screen.getByText("1 estimate is in recovery.")).toBeTruthy();
  });

  it("zero: the calm empty-state line, no grammar issue to fix", () => {
    render(
      React.createElement(HeroMetric, heroProps({ pendingCount: 0, atRiskCount: 0 })),
    );
    expect(
      screen.getByText("No quiet estimates right now. The command center is clear."),
    ).toBeTruthy();
  });

  it("source encodes singular/plural verb agreement", () => {
    expect(heroSrc).toMatch(
      /pendingCount === 1\s*\?\s*"has"\s*:\s*"have"/,
    );
  });
});

// ---------------------------------------------------------------------------
// Quote card — Fresh priority reads "Fresh", never a bare "LOW"
// ---------------------------------------------------------------------------

describe("QuoteListItem — Fresh priority label", () => {
  it("a Fresh quote shows 'Fresh', not 'LOW'", () => {
    render(React.createElement(QuoteListItem, { quote: makeQuote(0) }));
    expect(screen.getByText("Fresh")).toBeTruthy();
    expect(screen.queryByText("LOW")).toBeNull();
  });

  it("an At Risk quote still shows 'HIGH' (only Fresh is relabeled)", () => {
    // days 7-13 => at_risk band => recoveryPriority HIGH.
    render(React.createElement(QuoteListItem, { quote: makeQuote(10) }));
    expect(screen.getByText("HIGH")).toBeTruthy();
    expect(screen.queryByText("Fresh")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Day labels — full words, never the glued "Xd" form
// ---------------------------------------------------------------------------

describe("MetricCards — day labels are full words", () => {
  function renderCards(
    over: Partial<React.ComponentProps<typeof MetricCards>> = {},
  ) {
    return render(
      React.createElement(MetricCards, {
        coldestDays: 19,
        coldestTrade: "Roofing",
        atRiskCount: 2,
        jobsWonLifetime: 0,
        avgDaysToWin: 4,
        ...over,
      }),
    );
  }

  it("plural: 19 -> '19 days', 4 -> '4 days'", () => {
    renderCards({ coldestDays: 19, avgDaysToWin: 4 });
    expect(screen.getByText("19 days")).toBeTruthy();
    expect(screen.getByText("4 days")).toBeTruthy();
  });

  it("singular: 1 -> '1 day' (never '1 days', never '1d')", () => {
    renderCards({ coldestDays: 1, avgDaysToWin: 1 });
    const matches = screen.getAllByText("1 day");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/1 days$/)).toBeNull();
    expect(screen.queryByText(/^1d$/)).toBeNull();
  });

  it("Coldest null falls back to '--'; Avg null shows the em dash + 'Need more wins'", () => {
    renderCards({ coldestDays: null, avgDaysToWin: null });
    // Coldest keeps the neutral '--' placeholder.
    expect(screen.getByText("--")).toBeTruthy();
    // Avg Days to Win never shows a misleading "0 days" / "--" — it reads as
    // insufficient data.
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("Need more wins")).toBeTruthy();
  });

  it("Avg Days to Win = 0 is treated as insufficient (shows '—', not '0 days')", () => {
    renderCards({ avgDaysToWin: 0 });
    expect(screen.queryByText("0 days")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("Need more wins")).toBeTruthy();
  });

  it("Avg Days to Win with real data still shows 'N days'", () => {
    renderCards({ avgDaysToWin: 6 });
    expect(screen.getByText("6 days")).toBeTruthy();
    expect(screen.getByText("Quote sent to won")).toBeTruthy();
  });

  it("no rendered MetricCard value renders the glued 'Xd' form", () => {
    const { container } = renderCards({ coldestDays: 19, avgDaysToWin: 4 });
    // Match any "N+d" not followed by a letter (so "Roofing" / "wins" / "days"
    // never trip it). The compact form would be e.g. "19d" or "4d".
    expect(container.textContent ?? "").not.toMatch(/\b\d+d(?![a-z])/i);
  });

  it("source uses the formatDays helper, never the inline `${value}d` template", () => {
    expect(metricsSrc).toContain("formatDays(coldestDays)");
    expect(metricsSrc).toContain("formatDays(avgDaysToWin)");
    expect(metricsSrc).not.toMatch(/\$\{coldestDays\}d/);
    expect(metricsSrc).not.toMatch(/\$\{avgDaysToWin\}d/);
  });
});
