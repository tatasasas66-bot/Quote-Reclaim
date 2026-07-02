/**
 * @vitest-environment happy-dom
 *
 * Rendered mobile-header guard. The previous polish pass missed a real layout
 * bug visible only at a ~375px viewport: the header action row wrapped to two
 * lines —
 *     "Upgrade -" / "$79/month"   and   "Sign" / "out"
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
const appHeaderSrc = readSource("../components/app/AppHeader.tsx");
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

  it("keeps the full 'Upgrade - $79/month' label for sm+ (desktop unchanged)", () => {
    render(React.createElement(UpgradeButton));
    const full = screen.getByText(/Upgrade - \$79\/month/);
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

  it("price comes from the shared $79 label while preserving the compact mobile copy", () => {
    expect(upgradeSrc).toContain("PAYWALL_PRICE_LABEL");
    // The compact label still surfaces the price ("$79"), just shorter.
    expect(upgradeSrc).toContain("Upgrade $79");
  });
});

// ---------------------------------------------------------------------------
// Sign out + brand eyebrow — no wrap, no squeeze, at 375px
// ---------------------------------------------------------------------------

describe("Authenticated app header actions", () => {
  it("Sign out is whitespace-nowrap (no 'Sign' / 'out' two-line wrap)", () => {
    expect(appHeaderSrc).toMatch(/whitespace-nowrap[\s\S]*?>\s*Sign out/);
  });

  it("is sticky and stacks on mobile while aligning on desktop", () => {
    expect(appHeaderSrc).toMatch(
      /data-testid="app-header"[\s\S]*?sticky top-0 z-50[\s\S]*?flex min-w-0 flex-col[\s\S]*?sm:flex-row sm:items-center sm:justify-between/,
    );
  });

  it("lets the action group wrap without horizontal overflow", () => {
    expect(appHeaderSrc).toMatch(
      /data-testid="app-header-actions"[\s\S]*?flex w-full flex-wrap items-center[\s\S]*?sm:w-auto sm:justify-end/,
    );
  });

  it("the Quote Reclaim wordmark wrapper is whitespace-nowrap (brand not squeezed)", () => {
    expect(appHeaderSrc).toContain(
      '<LogoFull className="whitespace-nowrap" />',
    );
  });

  it("header actions render Upgrade, Report, then Sign out", () => {
    const upgradeIdx = appHeaderSrc.indexOf("{upgrade}");
    const reportIdx = appHeaderSrc.indexOf('href="/recovery-report"');
    const signOutFormIdx = appHeaderSrc.indexOf(
      'action="/api/auth/sign-out"',
    );
    expect(upgradeIdx).toBeGreaterThan(0);
    expect(reportIdx).toBeGreaterThan(upgradeIdx);
    expect(signOutFormIdx).toBeGreaterThan(reportIdx);
    expect(dashboard).toMatch(
      /<AppHeader[\s\S]*?upgrade=\{[\s\S]*?<UpgradeButton/,
    );
  });

  it("keeps the PWA hint first, then the header, command section, and moves", () => {
    // Mission/command header leads; Today's Moves renders directly under it.
    const pwaIdx = dashboard.indexOf("<PwaInstallHint");
    const headerIdx = dashboard.indexOf("<AppHeader");
    const commandIdx = dashboard.indexOf('id="silent-quote-command"');
    const movesIdx = dashboard.indexOf("<TodaysMoves");
    expect(headerIdx).toBeGreaterThan(pwaIdx);
    expect(commandIdx).toBeGreaterThan(headerIdx);
    expect(movesIdx).toBeGreaterThan(commandIdx);
  });
});
