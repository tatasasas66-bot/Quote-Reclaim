/**
 * Billing contract — provider-agnostic.
 *
 * Quote Reclaim is currently between merchants of record. The entitlement
 * surface (price, free-plan size, isPaidStatus mapping, profiles.is_paid as
 * the single flag) is preserved verbatim. The UI surfaces an honest
 * "billing being updated — email support@quotereclaim.com" state instead of
 * routing to a dead checkout, and no Lemon-Squeezy-specific code remains
 * anywhere in the active codebase.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  FREE_PLAN_LIMIT,
  MONTHLY_PRICE_USD,
  PAYWALL_PRICE_LABEL,
  isPaidStatus,
} from "../lib/payments/entitlement";
import {
  BILLING_DISABLED_MESSAGE,
  SUPPORT_EMAIL,
  disabledProvider,
} from "../lib/payments/disabled-provider";
import { getBillingProvider } from "../lib/payments/provider";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}
function abs(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url));
}

const paywall = readSource("../components/billing/Paywall.tsx");
const upgradeButton = readSource("../components/billing/UpgradeButton.tsx");
const entitlement = readSource("../lib/payments/entitlement.ts");
const disabled = readSource("../lib/payments/disabled-provider.ts");
const types = readSource("../lib/payments/types.ts");
const providerSrc = readSource("../lib/payments/provider.ts");
const actions = readSource("../lib/quotes/actions.ts");
const newQuotePage = readSource("../app/(app)/quotes/new/page.tsx");

// ---------------------------------------------------------------------------
// Provider-agnostic entitlement model — unchanged values
// ---------------------------------------------------------------------------

describe("Entitlement constants — provider-agnostic, unchanged", () => {
  it("monthly price is $79 and the label is stable", () => {
    expect(MONTHLY_PRICE_USD).toBe(79);
    expect(PAYWALL_PRICE_LABEL).toBe("$79/month");
  });

  it("free plan is 3 quotes", () => {
    expect(FREE_PLAN_LIMIT).toBe(3);
  });

  it("isPaidStatus maps only the lifecycle 'paid' set", () => {
    for (const ok of ["active", "ACTIVE", "on_trial", "ON_TRIAL"]) {
      expect(isPaidStatus(ok)).toBe(true);
    }
    for (const bad of [
      "cancelled",
      "expired",
      "past_due",
      "paused",
      "unpaid",
      "unknown",
      "paid", // invoice status — NEVER entitles
      "",
      null,
      undefined,
    ] as const) {
      expect(isPaidStatus(bad)).toBe(false);
    }
  });

  it("the entitlement module does not import or name any specific MoR", () => {
    expect(entitlement.toLowerCase()).not.toMatch(/lemon|stripe|paddle/);
  });
});

// ---------------------------------------------------------------------------
// Safe-disabled billing provider — no dead checkout, honest contact
// ---------------------------------------------------------------------------

describe("Disabled billing provider (active default)", () => {
  it("getBillingProvider() returns the disabled provider", () => {
    expect(getBillingProvider().name).toBe("disabled");
    expect(getBillingProvider()).toBe(disabledProvider);
  });

  it("availability() reports disabled + carries the support email", () => {
    const a = disabledProvider.availability();
    expect(a.status).toBe("disabled");
    if (a.status === "disabled") {
      expect(a.supportEmail).toBe(SUPPORT_EMAIL);
    }
  });

  it("createCheckout() never returns a URL — always 503 with the support message", async () => {
    const result = await disabledProvider.createCheckout({
      userId: "u-1",
      userEmail: "x@example.com",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).toBe(BILLING_DISABLED_MESSAGE);
      expect(result.error).toContain(SUPPORT_EMAIL);
    }
  });

  it("support email is the launch-prep address", () => {
    expect(SUPPORT_EMAIL).toBe("support@quotereclaim.com");
    expect(BILLING_DISABLED_MESSAGE).toMatch(
      /^Billing is being updated\. Contact support@quotereclaim\.com/,
    );
  });

  it("provider abstraction is provider-agnostic in NAME — no MoR named anywhere", () => {
    for (const src of [disabled, types, providerSrc]) {
      expect(src.toLowerCase()).not.toMatch(/lemon|stripe|paddle/);
    }
  });
});

// ---------------------------------------------------------------------------
// Lemon-specific code is gone — no dead routes, no dead helpers
// ---------------------------------------------------------------------------

describe("Lemon Squeezy removal", () => {
  const deletedPaths = [
    "../app/api/lemonsqueezy/checkout/route.ts",
    "../app/api/webhooks/lemonsqueezy/route.ts",
    "../lib/payments/lemonsqueezy.ts",
    "../lib/payments/create-checkout.ts",
    "../lib/payments/verify-webhook.ts",
  ] as const;

  it("every Lemon-specific source file is gone", () => {
    for (const p of deletedPaths) {
      expect(existsSync(abs(p)), `${p} must be deleted`).toBe(false);
    }
  });

  it("no active source file under src/ names Lemon anywhere", () => {
    for (const src of [
      paywall,
      upgradeButton,
      entitlement,
      disabled,
      types,
      providerSrc,
      newQuotePage,
    ]) {
      expect(src.toLowerCase()).not.toContain("lemon");
      expect(src).not.toMatch(/LEMONSQUEEZY/);
    }
  });

  it("no active source file routes to a /api/lemonsqueezy/* URL", () => {
    for (const src of [paywall, upgradeButton, newQuotePage]) {
      expect(src).not.toMatch(/\/api\/lemonsqueezy/);
      expect(src).not.toMatch(/\/api\/webhooks\/lemonsqueezy/);
    }
  });

  it(".env.example carries no Lemon-Squeezy variables", () => {
    const envExample = readFileSync(
      fileURLToPath(new URL("../../.env.example", import.meta.url)),
      "utf8",
    );
    expect(envExample.toLowerCase()).not.toContain("lemon");
    expect(envExample).not.toMatch(/LEMONSQUEEZY/);
  });
});

// ---------------------------------------------------------------------------
// Paywall — safe-disabled behavior + value anchor + locked trust copy
// ---------------------------------------------------------------------------

describe("Paywall component", () => {
  it("is a client component", () => {
    expect(paywall.startsWith('"use client"')).toBe(true);
  });

  it("never fetches a checkout route — no network call, no dead URL", () => {
    expect(paywall).not.toMatch(/fetch\(/);
    expect(paywall).not.toMatch(/window\.location\.href\s*=/);
    expect(paywall).not.toMatch(/\/api\/(lemonsqueezy|stripe|paddle|checkout)/i);
  });

  it("surfaces the support email + mailto on CTA click (honest disabled state)", () => {
    expect(paywall).toContain("SUPPORT_EMAIL");
    expect(paywall).toContain('data-testid="paywall-billing-hint"');
    expect(paywall).toMatch(/mailto:\$\{SUPPORT_EMAIL\}/);
    expect(paywall).toMatch(/Billing is being updated/);
  });

  it("displays the founding-contractor copy with honest real price math (unchanged)", () => {
    expect(paywall).toContain("FOUNDING CONTRACTOR");
    expect(paywall).toMatch(/Don&apos;t let good quotes die quiet\./);
    expect(paywall).toMatch(/follows\s+up by email automatically/);
    expect(paywall).toMatch(/1\.5% of a single \$5,000 job/);
    expect(paywall).toContain("Unlock Silent Quote Command — $79/month");
    expect(paywall).toContain("Not now");
    expect(paywall).toMatch(/Lock in early access\. Cancel anytime\./);
    expect(paywall).toMatch(/Not another\s+CRM\./);
  });

  it("preserves the value-anchored CTA when silentQuoteValue > 0", () => {
    expect(paywall).toContain("hasSilent");
    expect(paywall).toContain('data-testid="paywall-money-anchor"');
    expect(paywall).toMatch(/Sitting quiet in your queue/);
    expect(paywall).toMatch(/text-money/);
    expect(paywall).toContain("Import the rest — $79/month");
  });

  it("anchors the upgrade ask to the contractor's own silent dollars when known", () => {
    // Ethical value anchoring: when we know hasSilent, the number is the
    // visual hero (text-money, large font) AND the CTA reframes as "Import
    // the rest — $79/month" so $79 reads as the answer to *their* number.
    expect(paywall).toContain("hasSilent");
    expect(paywall).toContain('data-testid="paywall-money-anchor"');
    expect(paywall).toMatch(/Sitting quiet in your queue/);
    expect(paywall).toMatch(/text-money/);
    expect(paywall).toContain("Import the rest — $79/month");
    // Original CTA label survives as the fallback branch for the no-silent
    // case (locked by existing tests above). Both labels co-exist in source.
    expect(paywall).toContain("Unlock Silent Quote Command — $79/month");
  });

  it("the value anchor is gated on hasSilent only — no fake/zero numbers ever rendered", () => {
    // Zero or unknown silentQuoteValue must NOT render the money anchor.
    expect(paywall).toMatch(
      /hasSilent\s*=\s*Boolean\(silentQuoteValue && silentQuoteValue > 0\)/,
    );
    expect(paywall).toMatch(/hasSilent\s*\?\s*\([\s\S]*?paywall-money-anchor/);
  });

  it("the new anchor introduces no scarcity, countdown, or fake-math claim", () => {
    expect(paywall).not.toMatch(
      /expires|countdown|hurry|only \d+ left|last chance|today only/i,
    );
    expect(paywall).not.toMatch(/\bguarantee\b/i);
    // $79 is the only price — unchanged.
    expect(paywall).not.toMatch(/\$39\b|\$49\b|\$59\b|\$69\b|\$89\b|\$99\b/);
    expect(paywall).toContain("$79/month");
  });

  it("never shows feature-list paywall, fake urgency, or testimonials", () => {
    expect(paywall).not.toMatch(/feature.list|features:|✓ feature/i);
    expect(paywall).not.toMatch(/only \d+ left|hurry|expires soon|countdown/i);
    expect(paywall).not.toMatch(/testimonial|review|"[^"]+" —/);
    expect(paywall).not.toMatch(/\bguarantee/i);
  });

  it("does not redirect to '#' on error", () => {
    expect(paywall).not.toMatch(/href\s*=\s*['"]#['"]/);
  });
});

// ---------------------------------------------------------------------------
// UpgradeButton — safe-disabled behavior
// ---------------------------------------------------------------------------

describe("UpgradeButton component", () => {
  it("is a client component", () => {
    expect(upgradeButton.startsWith('"use client"')).toBe(true);
  });

  it("never fetches a checkout route — no fake success/loading state either", () => {
    expect(upgradeButton).not.toMatch(/fetch\(/);
    expect(upgradeButton).not.toMatch(/window\.location\.href\s*=/);
    expect(upgradeButton).not.toMatch(/\/api\//);
  });

  it("preserves the $79 price label so conversion intent stays visible", () => {
    expect(upgradeButton).toContain("$79/month");
  });

  it("surfaces the support email + mailto on click (honest disabled state)", () => {
    expect(upgradeButton).toContain("SUPPORT_EMAIL");
    expect(upgradeButton).toContain('data-testid="upgrade-billing-hint"');
    expect(upgradeButton).toMatch(/mailto:\$\{SUPPORT_EMAIL\}/);
    expect(upgradeButton).toMatch(/Billing is being updated/);
  });
});

// ---------------------------------------------------------------------------
// /quotes/new page paywall integration — still 3-free-quote gated
// ---------------------------------------------------------------------------

describe("/quotes/new page paywall integration", () => {
  it("imports Paywall and FREE_PLAN_LIMIT from the provider-agnostic module", () => {
    expect(newQuotePage).toContain("Paywall");
    expect(newQuotePage).toContain("FREE_PLAN_LIMIT");
    expect(newQuotePage).toContain('"@/lib/payments/entitlement"');
  });

  it("blocks the form when usage >= FREE_PLAN_LIMIT and not paid", () => {
    expect(newQuotePage).toMatch(/!isPaid\s*&&\s*usage\s*>=\s*FREE_PLAN_LIMIT/);
    expect(newQuotePage).toMatch(/\{\s*blocked\s*\?\s*\(?\s*<Paywall/);
  });

  it("renders the QuoteForm only on the unblocked branch", () => {
    expect(newQuotePage).toMatch(
      /blocked\s*\?[\s\S]*?<Paywall[\s\S]*?:[\s\S]*?<QuoteForm/,
    );
  });

  it("reads usage_count + is_paid from profile, not from client input", () => {
    expect(newQuotePage).toContain("usage_count");
    expect(newQuotePage).toContain("is_paid");
  });

  it("dashboard back-link remains so the user never gets trapped", () => {
    expect(newQuotePage).toContain('href="/dashboard"');
  });
});

// ---------------------------------------------------------------------------
// createQuoteAction: free-plan gate intact, never bypassed
// ---------------------------------------------------------------------------

describe("createQuoteAction free-plan gate (unchanged)", () => {
  it("uses the up-to-date 'Subscribe to unlock' copy", () => {
    expect(actions).toContain("Subscribe to unlock");
    expect(actions).toContain("$79/month");
  });

  it("still calls check_and_increment_usage for every row", () => {
    expect(actions).toContain("check_and_increment_usage");
  });
});
