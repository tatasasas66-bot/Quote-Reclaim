/**
 * @vitest-environment happy-dom
 *
 * First-session + reusable bulk-import contract.
 *
 * Covers:
 *   A. First-session routing (new user -> reveal; returning user with quotes
 *      -> dashboard; empty queue -> FirstRecoveryCommand routes to the right
 *      surface based on onboarding state).
 *   B. Reusable bulk import: /quotes/import reuses RevealClient end-to-end
 *      so there is one parser, one ranking, one import action — visible from
 *      the dashboard queue header and the single-quote add page.
 *   C. Reveal page polish: input copy, dual skip paths, collapsible large
 *      preview (30+ rows do not bury the primary CTA).
 *   D. Free-limit slot math at the free-import threshold ( 0/1/2/3 used →
 *      3/2/1/0 importable). Paid bypass remains intact.
 *   E. Billing-disabled activation copy in the import-blocked screen uses
 *      support@quotereclaim.com — no dead checkout, no Lemon.
 *   F. Regression sweep: existing guardrails (no "Contractor here", no Lemon,
 *      no banned phrases, single homepage H1, support email centralized).
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import { FirstRecoveryCommand } from "@/components/dashboard/FirstRecoveryCommand";
import { FREE_PLAN_LIMIT } from "@/lib/payments/entitlement";
import { SUPPORT_EMAIL } from "@/lib/payments/disabled-provider";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const dashboardSrc = readSource("../app/(app)/dashboard/page.tsx");
const newQuotePageSrc = readSource("../app/(app)/quotes/new/page.tsx");
const importPageSrc = readSource("../app/(app)/quotes/import/page.tsx");
const revealClientSrc = readSource(
  "../app/(app)/onboarding/reveal/RevealClient.tsx",
);
const firstRecoverySrc = readSource(
  "../components/dashboard/FirstRecoveryCommand.tsx",
);
const homepageSrc = readSource("../app/page.tsx");

afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────
// A. First-session routing
// ─────────────────────────────────────────────────────────────────────────

describe("first-session routing", () => {
  it("dashboard redirects a new user with no quotes to /onboarding/reveal", () => {
    // The new-user gate: onboarding_done flag still false AND queue empty.
    expect(dashboardSrc).toMatch(
      /!profile\?\.onboarding_done && pending\.length === 0[\s\S]*?redirect\("\/onboarding\/reveal"\)/,
    );
  });

  it("a returning user with any quotes is never redirected (no onboarding loop)", () => {
    // The condition strictly requires pending.length === 0. Anyone with one
    // or more quotes passes through to the dashboard.
    expect(dashboardSrc).not.toMatch(
      /redirect\("\/onboarding\/reveal"\)[\s\S]*?pending\.length > 0/,
    );
  });

  it("post-onboarding empty queue routes its bulk-paste CTA to /quotes/import (no onboarding rerun)", () => {
    // FirstRecoveryCommand receives onboardingDone from the dashboard and
    // selects /quotes/import when true, /onboarding/reveal otherwise.
    expect(dashboardSrc).toMatch(
      /<FirstRecoveryCommand[\s\S]{0,400}onboardingDone=\{Boolean\(profile\?\.onboarding_done\)\}/,
    );
    expect(firstRecoverySrc).toMatch(
      /const importHref = onboardingDone \? "\/quotes\/import" : "\/onboarding\/reveal"/,
    );
  });

  it("the homepage CTA opens the public /audit doorway", () => {
    expect(homepageSrc).toMatch(/href="\/audit"/);
    expect(homepageSrc).toMatch(/Run the free estimate audit/);
  });

  it("the /onboarding/reveal page itself uses requireUser + sign-up next= so a homepage clicker lands back here after auth", () => {
    const revealPageSrc = readSource(
      "../app/(app)/onboarding/reveal/page.tsx",
    );
    expect(revealPageSrc).toContain("requireUser");
    expect(revealPageSrc).toContain('"/sign-up?next=/onboarding/reveal"');
  });

  it("the /quotes/import page mirrors the same auth contract for a returning bulk-import click", () => {
    expect(importPageSrc).toContain("requireUser");
    expect(importPageSrc).toContain("/sign-up?next=/quotes/import");
  });
});

describe("FirstRecoveryCommand routes import CTA by onboarding state", () => {
  const baseFresh = {
    isPaid: false,
    freeRemaining: FREE_PLAN_LIMIT,
    hasRecoveredBefore: false,
  };

  it("new user (onboarding not done) → primary CTA links to /onboarding/reveal with 'Run the Silent Money Reveal'", () => {
    render(
      React.createElement(FirstRecoveryCommand, {
        ...baseFresh,
        onboardingDone: false,
      }),
    );
    const link = screen.getByRole("link", {
      name: /Run the Silent Money Reveal/i,
    });
    expect(link.getAttribute("href")).toBe("/onboarding/reveal");
  });

  it("returning user (onboarding done) → primary CTA links to /quotes/import with 'Paste more quotes'", () => {
    render(
      React.createElement(FirstRecoveryCommand, {
        ...baseFresh,
        onboardingDone: true,
      }),
    );
    const link = screen.getByRole("link", { name: /Paste more quotes/i });
    expect(link.getAttribute("href")).toBe("/quotes/import");
  });

  it("the secondary 'Add one quote manually' stays present in both states", () => {
    for (const onboardingDone of [false, true]) {
      const { unmount } = render(
        React.createElement(FirstRecoveryCommand, { ...baseFresh, onboardingDone }),
      );
      expect(
        screen.getByRole("link", { name: /Add one quote manually/i }).getAttribute("href"),
      ).toBe("/quotes/new");
      unmount();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// B. Reusable bulk import
// ─────────────────────────────────────────────────────────────────────────

describe("/quotes/import — reusable bulk import, one parser, one action", () => {
  it("renders the same RevealClient as onboarding (no duplicated parser/action logic)", () => {
    expect(importPageSrc).toContain(
      'import { RevealClient } from "@/app/(app)/onboarding/reveal/RevealClient"',
    );
    expect(importPageSrc).toMatch(/<RevealClient[\s\S]{0,300}isPaid=\{isPaid\}/);
    // No second copy of the parser, the action, or the placeholder example.
    expect(importPageSrc).not.toContain("parseSilentQuotesInput");
    expect(importPageSrc).not.toContain("importSilentQuotesAction");
    expect(importPageSrc).toContain('surface="import"');
  });

  it("hands surface='import' so the header reads 'Back to dashboard' instead of an onboarding skip", () => {
    // RevealClient picks the secondary label off `surface` — the import page
    // does not have to override copy, just pass the discriminator.
    expect(revealClientSrc).toMatch(
      /surface\?: "onboarding" \| "import"/,
    );
    expect(revealClientSrc).toMatch(
      /surface === "import"[\s\S]{0,80}"Back to dashboard"/,
    );
    expect(revealClientSrc).toMatch(
      /"Skip — start with one quote instead →"/,
    );
  });

  it("the import surface skip flips destination instead of marking onboarding done a second time", () => {
    // No accidental re-flip of onboarding_done from the import surface; the
    // contractor already crossed that gate.
    expect(revealClientSrc).toMatch(
      /if \(surface === "import"\) \{\s*[\s\S]{0,200}router\.push\("\/dashboard"\);/,
    );
  });

  it("dashboard exposes 'Paste more quotes →' beside the queue Add button (desktop secondary)", () => {
    // Identify the link by testid + href, then assert the visible label
    // appears within its slice — regex backtracking on a long className keeps
    // false-negatives away.
    expect(dashboardSrc).toContain('data-testid="queue-bulk-import-link"');
    expect(dashboardSrc).toContain('href="/quotes/import"');
    const testidIdx = dashboardSrc.indexOf('data-testid="queue-bulk-import-link"');
    const labelIdx = dashboardSrc.indexOf("Paste more quotes →", testidIdx);
    expect(labelIdx).toBeGreaterThan(testidIdx);
    // The two are within the same <Link> element (small window).
    expect(labelIdx - testidIdx).toBeLessThan(400);
  });

  it("dashboard primary action stays '+ Add Silent Quote'; bulk import is the SECONDARY entry, not the primary", () => {
    // Order in DOM (skip comments by anchoring on JSX boundary markers):
    // queue label -> Paste-more testid -> Add Silent Quote button.
    const queueIdx = dashboardSrc.indexOf("IN THE QUEUE");
    const pasteIdx = dashboardSrc.indexOf('data-testid="queue-bulk-import-link"');
    // The Button JSX (not the comment that mentions the label).
    const addBtnIdx = dashboardSrc.indexOf(
      '<Button size="sm">+ Add Silent Quote</Button>',
    );
    expect(queueIdx).toBeGreaterThan(0);
    expect(pasteIdx).toBeGreaterThan(queueIdx);
    expect(addBtnIdx).toBeGreaterThan(pasteIdx);
  });

  it("the /quotes/new page exposes the bulk-import door so add-one-at-a-time is never the only choice", () => {
    expect(newQuotePageSrc).toMatch(
      /href="\/quotes\/import"[\s\S]{0,200}Paste them all at once/,
    );
    expect(newQuotePageSrc).toContain('data-testid="new-quote-bulk-import-link"');
  });

  it("returning-user import copy does not imply first-time onboarding", () => {
    // Eyebrow and headline flip honestly when surface === "import".
    expect(revealClientSrc).toContain('"Paste More Quotes"');
    expect(revealClientSrc).toContain("Add another batch to the recovery queue.");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// C. Onboarding / reveal polish — dual skip paths + large-preview collapse
// ─────────────────────────────────────────────────────────────────────────

describe("onboarding reveal input — copy, skip clarity, large-import handling", () => {
  it("textarea helper names every required + optional field and the row cap", () => {
    expect(revealClientSrc).toMatch(
      /Name and amount are required\. Date and email are optional\./,
    );
    expect(revealClientSrc).toContain("MAX_IMPORT_ROWS");
    expect(revealClientSrc).toMatch(/rows per import\./);
  });

  it("nothing-saved-until-confirm promise stays visible at the input step + below the CTA", () => {
    // The promise lives in the body paragraph AND beside the Scan button.
    expect(revealClientSrc).toContain("Nothing is saved until you confirm.");
    expect(revealClientSrc).toContain("Nothing is saved yet.");
  });

  it("no-email/manual-copy explanation remains visible", () => {
    expect(revealClientSrc).toMatch(
      /No email\?\s*We&apos;ll build copy-ready follow-ups instead\./,
    );
  });

  it("the in-flow skip path is clear, secondary, and never reads as abandonment", () => {
    expect(revealClientSrc).toContain("No list handy?");
    expect(revealClientSrc).toContain("Start with one quote");
    expect(revealClientSrc).toContain(
      "you can paste a batch any time from the dashboard.",
    );
  });

  it("header skip uses the same honest framing (onboarding) or 'Back to dashboard' (import)", () => {
    expect(revealClientSrc).toContain(
      "Skip — start with one quote instead →",
    );
    expect(revealClientSrc).toContain("Back to dashboard");
  });

  it("primary CTA on the input step is the 'Scan' button, not the skip", () => {
    // Scan is the Button component (visually dominant); skip is a small link.
    expect(revealClientSrc).toMatch(
      /<Button[\s\S]{0,180}onClick=\{onScan\}[\s\S]{0,180}Scan my quiet estimates/,
    );
    expect(revealClientSrc).not.toMatch(
      /<Button[^>]*size="lg"[^>]*>\s*Skip/,
    );
  });

  it("keeps the scan CTA readable when the desktop CTA row gets tight", () => {
    expect(revealClientSrc).toMatch(/sm:flex-wrap/);
    expect(revealClientSrc).toMatch(
      /className="h-auto min-h-12 w-full whitespace-normal px-4 py-3 text-center leading-tight sm:flex-1 sm:whitespace-nowrap"/,
    );
  });

  it("first-run input explains the value before asking for rows", () => {
    expect(revealClientSrc).toContain(
      "Find the money still sitting in old estimates.",
    );
    expect(revealClientSrc).toContain("Paste anything structured");
    expect(revealClientSrc).toContain("What happens next");
    expect(revealClientSrc).toContain("Review before saving");
    expect(revealClientSrc).toContain("See the quiet total");
    expect(revealClientSrc).toContain("Start the recovery system");
  });

  it("the preview collapses past 8 rows so a 30/40/100-row paste cannot bury the Reveal CTA", () => {
    expect(revealClientSrc).toContain("PREVIEW_COLLAPSE_THRESHOLD");
    expect(revealClientSrc).toMatch(/PREVIEW_COLLAPSE_THRESHOLD = 8/);
    expect(revealClientSrc).toMatch(/isLarge[\s\S]{0,200}expanded/);
    expect(revealClientSrc).toContain('data-testid="preview-toggle"');
    // The visible-by-default slice is sorted by amount desc so the
    // highest-value rows stay scannable.
    expect(revealClientSrc).toMatch(
      /parsed\.rows\.map\(\(row, i\) => \(\{ row, i \}\)\)\.sort\(\(a, b\) => b\.row\.amount - a\.row\.amount\)/,
    );
  });

  it("rows hidden by the collapse can still be revealed and removed before confirm", () => {
    // The Remove handler still uses the underlying row index, not the
    // visible-only slice, so the Reveal sees the user's true edits.
    expect(revealClientSrc).toMatch(/onClick=\{\(\) => onRemove\(i\)\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// D. Free-limit slot math
// ─────────────────────────────────────────────────────────────────────────

describe("free-limit slot math (FREE_PLAN_LIMIT = 3, all states)", () => {
  function freeRemaining(usage: number): number {
    return Math.max(0, FREE_PLAN_LIMIT - usage);
  }

  it("FREE_PLAN_LIMIT is 3 (locked invariant)", () => {
    expect(FREE_PLAN_LIMIT).toBe(3);
  });

  it("free user with 0 quotes can import 3", () => {
    expect(freeRemaining(0)).toBe(3);
  });

  it("free user with 1 quote can import 2", () => {
    expect(freeRemaining(1)).toBe(2);
  });

  it("free user with 2 quotes can import 1", () => {
    expect(freeRemaining(2)).toBe(1);
  });

  it("free user with 3 quotes can import 0 more (block reached)", () => {
    expect(freeRemaining(3)).toBe(0);
    // The dashboard /quotes/new path enforces this with the Paywall fork.
    expect(newQuotePageSrc).toMatch(
      /const blocked = !isPaid && usage >= FREE_PLAN_LIMIT/,
    );
  });

  it("paid user bypass: freeRemaining flips to POSITIVE_INFINITY", () => {
    const computedPaid = (isPaid: boolean, usage: number) =>
      isPaid ? Number.POSITIVE_INFINITY : freeRemaining(usage);
    expect(computedPaid(true, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(computedPaid(true, 99)).toBe(Number.POSITIVE_INFINITY);
    // The dashboard derives freeRemaining this exact way.
    expect(dashboardSrc).toMatch(
      /const freeRemaining = isPaid\s*\?\s*Number\.POSITIVE_INFINITY\s*:\s*Math\.max\(0, FREE_PLAN_LIMIT - usageCount\)/,
    );
  });

  it("import surface checks the same gate before mounting the reveal client", () => {
    expect(importPageSrc).toMatch(
      /const freeRemaining = isPaid[\s\S]{0,80}Math\.max\(0, FREE_PLAN_LIMIT - usage\)/,
    );
    expect(importPageSrc).toMatch(
      /if \(!isPaid && freeRemaining === 0\) \{[\s\S]{0,100}<ImportBlocked/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// E. Billing-disabled activation screen
// ─────────────────────────────────────────────────────────────────────────

describe("import-blocked screen — Paddle checkout when live, support-email fallback otherwise", () => {
  it("offers real Paddle self-serve checkout when Paddle is configured", () => {
    // Audit fix: the blocked screen must NOT tell a paying-intent user to
    // 'email support' once Paddle checkout is live. It branches on
    // paddleClientConfigured() and opens the overlay via PaddleCheckoutButton.
    expect(importPageSrc).toContain(
      'import { paddleClientConfigured } from "@/lib/payments/paddle-provider"',
    );
    expect(importPageSrc).toContain(
      'import { PaddleCheckoutButton } from "@/components/billing/PaddleCheckoutButton"',
    );
    expect(importPageSrc).toMatch(/const canCheckout = paddleAvailable && Boolean\(userId\)/);
    expect(importPageSrc).toContain("<PaddleCheckoutButton");
    // Locked checkout copy.
    expect(importPageSrc).toContain("Activate Quote Reclaim Pro - ${PAYWALL_PRICE_LABEL}");
    expect(importPageSrc).toMatch(/First 3 quotes are free\./);
    expect(importPageSrc).toMatch(/Cancel\s+anytime\./);
  });

  it("keeps the honest support-email fallback for a deployment WITHOUT Paddle", () => {
    expect(importPageSrc).toContain(
      'import { SUPPORT_EMAIL } from "@/lib/payments/disabled-provider"',
    );
    // Two mailto links in the fallback branch: header button + body sentence.
    const mailtos = importPageSrc.match(/mailto:\$\{SUPPORT_EMAIL\}/g) ?? [];
    expect(mailtos.length).toBeGreaterThanOrEqual(2);
    expect(importPageSrc).toContain("Billing is being updated.");
    expect(importPageSrc).toContain("to activate more quotes");
    expect(importPageSrc).toMatch(/Email\{?\s/);
    expect(importPageSrc.toLowerCase()).not.toContain("lemon");
  });

  it("preserves the contractor's running recovery — nothing is paused as a side effect", () => {
    expect(importPageSrc).toContain(
      "Your existing recovery sequences keep running",
    );
  });

  it("never claims guaranteed recovery or revenue", () => {
    expect(importPageSrc.toLowerCase()).not.toContain("guaranteed recovery");
    expect(importPageSrc.toLowerCase()).not.toContain("guaranteed revenue");
  });

  it("the support email constant resolves to the canonical address", () => {
    expect(SUPPORT_EMAIL).toBe("support@quotereclaim.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// F. Regression sweep — guardrails preserved
// ─────────────────────────────────────────────────────────────────────────

const PRODUCTION_SRC_ROOT = join(process.cwd(), "src");
function collectProductionSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectProductionSources(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}
const productionFiles = collectProductionSources(PRODUCTION_SRC_ROOT);

describe("regression — homepage, support email, no Lemon, no dead checkout, no banned phrases", () => {
  it("homepage H1 uses the sent-estimates-before-leads positioning", () => {
    expect(homepageSrc).toContain(
      "Turn sent estimates into booked work before buying another lead.",
    );
  });

  it("homepage CTA uses the public audit doorway", () => {
    expect(homepageSrc).toContain("Run the free estimate audit");
    expect(homepageSrc).toContain('href="/audit"');
  });

  it("support@quotereclaim.com remains the public support email", () => {
    expect(SUPPORT_EMAIL).toBe("support@quotereclaim.com");
    // Centralized — no surface I touched introduces a hardcoded copy.
    for (const path of [importPageSrc, dashboardSrc, newQuotePageSrc, revealClientSrc, firstRecoverySrc]) {
      const hits = path.match(/[\w.+-]+@quotereclaim\.com/g) ?? [];
      for (const hit of hits) {
        expect(hit).toBe("support@quotereclaim.com");
      }
    }
  });

  it("no production source contains a Lemon Squeezy reference", () => {
    for (const path of productionFiles) {
      const content = readFileSync(path, "utf8");
      expect(
        /\blemonsqueezy\b|\blemon squeezy\b/i.test(content),
        `${path} must not contain a Lemon Squeezy reference`,
      ).toBe(false);
    }
  });

  it("no production source fetches a /api/lemonsqueezy/checkout dead route", () => {
    for (const path of productionFiles) {
      const content = readFileSync(path, "utf8");
      expect(
        content.includes("/api/lemonsqueezy/checkout"),
        `${path} must not reference the deleted Lemon checkout route`,
      ).toBe(false);
    }
  });

  it("no user-facing source leaks a personal Gmail address", () => {
    for (const src of [
      homepageSrc,
      dashboardSrc,
      newQuotePageSrc,
      importPageSrc,
      revealClientSrc,
      firstRecoverySrc,
    ]) {
      expect(src).not.toMatch(/[\w.+-]+@gmail\.com/i);
    }
  });

  it("no banned vocabulary returns on the surfaces I touched", () => {
    for (const src of [
      dashboardSrc,
      newQuotePageSrc,
      importPageSrc,
      revealClientSrc,
      firstRecoverySrc,
    ]) {
      expect(src).not.toMatch(/just checking in/i);
      expect(src).not.toMatch(/have you given up/i);
      expect(src).not.toMatch(/guaranteed recovery|guaranteed revenue/i);
      expect(src).not.toMatch(/debt collection|financial recovery/i);
      expect(src).not.toMatch(/AI-powered/i);
      expect(src).not.toMatch(/\bworkflow\b|\bpipeline\b|\boptimize\b|\bengagement\b/i);
      expect(src).not.toMatch(/24\/7 support/i);
      expect(src).not.toMatch(/\bCRM\b/);
      // No countdowns or scarcity manufacture.
      expect(src).not.toMatch(/expires in|only \d+ left|last chance|limited time/i);
    }
  });

  it("RevealClient backwards-compatible — surface defaults to 'onboarding' so onboarding callers need no change", () => {
    expect(revealClientSrc).toMatch(/surface = "onboarding"/);
  });
});
