/**
 * @vitest-environment happy-dom
 *
 * Paid-For-Itself Meter — the "$49 feels small" proof panel.
 *
 * Contract:
 *   - Pure math from the contractor's OWN queue (biggest pending quote ÷
 *     monthly price). Never invented numbers, never a guarantee.
 *   - Renders nothing without real data big enough for the anchor to mean
 *     anything (months < 2 → null).
 *   - Anchor, not action: no CTA, no urgency, no checkout claim.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import * as React from "react";

import { PaidForItselfMeter } from "@/components/dashboard/PaidForItselfMeter";
import { MONTHLY_PRICE_USD } from "@/lib/payments/entitlement";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const meterSrc = readSource("../components/dashboard/PaidForItselfMeter.tsx");
const dashboardSrc = readSource("../app/(app)/dashboard/page.tsx");
const homepageSrc = readSource("../app/page.tsx");

afterEach(() => cleanup());

function renderText(node: React.ReactElement): string {
  const { container } = render(node);
  return container.textContent ?? "";
}

const BIG_QUOTE = {
  biggestQuoteName: "khaled hassan",
  biggestQuoteAmount: 22000,
  queueTotal: 42500,
  pendingCount: 5,
} as const;

// ───────────────────────────────────────────────────────────────────────
// Honest months math from real values only
// ───────────────────────────────────────────────────────────────────────

describe("PaidForItselfMeter — months math via roiFraming", () => {
  it("uses MONTHLY_PRICE_USD=49 as the source of truth", () => {
    expect(MONTHLY_PRICE_USD).toBe(49);
  });

  it("$22,000 flips to annual-multiple phrasing — never the silly 448-month line", () => {
    const text = renderText(React.createElement(PaidForItselfMeter, BIG_QUOTE));
    // floor(22000 / 588) = 37 → "37x a full year of Quote Reclaim"
    expect(text).toContain("37x a full year of Quote Reclaim");
    expect(text).not.toContain("448 months");
    // No three-digit month count, no months phrasing at all at this size.
    expect(text).not.toMatch(/\d{3,} months/);
    expect(text).not.toMatch(/\d+ months of Quote Reclaim/);
  });

  it("anchors with the contractor's real quote: name (title-cased), amount, queue total, count", () => {
    const text = renderText(React.createElement(PaidForItselfMeter, BIG_QUOTE));
    expect(text).toContain("Khaled Hassan");
    expect(text).toContain("$22,000");
    expect(text).toContain("$42,500");
    expect(text).toMatch(/5 quiet quotes/);
  });

  it("shows the math transparently and disclaims any promise (line preserved)", () => {
    const text = renderText(React.createElement(PaidForItselfMeter, BIG_QUOTE));
    expect(text).toMatch(/Straight math from your own queue/);
    expect(text).toContain("$49/month");
    expect(text).toMatch(/No promises/);
  });

  it("renders NOTHING when the queue has no quote big enough (months < 2)", () => {
    // At $49 a quote must be ≥ $98 to cover 2 months; everything below renders nothing.
    for (const amount of [0, -50, 49, 90, Number.NaN]) {
      const { container } = render(
        React.createElement(PaidForItselfMeter, {
          ...BIG_QUOTE,
          biggestQuoteAmount: amount,
        }),
      );
      expect(container.textContent ?? "").toBe("");
      cleanup();
    }
  });

  it("renders 'N months of Quote Reclaim' when amount is inside the 24-month natural range", () => {
    // At $49: $98 → 2 months, $1,100 → 22 months. Both under the 24-month flip line.
    for (const [amount, months] of [
      [98, 2],
      [1_100, 22],
    ] as const) {
      const text = renderText(
        React.createElement(PaidForItselfMeter, {
          ...BIG_QUOTE,
          biggestQuoteAmount: amount,
        }),
      );
      expect(text).toContain(`${months} months of Quote Reclaim`);
      cleanup();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// Anchor, not action — and never a dark pattern
// ───────────────────────────────────────────────────────────────────────

describe("PaidForItselfMeter — honest, no dark patterns, no checkout claims", () => {
  it("contains no CTA/button/link — proof only, never competes with DO THIS TODAY", () => {
    expect(meterSrc).not.toMatch(/<Button|<Link|href=|onClick/);
  });

  it("never guarantees recovery or revenue", () => {
    expect(meterSrc).not.toMatch(/\bguarantee/i);
    expect(meterSrc).not.toMatch(/will come back|will recover|recovered revenue/i);
  });

  it("invents no urgency, countdown, or scarcity", () => {
    expect(meterSrc).not.toMatch(
      /countdown|expires|hurry|only \d+ left|last chance|limited time|act now/i,
    );
  });

  it("makes no checkout/billing claim while billing is disabled", () => {
    expect(meterSrc).not.toMatch(/checkout|subscribe|upgrade|lemonsqueezy|stripe|paddle/i);
    expect(meterSrc).not.toMatch(/fetch\(/);
  });

  it("derives the price from the entitlement module — no second price constant", () => {
    expect(meterSrc).toContain('"@/lib/payments/entitlement"');
    expect(meterSrc).toContain("MONTHLY_PRICE_USD");
    expect(meterSrc).not.toMatch(/\b49\b\s*[*/]/); // no inline hardcoded math
  });

  it("contains no invented dollar figures — every number arrives via props", () => {
    expect(meterSrc).not.toMatch(/\$\d/);
    expect(meterSrc).not.toMatch(/\b(5000|42500|22000|47200)\b/);
  });

  it("uses money-gold styling, not panic red or generic SaaS blue", () => {
    expect(meterSrc).toMatch(/text-money/);
    expect(meterSrc).toMatch(/border-money\/30/);
    expect(meterSrc).not.toMatch(/text-danger|text-red|text-blue-\d/);
  });

  it("avoids regulated-finance / debt-collection vocabulary", () => {
    expect(meterSrc).not.toMatch(
      /debt|collection|lending|loan|credit repair|financial recovery/i,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────
// Dashboard wiring — real biggest quote, renders only when data exists
// ───────────────────────────────────────────────────────────────────────

describe("dashboard wires the meter to real queue data only", () => {
  it("computes the biggest pending quote and renders the meter only when one exists", () => {
    expect(dashboardSrc).toContain("PaidForItselfMeter");
    expect(dashboardSrc).toMatch(/const biggestPending = pending\.reduce/);
    expect(dashboardSrc).toMatch(/\{biggestPending \?\s*\(?\s*<PaidForItselfMeter/);
  });

  it("feeds it live values: client_name, estimate_amount, queue total, count", () => {
    expect(dashboardSrc).toMatch(/biggestQuoteName=\{biggestPending\.client_name\}/);
    expect(dashboardSrc).toMatch(
      /biggestQuoteAmount=\{Number\(biggestPending\.estimate_amount\)\}/,
    );
    expect(dashboardSrc).toMatch(/queueTotal=\{stillBleeding\}/);
    expect(dashboardSrc).toMatch(/pendingCount=\{pending\.length\}/);
  });

  it("lives in the aside — it never displaces the DO THIS TODAY action alert", () => {
    const alertIdx = dashboardSrc.indexOf("<RecoveryWindowAlert");
    const meterIdx = dashboardSrc.indexOf("<PaidForItselfMeter");
    expect(alertIdx).toBeGreaterThan(0);
    expect(meterIdx).toBeGreaterThan(alertIdx);
  });

  it("empty queue → no meter (FirstRecoveryCommand owns that state instead)", () => {
    // biggestPending reduces over pending; with zero quotes it is null and the
    // conditional renders nothing — the first-run panel handles empty users.
    expect(dashboardSrc).toMatch(/pending\.reduce<QuoteRow \| null>/);
    expect(dashboardSrc).toContain("FirstRecoveryCommand");
  });
});

// ───────────────────────────────────────────────────────────────────────
// Homepage — "first 3 free" is now stated at the price anchor
// ───────────────────────────────────────────────────────────────────────

describe("homepage trust line states the free start next to the price", () => {
  it("price anchor carries $49 and the honest recovered-job math", () => {
    expect(homepageSrc).toContain("$49/month");
    expect(homepageSrc).toMatch(/One recovered \$2,500 job can cover more than 4 years of Quote Reclaim\./);
    expect(homepageSrc).toMatch(/No software can promise a job back/);
  });
});
