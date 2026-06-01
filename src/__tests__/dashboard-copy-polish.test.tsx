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

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const heroSrc = readSource("../components/dashboard/HeroMetric.tsx");
const metricsSrc = readSource("../components/dashboard/MetricCards.tsx");

afterEach(cleanup);

function heroProps(over: Partial<React.ComponentProps<typeof HeroMetric>> = {}) {
  return {
    stillBleeding: 8_500,
    pendingCount: 3,
    recoveredThisMonth: 0,
    jobsWonThisMonth: 0,
    quotesBeingWorked: 3,
    emailFollowups: 0,
    allTimeRecovered: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Still Bleeding grammar — has/have agreement
// ---------------------------------------------------------------------------

describe("HeroMetric — Still Bleeding grammar", () => {
  it("singular: '1 quiet estimate still has money on the table.'", () => {
    render(React.createElement(HeroMetric, heroProps({ pendingCount: 1 })));
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
    render(React.createElement(HeroMetric, heroProps({ pendingCount: 3 })));
    expect(
      screen.getByText(
        /^3 quiet estimates still have money on the table\.$/,
      ),
    ).toBeTruthy();
  });

  it("zero: the calm empty-state line, no grammar issue to fix", () => {
    render(React.createElement(HeroMetric, heroProps({ pendingCount: 0 })));
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

  it("null: falls back to '--' (unchanged)", () => {
    renderCards({ coldestDays: null, avgDaysToWin: null });
    const placeholders = screen.getAllByText("--");
    expect(placeholders.length).toBeGreaterThanOrEqual(2);
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
