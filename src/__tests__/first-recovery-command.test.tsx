/**
 * @vitest-environment happy-dom
 *
 * First-run / empty-queue activation panel.
 *
 * Contract:
 *   - Renders only when the recovery queue is empty (dashboard guard).
 *   - Primary action = Silent Money Reveal; secondary = manual add.
 *   - "First 3 free" language only when it is actually true.
 *   - No fake urgency, no guarantees, no checkout claims (billing disabled).
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import { FirstRecoveryCommand } from "@/components/dashboard/FirstRecoveryCommand";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const componentSrc = readSource("../components/dashboard/FirstRecoveryCommand.tsx");
const dashboardSrc = readSource("../app/(app)/dashboard/page.tsx");
const revealPageSrc = readSource("../app/(app)/onboarding/reveal/page.tsx");

afterEach(() => cleanup());

function renderText(node: React.ReactElement): string {
  const { container } = render(node);
  return container.textContent ?? "";
}

const FRESH_FREE = {
  isPaid: false,
  freeRemaining: 3,
  hasRecoveredBefore: false,
} as const;

// ───────────────────────────────────────────────────────────────────────
// Fresh free user — the core first-session activation moment
// ───────────────────────────────────────────────────────────────────────

describe("FirstRecoveryCommand — fresh free user", () => {
  it("leads with the FIRST RECOVERY MOVE eyebrow + silent-quotes headline", () => {
    const text = renderText(React.createElement(FirstRecoveryCommand, FRESH_FREE));
    expect(text).toContain("FIRST RECOVERY MOVE");
    expect(text).toContain("Start with the quotes already sitting silent.");
  });

  it("primary CTA runs the Silent Money Reveal and links to /onboarding/reveal", () => {
    render(React.createElement(FirstRecoveryCommand, FRESH_FREE));
    const primary = screen.getByRole("link", {
      name: /Run the Silent Money Reveal/i,
    });
    expect(primary.getAttribute("href")).toBe("/onboarding/reveal");
  });

  it("secondary CTA adds a single estimate and links to /quotes/new", () => {
    render(React.createElement(FirstRecoveryCommand, FRESH_FREE));
    const secondary = screen.getByRole("link", {
      name: /\+ Add Estimate/i,
    });
    expect(secondary.getAttribute("href")).toBe("/quotes/new");
  });

  it("mentions the first 3 quotes are free (truthful, no card)", () => {
    const text = renderText(React.createElement(FirstRecoveryCommand, FRESH_FREE));
    expect(text).toMatch(/first 3/i);
    expect(text).toMatch(/free/i);
    expect(text).toContain("No card needed. Your first 3 quotes are free.");
  });

  it("uses contractor-native bullets (paste / rank / top 3 free)", () => {
    const text = renderText(React.createElement(FirstRecoveryCommand, FRESH_FREE));
    expect(text).toContain("Paste your recent estimates");
    expect(text).toContain("We rank the highest-value quiet money");
    expect(text).toContain("Start with your top 3 free");
  });
});

// ───────────────────────────────────────────────────────────────────────
// Truthful variants — never claim "3 free" when it isn't
// ───────────────────────────────────────────────────────────────────────

describe("FirstRecoveryCommand — truthful entitlement variants", () => {
  it("paid user: unlimited line, no '3 free' claim, no checkout/price claim", () => {
    const text = renderText(
      React.createElement(FirstRecoveryCommand, {
        isPaid: true,
        freeRemaining: Number.POSITIVE_INFINITY,
        hasRecoveredBefore: false,
      }),
    );
    expect(text).toMatch(/Unlimited recovery is on/i);
    expect(text).not.toMatch(/first 3 free|3 quotes are free/i);
    expect(text).not.toMatch(/\$49|subscribe|checkout/i);
  });

  it("free user who already spent the allowance gets NO 'free' promise", () => {
    const text = renderText(
      React.createElement(FirstRecoveryCommand, {
        isPaid: false,
        freeRemaining: 0,
        hasRecoveredBefore: false,
      }),
    );
    expect(text).toMatch(/used your 3 free quotes/i);
    expect(text).not.toMatch(/imports your first 3 free/i);
  });

  it("free user with 2 left is told exactly 2 (no overclaim)", () => {
    const text = renderText(
      React.createElement(FirstRecoveryCommand, {
        isPaid: false,
        freeRemaining: 2,
        hasRecoveredBefore: false,
      }),
    );
    expect(text).toContain("You have 2 free quotes left.");
  });

  it("a proven winner sees NEXT (not FIRST) recovery move — never re-onboarded", () => {
    const text = renderText(
      React.createElement(FirstRecoveryCommand, {
        isPaid: true,
        freeRemaining: Number.POSITIVE_INFINITY,
        hasRecoveredBefore: true,
      }),
    );
    expect(text).toContain("NEXT RECOVERY MOVE");
    expect(text).toContain("Your queue is clear. Feed it the next silent quotes.");
    expect(text).not.toContain("FIRST RECOVERY MOVE");
  });
});

// ───────────────────────────────────────────────────────────────────────
// Anti-dark-pattern + honesty contract (source-level)
// ───────────────────────────────────────────────────────────────────────

describe("FirstRecoveryCommand — honest, no dark patterns", () => {
  it("invents no urgency, countdown, or scarcity", () => {
    expect(componentSrc).not.toMatch(
      /countdown|expires|hurry|only \d+ left|last chance|today only|act now|limited time/i,
    );
  });

  it("guarantees no revenue / recovery / results", () => {
    expect(componentSrc).not.toMatch(/\bguarantee/i);
    expect(componentSrc).not.toMatch(/recover(?:ed)?\s+\$[\d,]+/i);
  });

  it("makes no billing/checkout claim while billing is disabled", () => {
    expect(componentSrc).not.toMatch(/checkout|lemonsqueezy|stripe|paddle/i);
    expect(componentSrc).not.toMatch(/\$49|subscribe/i);
    expect(componentSrc).not.toMatch(/fetch\(/);
  });

  it("makes no fake AI claim", () => {
    expect(componentSrc).not.toMatch(/\bAI\b|magic|machine learning/i);
  });

  it("primary CTA is full-width on mobile so it is visible without hunting", () => {
    // The reveal button is w-full (mobile) -> sm:w-auto, inside a w-full link.
    expect(componentSrc).toMatch(/Run the Silent Money Reveal/);
    expect(componentSrc).toMatch(/w-full[^"]*sm:w-auto/);
  });

  it("uses the light command-center treatment: brand edge + premium shadow", () => {
    expect(componentSrc).toMatch(/border-brand\/25/);
    expect(componentSrc).toMatch(/bg-white[\s\S]*?shadow-premium/);
    expect(componentSrc).not.toMatch(/shadow-\[0_0_/);
    expect(componentSrc).not.toMatch(/text-blue-\d|text-purple-\d|text-pink-\d/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Dashboard wiring — empty-only, dominant placement, returning users safe
// ───────────────────────────────────────────────────────────────────────

describe("dashboard wires the panel to the empty queue only", () => {
  it("renders FirstRecoveryCommand only when the queue is empty", () => {
    expect(dashboardSrc).toContain("FirstRecoveryCommand");
    expect(dashboardSrc).toMatch(
      /const showFirstRecoveryCommand = pending\.length === 0/,
    );
    expect(dashboardSrc).toMatch(
      /\{showFirstRecoveryCommand \?\s*\(?\s*<FirstRecoveryCommand/,
    );
  });

  it("places the panel above the hero metric so it dominates the empty state", () => {
    const panelIdx = dashboardSrc.indexOf("<FirstRecoveryCommand");
    const heroIdx = dashboardSrc.indexOf("<HeroMetric");
    expect(panelIdx).toBeGreaterThan(0);
    expect(heroIdx).toBeGreaterThan(panelIdx);
  });

  it("passes truthful entitlement props (free remaining + recovered-before)", () => {
    expect(dashboardSrc).toMatch(/freeRemaining=\{freeRemaining\}/);
    expect(dashboardSrc).toMatch(/hasRecoveredBefore=\{hasRecoveredBefore\}/);
    expect(dashboardSrc).toMatch(
      /freeRemaining = isPaid\s*\?\s*Number\.POSITIVE_INFINITY\s*:\s*Math\.max\(0, FREE_PLAN_LIMIT - usageCount\)/,
    );
  });

  it("does not interrupt returning users who already have quotes", () => {
    // The only render path is gated by pending.length === 0, so any pending
    // quote suppresses the panel.
    expect(dashboardSrc).not.toMatch(/<FirstRecoveryCommand[\s\S]*?pending\.length > 0/);
  });

  it("still redirects brand-new users to the reveal first (reveal-first intent intact)", () => {
    expect(dashboardSrc).toMatch(
      /!profile\?\.onboarding_done && pending\.length === 0[\s\S]*?redirect\("\/onboarding\/reveal"\)/,
    );
  });

  it("the reveal page still honors ?next=/onboarding/reveal through sign-up", () => {
    expect(revealPageSrc).toContain(
      'redirect("/sign-up?next=/onboarding/reveal")',
    );
  });

  it("does not change pricing, the free limit, billing, or auth from the dashboard", () => {
    // Reuses the existing entitlement constant; introduces no new limit/price.
    expect(dashboardSrc).toContain('"@/lib/payments/entitlement"');
    expect(dashboardSrc).not.toMatch(/FREE_PLAN_LIMIT\s*=\s*\d/); // imports, never redefines
    expect(dashboardSrc).not.toMatch(/is_paid\s*=\s*(true|false)/); // never writes is_paid
    expect(dashboardSrc).not.toMatch(/\$49|checkout|subscribe/i);
  });
});
