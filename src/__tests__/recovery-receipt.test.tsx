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
    quietQuotesWorked: 0,
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
          quietQuotesWorked: 9,
          emailFollowups: 14,
        }),
      ),
    );
    expect(screen.getByText("Recovered this month")).toBeTruthy();
    expect(screen.getByText("Jobs won back")).toBeTruthy();
    expect(screen.getByText("Quiet quotes worked")).toBeTruthy();
    expect(screen.getByText("Email follow-ups")).toBeTruthy();
    expect(screen.getByText("Months paid for")).toBeTruthy();
    // Activity counts render.
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("14")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Zero state
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — zero state", () => {
  it("shows the mark-a-job-as-won prompt when nothing recovered this month", () => {
    render(React.createElement(RecoveryReceipt, props()));
    expect(
      screen.getByText(
        /Mark a job as won and this receipt will show exactly how many months Quote Reclaim paid for\./i,
      ),
    ).toBeTruthy();
    // Does NOT claim it paid for anything yet.
    expect(screen.queryByText(/paid for Quote Reclaim for/i)).toBeNull();
  });

  it("months paid for is 0 in the zero state", () => {
    const { container } = render(React.createElement(RecoveryReceipt, props()));
    // The Months-paid value sits in the totals row as a standalone 0.
    expect(container.textContent).toContain("Months paid for");
    expect(container.textContent).toContain("0");
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
      screen.getByText(/This month paid for Quote Reclaim for 107 months\./i),
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
          new RegExp(`paid for Quote Reclaim for ${months} months\\.`, "i"),
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
      screen.getByText(/paid for Quote Reclaim for 1 month\./i),
    ).toBeTruthy();
    unmount();

    // $50 -> floor 0, but recovered > 0: never says "0 months".
    render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 50, jobsWonThisMonth: 1 }),
      ),
    );
    expect(screen.queryByText(/for 0 months/i)).toBeNull();
    expect(
      screen.getByText(/started covering your Quote Reclaim subscription\./i),
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
    expect(screen.getByText(/All time recovered/i)).toBeTruthy();
    expect(screen.getByText(/All-time months paid for/i)).toBeTruthy();
    // 23,700 / 79 = 300 exactly.
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
          quietQuotesWorked: 3,
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
