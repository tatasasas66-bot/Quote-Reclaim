/**
 * @vitest-environment happy-dom
 *
 * Rendered mobile-header guard. The previous polish pass missed a real layout
 * bug visible only at a ~375px viewport: the header action row wrapped to two
 * lines —
 *     "Upgrade —" / "$79/month"   and   "Sign" / "out"
 * — because the long Upgrade label plus Sign out were flex-shrunk next to the
 * brand eyebrow. Source inspection alone could not catch it (it's a flex-shrink
 * layout effect, not a string). These tests lock the responsive compact label
 * and the no-wrap / no-shrink guards that prevent the wrap.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { UpgradeButton } from "@/components/billing/UpgradeButton";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const dashboard = readSource("../app/(app)/dashboard/page.tsx");
const upgradeSrc = readSource("../components/billing/UpgradeButton.tsx");

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Upgrade button — compact one-line label on phones, full label on desktop
// ---------------------------------------------------------------------------

describe("Mobile header — Upgrade button does not wrap at 375px", () => {
  it("renders a compact one-line mobile label 'Upgrade $79'", () => {
    render(React.createElement(UpgradeButton));
    const compact = screen.getByText("Upgrade $79");
    expect(compact).toBeTruthy();
    // The compact label is the phone-only variant (hidden from sm: up).
    expect(compact.className).toContain("sm:hidden");
  });

  it("keeps the full 'Upgrade — $79/month' label for sm+ (desktop unchanged)", () => {
    render(React.createElement(UpgradeButton));
    const full = screen.getByText(/Upgrade — \$79\/month/);
    expect(full).toBeTruthy();
    // Full label is hidden on phones, shown from sm: up.
    expect(full.className).toContain("hidden");
    expect(full.className).toContain("sm:inline");
  });

  it("the rendered <button> carries whitespace-nowrap so the label cannot wrap", () => {
    render(React.createElement(UpgradeButton));
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("whitespace-nowrap");
  });

  it("the Upgrade control sits in a shrink-0 wrapper so it never compresses", () => {
    expect(upgradeSrc).toMatch(/flex shrink-0 flex-col items-end/);
  });

  it("price is unchanged — still $79/month (display-only fix, no pricing logic)", () => {
    expect(upgradeSrc).toContain('PRICE_LABEL = "$79/month"');
    // The compact label still surfaces the price ("$79"), just shorter.
    expect(upgradeSrc).toContain("Upgrade $79");
  });
});

// ---------------------------------------------------------------------------
// Sign out + brand eyebrow — no wrap, no squeeze, at 375px
// ---------------------------------------------------------------------------

describe("Mobile header — Sign out and brand never wrap or squeeze", () => {
  it("Sign out is whitespace-nowrap (no 'Sign' / 'out' two-line wrap)", () => {
    expect(dashboard).toMatch(/whitespace-nowrap[\s\S]*?>\s*Sign out/);
  });

  it("the header action group is shrink-0 (keeps natural width at 375px)", () => {
    expect(dashboard).toMatch(/flex shrink-0 items-center gap-3/);
  });

  it("the QUOTE RECLAIM eyebrow is whitespace-nowrap (brand not squeezed)", () => {
    expect(dashboard).toMatch(
      /whitespace-nowrap text-xs font-semibold uppercase tracking-widest text-brand/,
    );
  });

  it("header actions still render Upgrade then a subtle Sign out (order preserved)", () => {
    const upgradeIdx = dashboard.indexOf("<UpgradeButton");
    // Anchor on the sign-out form action (unambiguous; not the comment text).
    const signOutFormIdx = dashboard.indexOf('action="/api/auth/sign-out"');
    expect(upgradeIdx).toBeGreaterThan(0);
    expect(signOutFormIdx).toBeGreaterThan(upgradeIdx);
  });
});
