/**
 * @vitest-environment happy-dom
 *
 * Recovery Receipt — actual proof only, no ROI/months-paid framing.
 *
 * The receipt used to host the ÷$49 months-paid equation in two places (top
 * headline and footer). That was the third repetition of the same equation
 * inside one screen (Price Check + Win Moment already carry it), and three
 * repetitions read as pleading. The receipt now shows dollars and counts
 * only; the ROI equation lives in exactly two places product-wide (Price
 * Check + Win Moment).
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
    emailFollowupsSent: 0,
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
    expect(screen.getByText("This month")).toBeTruthy();
  });

  it("renders all four This-month line items", () => {
    render(
      React.createElement(
        RecoveryReceipt,
        props({
          recoveredThisMonth: 8_500,
          jobsWonThisMonth: 2,
          quotesBeingWorked: 9,
          emailFollowupsSent: 14,
        }),
      ),
    );
    expect(screen.getByText("Recovered this month")).toBeTruthy();
    expect(screen.getByText("Jobs won back")).toBeTruthy();
    expect(screen.getByText("Quotes being worked")).toBeTruthy();
    // The label flipped to "Follow-ups sent this month" because the underlying
    // query now filters to sent = true. The vague "this month" label without
    // "sent" left room for the contractor to think it included scheduled
    // future-dated rows (the cause of the "2 quotes / 18 follow-ups" mismatch).
    expect(screen.getByText("Follow-ups sent this month")).toBeTruthy();
    expect(screen.queryByText("Follow-ups this month")).toBeNull();
    expect(screen.queryByText("Email follow-ups")).toBeNull();
    // The old "Months paid this month" footer row is gone entirely.
    expect(screen.queryByText("Months paid this month")).toBeNull();
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

  it("all-time recovered is the large headline dollar number (no months-paid stat)", () => {
    render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 0, allTimeRecovered: 23_700 }),
      ),
    );
    expect(screen.getByText(/\$23,700/)).toBeTruthy();
    expect(screen.getByText("All-time recovered")).toBeTruthy();
    expect(screen.getByText("recovered for you")).toBeTruthy();
    // The "months paid for" stat was removed; the dollars speak for themselves.
    expect(screen.queryByText("months paid for")).toBeNull();
    expect(screen.queryByText("month paid for")).toBeNull();
    // The all-time months number is also gone from the receipt.
    expect(screen.queryByText("300")).toBeNull();
  });

  it("stays non-empty on a fresh-month $0 day (all-time carries the proof)", () => {
    const { container } = render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 0, allTimeRecovered: 15_800 }),
      ),
    );
    const text = container.textContent ?? "";
    // The dollar value is still visible even with $0 this month.
    expect(text).toContain("$15,800");
    // The /79 derived number is NOT visible (it was 200; the receipt no
    // longer renders months-paid math at all).
    expect(text).not.toContain("200 months");
  });
});

// ---------------------------------------------------------------------------
// Zero state
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — zero state stays quiet (actual proof only)", () => {
  it("shows the quiet no-wins line, never a months-paid prompt", () => {
    render(React.createElement(RecoveryReceipt, props()));
    expect(
      screen.getByText(/No wins marked this month yet\./i),
    ).toBeTruthy();
    expect(
      screen.getByText(/When a job comes back, it shows\s+here\./i),
    ).toBeTruthy();
    expect(
      screen.queryByText(/Mark a job as won to see how many months/i),
    ).toBeNull();
    expect(screen.queryByText(/wins covered/i)).toBeNull();
    expect(screen.queryByText(/months paid/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Recovered value — dollars only, no /79 framing
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — recovered value renders, ROI framing removed", () => {
  it("shows the recovered amount with a + prefix", () => {
    render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 8_500, jobsWonThisMonth: 1 }),
      ),
    );
    expect(screen.getByText("Recovered this month")).toBeTruthy();
    expect(screen.getByText(/\+\$/)).toBeTruthy();
  });

  it("with a real win, footer line is the honest dollar-back line — never months-paid", () => {
    const { container } = render(
      React.createElement(
        RecoveryReceipt,
        props({ recoveredThisMonth: 8_500, jobsWonThisMonth: 1 }),
      ),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("real money back in the door this month");
    // The old "wins covered N months of Quote Reclaim" line is gone.
    expect(text).not.toMatch(/wins covered/i);
    expect(text).not.toMatch(/months of Quote Reclaim/i);
  });

  it("never says '0 months', '107 months', or any months-paid framing for any amount", () => {
    for (const amount of [50, 79, 200, 1580, 8_500, 12_000]) {
      const { container, unmount } = render(
        React.createElement(
          RecoveryReceipt,
          props({ recoveredThisMonth: amount, jobsWonThisMonth: 1 }),
        ),
      );
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\d+ months of Quote Reclaim/);
      expect(text).not.toMatch(/months paid/i);
      expect(text).not.toMatch(/\bwins covered\b/i);
      unmount();
    }
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
          emailFollowupsSent: 4,
          allTimeRecovered: 5_000,
        }),
      ),
    );
    const text = container.textContent ?? "";
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
// Copy polish — exact label strings the new spec requires
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — polish copy", () => {
  it("source contains the 'Quotes being worked' label", () => {
    expect(receiptSrc).toContain("Quotes being worked");
    expect(receiptSrc).not.toContain("Quiet quotes worked");
  });

  it("leads with the all-time dollar headline (no months-paid stat)", () => {
    expect(receiptSrc).toContain("All-time recovered");
    expect(receiptSrc).toContain("recovered for you");
    // The months-paid stat (top and footer) is removed entirely.
    expect(receiptSrc).not.toContain("months paid for");
    expect(receiptSrc).not.toContain("Months paid this month");
    expect(receiptSrc).not.toContain("MONTHLY_PRICE_USD");
    expect(receiptSrc).not.toContain("Math.floor");
  });
});

// ---------------------------------------------------------------------------
// Pricing — receipt no longer carries pricing math at all
// ---------------------------------------------------------------------------

describe("RecoveryReceipt — pricing math removed", () => {
  it("does not import or call any billing / pricing module", () => {
    expect(receiptSrc).not.toMatch(/from\s+["']@\/(lib\/billing|components\/billing)/);
    expect(receiptSrc).not.toMatch(/checkout|stripe|lemonsqueezy|UpgradeButton/i);
  });

  it("does not import roiFraming either — the ROI equation lives in Price Check and Win Moment only", () => {
    expect(receiptSrc).not.toMatch(/roi-framing|roiFraming|roiPieces/);
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

  it("HeroMetric passes the renamed emailFollowupsSent prop through", () => {
    expect(heroSrc).toContain("emailFollowupsSent={emailFollowupsSent}");
    expect(heroSrc).not.toMatch(/emailFollowups[^S]/);
  });
});
