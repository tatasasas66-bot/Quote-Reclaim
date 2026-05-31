/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import TermsPage from "@/app/terms/page";
import PrivacyPage from "@/app/privacy/page";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const termsSrc = readSource("../app/terms/page.tsx");
const privacySrc = readSource("../app/privacy/page.tsx");
const legalChromeSrc = readSource("../components/legal/LegalPage.tsx");
const homepageSrc = readSource("../app/page.tsx");
const authShellSrc = readSource("../components/onboarding/AuthShell.tsx");

afterEach(() => {
  cleanup();
});

function renderText(node: React.ReactElement): string {
  const { container } = render(node);
  return container.textContent ?? "";
}

// ---------------------------------------------------------------------------
// Terms of Service — required sections render
// ---------------------------------------------------------------------------

describe("Terms of Service page", () => {
  it("renders the page title", () => {
    render(React.createElement(TermsPage));
    expect(
      screen.getByRole("heading", { level: 1, name: /Terms of Service/i }),
    ).toBeTruthy();
  });

  it("describes the service: follow up on quiet estimates via automated email", () => {
    const text = renderText(React.createElement(TermsPage));
    expect(text).toMatch(/follow up on quiet estimates/i);
    expect(text).toMatch(/automated follow-up emails/i);
  });

  it("states the subscription terms: $79/month, 3 free quotes, cancel anytime", () => {
    const text = renderText(React.createElement(TermsPage));
    expect(text).toContain("$79/month");
    expect(text).toContain("3 free quotes");
    expect(text).toMatch(/cancel anytime/i);
  });

  it("names Lemon Squeezy as merchant of record", () => {
    const text = renderText(React.createElement(TermsPage));
    expect(text).toContain("Lemon Squeezy");
    expect(text).toMatch(/merchant of record/i);
  });

  it("covers acceptable use and CAN-SPAM compliance responsibility", () => {
    const text = renderText(React.createElement(TermsPage));
    expect(text).toMatch(/acceptable use/i);
    expect(text).toContain("CAN-SPAM");
    expect(text).toMatch(/you are solely responsible/i);
  });

  it("includes a no-warranty / limitation-of-liability section", () => {
    const text = renderText(React.createElement(TermsPage));
    expect(text).toMatch(/as is/i);
    expect(text).toMatch(/without warranties of any kind/i);
    expect(text).toMatch(/limitation of liability/i);
    expect(text).toMatch(/will not be liable/i);
  });

  it("provides a contact email", () => {
    render(React.createElement(TermsPage));
    const mailto = screen.getAllByRole("link", {
      name: /hello@quotereclaim\.com/i,
    });
    expect(mailto.length).toBeGreaterThan(0);
    expect(mailto[0].getAttribute("href")).toBe(
      "mailto:hello@quotereclaim.com",
    );
  });
});

// ---------------------------------------------------------------------------
// Privacy Policy — required sections render
// ---------------------------------------------------------------------------

describe("Privacy Policy page", () => {
  it("renders the page title", () => {
    render(React.createElement(PrivacyPage));
    expect(
      screen.getByRole("heading", { level: 1, name: /Privacy Policy/i }),
    ).toBeTruthy();
  });

  it("lists the data collected (account email + customer name/email/phone + estimate amount)", () => {
    const text = renderText(React.createElement(PrivacyPage));
    expect(text).toMatch(/email address/i);
    expect(text).toMatch(/name, email address, and phone number/i);
    expect(text).toMatch(/estimate amount/i);
  });

  it("explains how data is used (generate/send follow-ups, track outcomes)", () => {
    const text = renderText(React.createElement(PrivacyPage));
    expect(text).toMatch(/generate and send follow-up emails/i);
    expect(text).toMatch(/track recovery outcomes/i);
  });

  it("names all five third-party processors", () => {
    const text = renderText(React.createElement(PrivacyPage));
    for (const vendor of [
      "Supabase",
      "Resend",
      "Groq",
      "Lemon Squeezy",
      "Vercel",
    ]) {
      expect(text).toContain(vendor);
    }
  });

  it("covers data retention and the right to delete", () => {
    const text = renderText(React.createElement(PrivacyPage));
    expect(text).toMatch(/data retention/i);
    expect(text).toMatch(/delete your (account|data)/i);
  });

  it("provides a contact email for privacy requests", () => {
    render(React.createElement(PrivacyPage));
    const mailto = screen.getAllByRole("link", {
      name: /hello@quotereclaim\.com/i,
    });
    expect(mailto.length).toBeGreaterThan(0);
    expect(mailto[0].getAttribute("href")).toBe(
      "mailto:hello@quotereclaim.com",
    );
  });
});

// ---------------------------------------------------------------------------
// Footer links on the landing page + sign-in surface
// ---------------------------------------------------------------------------

describe("footer links to /terms and /privacy", () => {
  it("landing page footer links to both", () => {
    expect(homepageSrc).toMatch(/<footer/);
    expect(homepageSrc).toMatch(/href="\/terms"/);
    expect(homepageSrc).toMatch(/href="\/privacy"/);
  });

  it("sign-in surface (AuthShell) footer links to both", () => {
    expect(authShellSrc).toMatch(/<footer/);
    expect(authShellSrc).toMatch(/href="\/terms"/);
    expect(authShellSrc).toMatch(/href="\/privacy"/);
  });

  it("each legal page itself cross-links to /terms and /privacy (shared chrome)", () => {
    render(React.createElement(TermsPage));
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe(
      "/terms",
    );
    expect(
      screen.getByRole("link", { name: "Privacy" }).getAttribute("href"),
    ).toBe("/privacy");
  });
});

// ---------------------------------------------------------------------------
// Honest copy — no fabricated claims, no guarantees of results, no "Bid"
// ---------------------------------------------------------------------------

describe("legal pages keep the honest-copy contract", () => {
  const legalSources = [termsSrc, privacySrc, legalChromeSrc];

  it("contain no 'Bid'", () => {
    for (const src of legalSources) {
      expect(src).not.toMatch(/\bBid\b/);
    }
  });

  it("contain none of the SaaS clichés banned on marketing surfaces", () => {
    const banned = [
      "optimize",
      "leverage",
      "productivity",
      "workflow",
      "engagement",
      "pipeline",
      "AI-powered",
    ];
    for (const word of banned) {
      const re = new RegExp(`\\b${word.replace(/-/g, "\\-")}\\b`, "i");
      for (const src of legalSources) {
        expect(re.test(src), `"${word}" must not appear`).toBe(false);
      }
    }
  });

  it("contain none of the false-claim banned phrases", () => {
    const banned = [
      "trusted by",
      "integrates with",
      "works alongside",
      "case study",
      "5-star",
      "star rating",
    ];
    for (const phrase of banned) {
      for (const src of legalSources) {
        expect(
          src.toLowerCase().includes(phrase.toLowerCase()),
          `"${phrase}" must not appear`,
        ).toBe(false);
      }
    }
  });

  it("Terms DISCLAIMS results rather than guaranteeing them", () => {
    const text = renderText(React.createElement(TermsPage));
    // A no-results disclaimer must be present...
    expect(text).toMatch(/do not (?:promise or )?guarantee/i);
    // ...and there must be no affirmative guarantee of revenue/results.
    expect(text).not.toMatch(/\bwe guarantee\b/i);
    expect(text).not.toMatch(/guaranteed (?:revenue|results|income|return)/i);
    expect(text).not.toMatch(/\bguarantee[ds]? you(?:r)?\b/i);
  });

  it("no page promises a specific recovered-dollar amount", () => {
    for (const text of [
      renderText(React.createElement(TermsPage)),
      renderText(React.createElement(PrivacyPage)),
    ]) {
      expect(text).not.toMatch(/recover(?:ed)?\s+\$[\d,]+/i);
    }
  });

  it("introduces no price other than $79", () => {
    for (const src of [termsSrc, privacySrc]) {
      expect(src).not.toMatch(/\$39\b/);
      expect(src).not.toMatch(/\$49\b/);
      expect(src).not.toMatch(/\$99\b/);
      expect(src).not.toMatch(/\$29\b/);
    }
  });
});
