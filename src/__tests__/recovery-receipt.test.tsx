/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import {
  RecoveryReceipt,
  type RecoveryReceiptProps,
} from "@/components/dashboard/RecoveryReceipt";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const receiptSrc = readSource("../components/dashboard/RecoveryReceipt.tsx");
const heroSrc = readSource("../components/dashboard/HeroMetric.tsx");

afterEach(cleanup);

function props(over: Partial<RecoveryReceiptProps> = {}): RecoveryReceiptProps {
  return {
    recoveredThisMonth: 0,
    jobsWonThisMonth: 0,
    quotesBeingWorked: 0,
    emailFollowups: 0,
    allTimeRecovered: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Renders the receipt
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — renders", () => {
  it("renders the RECOVERY RECEIPT header and This month section", () => {
    render(React.createElement(RecoveryReceipt, props()));
    expect(screen.getByText("Recovery Receipt")).toBeTruthy();
    // Exact match so it does not collide with "Recovered this month".
    expect(screen.getByText("This month")).toBeTruthy();
  });

  it("renders all five This-month line items", () => {
    render(
      React.createElement(
        RecoveryReceipt,
        props({
          recoveredThisMonth: 8_500,
          jobsWonThisMonth: 2,
          quotesBeingWorked: 9,
          emailFollowups: 14,
        }),
      ),
    );
    expect(screen.getByText("Recovered this month")).toBeTruthy();
    expect(screen.getByText("Jobs won back")).toBeTruthy();
    expect(screen.getByText("Quotes being worked")).toBeTruthy();
    // Polish: the old "Quiet quotes worked" label is gone.
    expect(screen.queryByText("Quiet quotes worked")).toBeNull();
    // Polish: clarified the monthly follow-up label.
    expect(screen.getByText("Follow-ups this month")).toBeTruthy();
    expect(screen.queryByText("Email follow-ups")).toBeNull();
    // Hierarchy polish: the monthly total is now labeled "Months paid this
    // month" (the all-time "months paid for" hero leads above it).
    expect(screen.getByText("Months paid this month")).toBeTruthy();
    // Activity counts render.
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("14")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Hierarchy: all-time proof leads
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — all-time proof leads the hierarchy", () => {
  it("the all-time block appears ABOVE the this-month block in source order", () => {
    const allTimeIdx = receiptSrc.indexOf("All-time recovered");
    const thisMonthIdx = receiptSrc.indexOf("This month");
    expect(allTimeIdx).toBeGreaterThan(-1);
    expect(thisMonthIdx).toBeGreaterThan(-1);
    expect(allTimeIdx).toBeLessThan(thisMonthIdx);
  });

  it("all-time recovered + months paid are the large headline numbers", () => {
    render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 0, allTimeRecovered: 23_700 }),
      ),
    );
    // $23,700 / 79 = 300, shown once (single source — no duplicate footer).
    expect(screen.getByText("300")).toBeTruthy();
    expect(screen.getByText(/\$23,700/)).toBeTruthy();
    expect(screen.getByText("All-time recovered")).toBeTruthy();
    expect(screen.getByText("months paid for")).toBeTruthy();
  });

  it("stays non-empty on a fresh-month $0 day (all-time carries the proof)", () => {
    const { container } = render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 0, allTimeRecovered: 15_800 }),
      ),
    );
    const text = container.textContent ?? "";
    // $15,800 / 79 = 200 — the value proof is visible even with $0 this month.
    expect(text).toContain("$15,800");
    expect(text).toContain("200");
  });
});

// ---------------------------------------------------------------------------
// Zero state
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — zero state stays quiet (actual proof only)", () => {
  it("shows the quiet no-wins line instead of a months-paid prompt", () => {
    render(React.createElement(RecoveryReceipt, props()));
    expect(
      screen.getByText(/No wins marked this month yet\./i),
    ).toBeTruthy();
    expect(
      screen.getByText(/When a job comes back, it shows\s+here\./i),
    ).toBeTruthy();
    // The old big-zero framing and its prompt are gone.
    expect(
      screen.queryByText(/Mark a job as won to see how many months/i),
    ).toBeNull();
    expect(screen.queryByText(/wins covered/i)).toBeNull();
  });

  it("never renders 'Months paid this month' without a real win", () => {
    // A prominent "0 months paid" was an anti-proof headline. With zero
    // recovered this month the row simply does not exist; the potential
    // math lives in the Price-check meter instead.
    render(React.createElement(RecoveryReceipt, props()));
    expect(screen.queryByText("Months paid this month")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Recovered value + months-paid math (floor(amount / 79))
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — recovered value and months-paid math", () => {
  it("shows the recovered amount with a + prefix", () => {
    render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 8_500, jobsWonThisMonth: 1 }),
      ),
    );
    // formatCurrency renders $8,500 (CountUp finalizes synchronously when
    // value > 0 via rAF; assert via the recovered label + prefix presence).
    expect(screen.getByText("Recovered this month")).toBeTruthy();
    expect(screen.getByText(/\+\$/)).toBeTruthy();
  });

  it("months paid uses floor(recovered / 79) — $8,500 -> 107", () => {
    render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 8_500, jobsWonThisMonth: 1 }),
      ),
    );
    expect(
      screen.getByText(/wins covered 107 months of Quote Reclaim\./i),
    ).toBeTruthy();
  });

  it("floor math: $200 -> 2 months, $158 -> 2, $237 -> 3", () => {
    for (const [amount, months] of [
      [200, 2],
      [158, 2],
      [237, 3],
    ] as const) {
      const { unmount } = render(
        React.createElement(
          RecoveryReceipt,
          props({ recoveredThisMonth: amount, jobsWonThisMonth: 1 }),
        ),
      );
      expect(
        screen.getByText(
          new RegExp(`wins covered ${months} months of Quote Reclaim\\.`, "i"),
        ),
      ).toBeTruthy();
      unmount();
    }
  });

  it("singular 'month' for exactly 1, and a graceful line for sub-$79 recovery", () => {
    // $79 -> 1 month (singular).
    const { unmount } = render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 79, jobsWonThisMonth: 1 }),
      ),
    );
    expect(
      screen.getByText(/wins covered 1 month of Quote Reclaim\./i),
    ).toBeTruthy();
    unmount();

    // $50 -> floor 0, but recovered > 0: never says "0 months".
    render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 50, jobsWonThisMonth: 1 }),
      ),
    );
    expect(screen.queryByText(/covered 0 months/i)).toBeNull();
    expect(
      screen.getByText(/wins started covering your Quote Reclaim subscription\./i),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// All-time proof stays visible
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — all-time proof", () => {
  it("shows all-time recovered and all-time months paid (floor / 79)", () => {
    render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 0, allTimeRecovered: 23_700 }),
      ),
    );
    // Hierarchy polish: all-time is now the leading headline block.
    expect(screen.getByText("All-time recovered")).toBeTruthy();
    expect(screen.getByText("months paid for")).toBeTruthy();
    // 23,700 / 79 = 300 exactly, shown once (no duplicate footer).
    expect(screen.getByText("300")).toBeTruthy();
    expect(screen.getByText(/\$23,700/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Honest copy — no fabricated revenue, no guarantees, no banned vocab
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — honest copy", () => {
  it("only renders the exact numbers it is given (no projections/estimates)", () => {
    const { container } = render(
      React.createElement(
        RecoveryReceipt,
        props({
          recoveredThisMonth: 5_000,
          jobsWonThisMonth: 1,
          quotesBeingWorked: 3,
          emailFollowups: 4,
          allTimeRecovered: 5_000,
        }),
      ),
    );
    const text = container.textContent ?? "";
    // No projection / guarantee / forecast language.
    expect(text).not.toMatch(/guarantee/i);
    expect(text).not.toMatch(/projected|estimated to|on track to|could recover|up to \$/i);
    expect(text).not.toMatch(/\bBid\b/);
  });

  it("source contains no SaaS-cliché or fake-proof vocabulary", () => {
    for (const banned of [
      /\boptimize\b/i,
      /\bleverage\b/i,
      /\bworkflow\b/i,
      /\bengagement\b/i,
      /\bpipeline\b/i,
      /trusted by/i,
      /guaranteed/i,
    ]) {
      expect(receiptSrc).not.toMatch(banned);
    }
  });
});

// ---------------------------------------------------------------------------
// Copy polish — exact label strings the spec requires
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — polish copy", () => {
  it("source contains the 'Quotes being worked' label exactly once and no longer the old one", () => {
    expect(receiptSrc).toContain("Quotes being worked");
    expect(receiptSrc).not.toContain("Quiet quotes worked");
  });

  it("leads with an all-time headline block, not a small footer", () => {
    expect(receiptSrc).toContain("All-time recovered");
    expect(receiptSrc).toContain("recovered for you");
    expect(receiptSrc).toContain("months paid for");
    // The redundant duplicate "All-time …:" colon footer is gone (the numbers
    // now appear exactly once, as the leading headline).
    expect(receiptSrc).not.toContain("All-time recovered:");
    expect(receiptSrc).not.toContain("All-time months paid for:");
    // The monthly total is clearly scoped.
    expect(receiptSrc).toContain("Months paid this month");
  });
});

// ---------------------------------------------------------------------------
// Pricing logic unchanged — display math only
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — pricing untouched", () => {
  it("uses 79 for the months-paid display math (floor)", () => {
    expect(receiptSrc).toMatch(/MONTHLY_PRICE_USD\s*=\s*79/);
    expect(receiptSrc).toMatch(/Math\.floor\([^)]*MONTHLY_PRICE_USD/);
  });

  it("does not import or call any billing / pricing module", () => {
    // "subscription" is legitimate receipt prose; what matters is that the
    // component pulls in no billing/checkout machinery.
    expect(receiptSrc).not.toMatch(/from\s+["']@\/(lib\/billing|components\/billing)/);
    expect(receiptSrc).not.toMatch(/checkout|stripe|lemonsqueezy|UpgradeButton/i);
  });
});

// ---------------------------------------------------------------------------
// Integration — HeroMetric still owns Still Bleeding and mounts the receipt
// ---------------------------------------------------------------------------

describe("HeroMetric integration", () => {
  it("preserves the Still Bleeding hero and mounts RecoveryReceipt", () => {
    expect(heroSrc).toContain("STILL BLEEDING");
    expect(heroSrc).toContain("RecoveryReceipt");
  });
});
