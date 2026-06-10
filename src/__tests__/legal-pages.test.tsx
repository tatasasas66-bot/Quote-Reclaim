/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import TermsPage from "@/app/terms/page";
import PrivacyPage from "@/app/privacy/page";
import RefundPolicyPage from "@/app/refund-policy/page";
import CancellationPolicyPage from "@/app/cancellation-policy/page";
import ContactPage from "@/app/contact/page";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const termsSrc = readSource("../app/terms/page.tsx");
const privacySrc = readSource("../app/privacy/page.tsx");
const refundSrc = readSource("../app/refund-policy/page.tsx");
const cancellationSrc = readSource("../app/cancellation-policy/page.tsx");
const contactSrc = readSource("../app/contact/page.tsx");
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

const SUPPORT_EMAIL = "support@quotereclaim.com";

// ───────────────────────────────────────────────────────────────────────
// Terms of Service — required sections render, provider-agnostic
// ───────────────────────────────────────────────────────────────────────

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

  it("describes billing in provider-agnostic terms (no MoR named, no rejection language)", () => {
    const text = renderText(React.createElement(TermsPage));
    expect(text).toMatch(/third-party payment provider/i);
    expect(text).toMatch(/merchant of record/i);
    expect(text.toLowerCase()).not.toMatch(/\blemon\b|lemon squeezy|paddle|stripe/);
    expect(text.toLowerCase()).not.toMatch(/rejected|rejection/);
  });

  it("cross-links to the new Refund and Cancellation policies", () => {
    render(React.createElement(TermsPage));
    // Refund/Cancellation each appear twice (body cross-link + footer link
    // in the shared LegalPage chrome), so we assert "at least one points at
    // the policy" rather than uniqueness.
    const refund = screen
      .getAllByRole("link", { name: /Refund Policy/i })
      .map((el) => el.getAttribute("href"));
    expect(refund).toContain("/refund-policy");
    const cancellation = screen
      .getAllByRole("link", { name: /Cancellation Policy/i })
      .map((el) => el.getAttribute("href"));
    expect(cancellation).toContain("/cancellation-policy");
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
});

// ───────────────────────────────────────────────────────────────────────
// Privacy Policy — required sections, support email, no MoR
// ───────────────────────────────────────────────────────────────────────

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

  it("names the operational processors (no specific MoR yet)", () => {
    const text = renderText(React.createElement(PrivacyPage));
    for (const vendor of ["Supabase", "Resend", "Groq", "Vercel"]) {
      expect(text).toContain(vendor);
    }
    expect(text).toMatch(/Payment provider/i);
    expect(text.toLowerCase()).not.toMatch(/\blemon\b|lemon squeezy|paddle|stripe/);
  });

  it("states explicitly that we do not sell user data", () => {
    const text = renderText(React.createElement(PrivacyPage));
    expect(text).toMatch(/do not sell/i);
  });

  it("covers data retention and the right to delete", () => {
    const text = renderText(React.createElement(PrivacyPage));
    expect(text).toMatch(/data retention/i);
    expect(text).toMatch(/delete your (account|data)/i);
  });

  it("provides the support email for privacy/data requests", () => {
    render(React.createElement(PrivacyPage));
    const mailto = screen.getAllByRole("link", {
      name: new RegExp(SUPPORT_EMAIL, "i"),
    });
    expect(mailto.length).toBeGreaterThan(0);
    expect(mailto[0].getAttribute("href")).toBe(`mailto:${SUPPORT_EMAIL}`);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Refund Policy — new page
// ───────────────────────────────────────────────────────────────────────

describe("Refund Policy page", () => {
  it("renders the page title", () => {
    render(React.createElement(RefundPolicyPage));
    expect(
      screen.getByRole("heading", { level: 1, name: /Refund Policy/i }),
    ).toBeTruthy();
  });

  it("states the standard $79/month price and that the product is a subscription", () => {
    const text = renderText(React.createElement(RefundPolicyPage));
    expect(text).toContain("$79/month");
    expect(text).toMatch(/subscription/i);
  });

  it("declares the general non-refundable policy after access is provided", () => {
    const text = renderText(React.createElement(RefundPolicyPage));
    expect(text).toMatch(/non-refundable/i);
    expect(text).toMatch(/digital (service|software)/i);
  });

  it("enumerates the case-by-case exceptions (duplicate, billing error, technical access, accidental)", () => {
    const text = renderText(React.createElement(RefundPolicyPage));
    expect(text).toMatch(/duplicate charge/i);
    expect(text).toMatch(/billing error/i);
    expect(text).toMatch(/technical access/i);
    expect(text).toMatch(/accidental/i);
  });

  it("routes refund requests to the support email", () => {
    render(React.createElement(RefundPolicyPage));
    const mailto = screen.getAllByRole("link", {
      name: new RegExp(SUPPORT_EMAIL, "i"),
    });
    expect(mailto.length).toBeGreaterThan(0);
    expect(mailto[0].getAttribute("href")).toMatch(
      /^mailto:support@quotereclaim\.com/,
    );
  });

  it("DISCLAIMS recovered revenue — never guarantees results", () => {
    const text = renderText(React.createElement(RefundPolicyPage));
    expect(text).toMatch(/do not (?:promise or )?guarantee/i);
    expect(text).not.toMatch(/\bwe guarantee\b/i);
    expect(text).not.toMatch(/guaranteed (?:revenue|results|income|return|recovery)/i);
  });

  it("does not position the product as debt collection or regulated financial services", () => {
    const text = renderText(React.createElement(RefundPolicyPage));
    expect(text.toLowerCase()).not.toMatch(
      /debt collection|credit repair|lending|loan |regulated financial/,
    );
  });

  it("cross-links to the Cancellation Policy", () => {
    render(React.createElement(RefundPolicyPage));
    expect(
      screen.getByRole("link", { name: /Cancellation Policy/i }).getAttribute("href"),
    ).toBe("/cancellation-policy");
  });
});

// ───────────────────────────────────────────────────────────────────────
// Cancellation Policy — new page
// ───────────────────────────────────────────────────────────────────────

describe("Cancellation Policy page", () => {
  it("renders the page title", () => {
    render(React.createElement(CancellationPolicyPage));
    expect(
      screen.getByRole("heading", { level: 1, name: /Cancellation Policy/i }),
    ).toBeTruthy();
  });

  it("states the user can cancel anytime with no hidden fees", () => {
    const text = renderText(React.createElement(CancellationPolicyPage));
    expect(text).toMatch(/cancel\s+(?:your\s+)?(?:Quote\s+Reclaim\s+)?subscription at any time/i);
    expect(text).toMatch(/no hidden cancellation fees/i);
  });

  it("stops future billing on cancel", () => {
    const text = renderText(React.createElement(CancellationPolicyPage));
    expect(text).toMatch(/stops future billing|no further monthly charges/i);
  });

  it("notes access may continue until the end of the current paid period", () => {
    const text = renderText(React.createElement(CancellationPolicyPage));
    expect(text).toMatch(/until the end of the current billing period/i);
  });

  it("provides a fallback contact to support if self-serve cancellation does not work", () => {
    const text = renderText(React.createElement(CancellationPolicyPage));
    expect(text).toContain(SUPPORT_EMAIL);
    expect(text).toMatch(/cannot find the cancel button|self-serve flow is not working|cannot cancel/i);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Contact page — new page
// ───────────────────────────────────────────────────────────────────────

describe("Contact page", () => {
  it("renders the page title", () => {
    render(React.createElement(ContactPage));
    expect(screen.getByRole("heading", { level: 1, name: /Contact/i })).toBeTruthy();
  });

  it("publishes the support email + response time", () => {
    const text = renderText(React.createElement(ContactPage));
    expect(text).toContain(SUPPORT_EMAIL);
    expect(text).toMatch(/1.{1,3}2 business days/i);
  });

  it("includes a brief, honest product description (no guarantee of results)", () => {
    const text = renderText(React.createElement(ContactPage));
    expect(text).toMatch(/silent estimates/i);
    expect(text).toMatch(/follow-up plans/i);
    expect(text).toMatch(/does not guarantee/i);
  });

  it("links to related policies", () => {
    render(React.createElement(ContactPage));
    // "Refund Policy" and "Cancellation Policy" appear in both the body
    // list AND the shared LegalPage chrome footer — so filter the
    // candidate hrefs rather than asserting uniqueness.
    function hrefsFor(name: RegExp): Array<string | null> {
      return screen
        .getAllByRole("link", { name })
        .map((el) => el.getAttribute("href"));
    }
    expect(hrefsFor(/Terms of Service/)).toContain("/terms");
    expect(hrefsFor(/Privacy Policy/)).toContain("/privacy");
    expect(hrefsFor(/Refund Policy/)).toContain("/refund-policy");
    expect(hrefsFor(/Cancellation Policy/)).toContain("/cancellation-policy");
  });
});

// ───────────────────────────────────────────────────────────────────────
// Footer links — every public surface lists all five policy/contact links
// ───────────────────────────────────────────────────────────────────────

describe("footer carries Terms / Privacy / Refund Policy / Cancellation / Contact on every public surface", () => {
  const requiredFooterHrefs = [
    "/terms",
    "/privacy",
    "/refund-policy",
    "/cancellation-policy",
    "/contact",
  ] as const;

  it("landing page footer links to all five", () => {
    expect(homepageSrc).toMatch(/<footer/);
    for (const href of requiredFooterHrefs) {
      expect(homepageSrc).toContain(`href="${href}"`);
    }
  });

  it("sign-in/sign-up surface (AuthShell) footer links to all five", () => {
    expect(authShellSrc).toMatch(/<footer/);
    for (const href of requiredFooterHrefs) {
      expect(authShellSrc).toContain(`href="${href}"`);
    }
  });

  it("shared legal-page chrome footer links to all five (every policy cross-links)", () => {
    expect(legalChromeSrc).toMatch(/<footer/);
    for (const href of requiredFooterHrefs) {
      expect(legalChromeSrc).toContain(`href="${href}"`);
    }
  });

  it("rendered Terms page shows each of the five footer links", () => {
    render(React.createElement(TermsPage));
    // Cross-links and footer chrome both expose Refund/Cancellation links,
    // so check membership instead of uniqueness for each label.
    for (const [name, href] of [
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
      ["Refund Policy", "/refund-policy"],
      ["Cancellation", "/cancellation-policy"],
      ["Contact", "/contact"],
    ] as const) {
      const hrefs = screen
        .getAllByRole("link", { name })
        .map((el) => el.getAttribute("href"));
      expect(hrefs, `link named "${name}"`).toContain(href);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// Honest copy — no MoR by name, no rejection language, no guarantees
// ───────────────────────────────────────────────────────────────────────

describe("legal pages keep the honest-copy contract", () => {
  const legalSources = [
    termsSrc,
    privacySrc,
    refundSrc,
    cancellationSrc,
    contactSrc,
    legalChromeSrc,
  ];

  it("contain no 'Bid'", () => {
    for (const src of legalSources) {
      expect(src).not.toMatch(/\bBid\b/);
    }
  });

  it("never name a specific MoR (provider-agnostic launch posture)", () => {
    for (const src of legalSources) {
      expect(src.toLowerCase()).not.toMatch(/\blemon\b|lemon squeezy|paddle|stripe/);
    }
  });

  it("never mention store rejection or carrier rejection in any form", () => {
    for (const src of legalSources) {
      expect(src.toLowerCase()).not.toMatch(/rejected|rejection|denied our application/);
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
    expect(text).toMatch(/do not (?:promise or )?guarantee/i);
    expect(text).not.toMatch(/\bwe guarantee\b/i);
    expect(text).not.toMatch(/guaranteed (?:revenue|results|income|return)/i);
  });

  it("no legal page promises a specific recovered-dollar amount or recovered-money guarantee", () => {
    for (const Page of [
      TermsPage,
      PrivacyPage,
      RefundPolicyPage,
      CancellationPolicyPage,
      ContactPage,
    ]) {
      const text = renderText(React.createElement(Page));
      expect(text).not.toMatch(/recover(?:ed)?\s+\$[\d,]+/i);
      expect(text.toLowerCase()).not.toMatch(/guaranteed recovery|guaranteed revenue|we recover lost money/);
    }
  });

  it("no legal page positions the product as debt collection or regulated finance", () => {
    for (const src of legalSources) {
      expect(src.toLowerCase()).not.toMatch(
        /debt collection|credit repair|\blending\b|\bloan\b|regulated financial/,
      );
    }
  });

  it("introduces no price other than $79", () => {
    for (const src of legalSources) {
      expect(src).not.toMatch(/\$39\b/);
      expect(src).not.toMatch(/\$49\b/);
      expect(src).not.toMatch(/\$99\b/);
      expect(src).not.toMatch(/\$29\b/);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// Support email centralization — single SUPPORT_EMAIL source of truth
// ───────────────────────────────────────────────────────────────────────

describe("centralized SUPPORT_EMAIL is wired into every public contact surface", () => {
  it("Terms page routes contact to the support email (via mailto)", () => {
    render(React.createElement(TermsPage));
    const mailto = screen.getAllByRole("link", {
      name: new RegExp(SUPPORT_EMAIL, "i"),
    });
    expect(mailto.length).toBeGreaterThan(0);
    expect(mailto[0].getAttribute("href")).toBe(`mailto:${SUPPORT_EMAIL}`);
  });

  it("Terms and Privacy both import SUPPORT_EMAIL from the central module", () => {
    for (const src of [termsSrc, privacySrc]) {
      expect(src).toMatch(
        /import\s*\{[^}]*\bSUPPORT_EMAIL\b[^}]*\}\s*from\s*["']@\/lib\/payments\/disabled-provider["']/,
      );
    }
  });

  it("no legal page hardcodes the prior hello@quotereclaim.com contact address", () => {
    for (const src of [termsSrc, privacySrc, refundSrc, cancellationSrc, contactSrc]) {
      expect(src).not.toMatch(/hello@quotereclaim\.com/i);
    }
  });

  it("no public contact surface leaks a personal Gmail address", () => {
    const userFacingSources = [
      termsSrc,
      privacySrc,
      refundSrc,
      cancellationSrc,
      contactSrc,
      legalChromeSrc,
      homepageSrc,
      authShellSrc,
    ];
    for (const src of userFacingSources) {
      expect(src).not.toMatch(/[\w.+-]+@gmail\.com/i);
    }
  });

  it("no public contact surface introduces an alternate support@ alias (single canonical mailbox)", () => {
    // Only the canonical support@quotereclaim.com is used. Catches accidental
    // contact@, hello@, help@ etc. coming back via copy-paste.
    const userFacingSources = [
      termsSrc,
      privacySrc,
      refundSrc,
      cancellationSrc,
      contactSrc,
      legalChromeSrc,
      homepageSrc,
      authShellSrc,
    ];
    const ALLOWED = new RegExp(`^${SUPPORT_EMAIL.replace(".", "\\.")}$`, "i");
    for (const src of userFacingSources) {
      const hits = src.match(/[\w.+-]+@quotereclaim\.com/gi) ?? [];
      for (const hit of hits) {
        expect(
          ALLOWED.test(hit),
          `unexpected @quotereclaim.com address on a public surface: ${hit}`,
        ).toBe(true);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// No dead checkout / no Lemon resurrection — the deleted routes stay gone
// ───────────────────────────────────────────────────────────────────────

// Walk the production tree at module top-level so this runs before
// happy-dom replaces the global (which breaks fileURLToPath at describe-time).
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

describe("no dead checkout CTA or Lemon route returns to the codebase", () => {
  it("no production source fetches the deleted /api/lemonsqueezy/checkout route", () => {
    for (const path of productionFiles) {
      const content = readFileSync(path, "utf8");
      expect(
        content.includes("/api/lemonsqueezy/checkout"),
        `${path} must not reference the deleted Lemon checkout route`,
      ).toBe(false);
    }
  });

  it("no production source contains a Lemon Squeezy identifier in code or copy", () => {
    for (const path of productionFiles) {
      const content = readFileSync(path, "utf8");
      expect(
        /\blemonsqueezy\b|\blemon squeezy\b/i.test(content),
        `${path} must not contain a Lemon Squeezy reference`,
      ).toBe(false);
    }
  });

  it("Paywall and UpgradeButton surface the billing-disabled support hint, not a checkout fetch", () => {
    const paywallSrc = readSource("../components/billing/Paywall.tsx");
    const upgradeSrc = readSource("../components/billing/UpgradeButton.tsx");
    for (const src of [paywallSrc, upgradeSrc]) {
      // No fake-checkout fetch. The disabled-state hint owns the conversion.
      expect(src).not.toMatch(/fetch\([^)]*\/api\/lemonsqueezy/);
      expect(src).toContain("SUPPORT_EMAIL");
      expect(src).toMatch(/Billing is being updated\./);
      expect(src).toMatch(/mailto:\$\{SUPPORT_EMAIL\}/);
    }
  });
});
