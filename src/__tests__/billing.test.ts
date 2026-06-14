/**
 * Billing contract — Paddle wired up; safe-disabled fallback intact.
 *
 * The entitlement surface (price, free-plan size, isPaidStatus mapping,
 * profiles.is_paid as the single flag) is preserved verbatim. When Paddle
 * env vars are set, getBillingProvider() returns the Paddle provider and
 * the UI opens Paddle.js overlay checkout. When they are unset, the UI
 * still surfaces the honest "billing being updated — email
 * support@quotereclaim.com" fallback so a deployment without Paddle keys
 * never shows a button that opens broken checkout.
 *
 * No Lemon-Squeezy code survives anywhere.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
import {
  paddleProvider,
  paddleClientConfigured,
  paddleEnvironment,
} from "../lib/payments/paddle-provider";
import { getBillingProvider } from "../lib/payments/provider";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}
function abs(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url));
}

const paywall = readSource("../components/billing/Paywall.tsx");
const upgradeButton = readSource("../components/billing/UpgradeButton.tsx");
const checkoutButton = readSource(
  "../components/billing/PaddleCheckoutButton.tsx",
);
const entitlement = readSource("../lib/payments/entitlement.ts");
const disabled = readSource("../lib/payments/disabled-provider.ts");
const types = readSource("../lib/payments/types.ts");
const providerSrc = readSource("../lib/payments/provider.ts");
const paddleProviderSrc = readSource("../lib/payments/paddle-provider.ts");
const actions = readSource("../lib/quotes/actions.ts");
const newQuotePage = readSource("../app/(app)/quotes/new/page.tsx");
const dashboardPage = readSource("../app/(app)/dashboard/page.tsx");

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
// Disabled provider — the safe fallback when no Paddle keys are set
// ---------------------------------------------------------------------------

describe("Disabled billing provider (fallback)", () => {
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

  it("disabled-provider source stays MoR-agnostic in name", () => {
    // Only the paddle provider module knows the provider name; the
    // disabled fallback and the types module stay generic.
    for (const src of [disabled, types]) {
      expect(src.toLowerCase()).not.toMatch(/lemon|stripe|paddle/);
    }
  });
});

// ---------------------------------------------------------------------------
// Paddle provider — active when env is configured
// ---------------------------------------------------------------------------

describe("Paddle billing provider", () => {
  const originalClientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const originalPriceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
  const originalEnv = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    delete process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
    delete process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT;
  });
  afterEach(() => {
    if (originalClientToken !== undefined)
      process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = originalClientToken;
    if (originalPriceId !== undefined)
      process.env.NEXT_PUBLIC_PADDLE_PRICE_ID = originalPriceId;
    if (originalEnv !== undefined)
      process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT = originalEnv;
  });

  it("paddleClientConfigured() is true only when BOTH public env vars are set", () => {
    expect(paddleClientConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = "live_xxx";
    expect(paddleClientConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_PADDLE_PRICE_ID = "pri_xxx";
    expect(paddleClientConfigured()).toBe(true);
  });

  it("paddleEnvironment() defaults to production, accepts 'sandbox'", () => {
    expect(paddleEnvironment()).toBe("production");
    process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT = "sandbox";
    expect(paddleEnvironment()).toBe("sandbox");
    process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT = "anything-else";
    expect(paddleEnvironment()).toBe("production");
  });

  it("availability() reports available only when configured", () => {
    expect(paddleProvider.availability().status).toBe("disabled");
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = "live_xxx";
    process.env.NEXT_PUBLIC_PADDLE_PRICE_ID = "pri_xxx";
    expect(paddleProvider.availability().status).toBe("available");
  });

  it("createCheckout() returns the client-side hint, never a server URL", async () => {
    const r = await paddleProvider.createCheckout({ userId: "u" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/client-side/i);
    }
  });

  it("getBillingProvider() selects paddle when configured, disabled otherwise", () => {
    expect(getBillingProvider().name).toBe("disabled");
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = "live_xxx";
    process.env.NEXT_PUBLIC_PADDLE_PRICE_ID = "pri_xxx";
    expect(getBillingProvider().name).toBe("paddle");
    expect(getBillingProvider()).toBe(paddleProvider);
  });

  it("paddle-provider source is the ONLY billing module that names the MoR", () => {
    expect(paddleProviderSrc.toLowerCase()).toContain("paddle");
    // The provider.ts selector references the paddle module, so it
    // legitimately names paddle. The disabled/types modules stay generic.
    expect(providerSrc.toLowerCase()).toContain("paddle");
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
      paddleProviderSrc,
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
// .env.example — declares the Paddle env vars (no values)
// ---------------------------------------------------------------------------

describe(".env.example declares Paddle env names without values", () => {
  const envExample = readFileSync(
    fileURLToPath(new URL("../../.env.example", import.meta.url)),
    "utf8",
  );

  it("includes the four required Paddle keys plus the optional environment toggle", () => {
    for (const key of [
      "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=",
      "NEXT_PUBLIC_PADDLE_PRICE_ID=",
      "NEXT_PUBLIC_PADDLE_ENVIRONMENT=",
      "PADDLE_API_KEY=",
      "PADDLE_WEBHOOK_SECRET=",
    ]) {
      expect(envExample).toContain(key);
    }
  });

  it("never commits an actual secret next to those keys", () => {
    // Each `PADDLE_*=` line is either followed by a comment, end-of-line, or
    // the safe "production" sentinel — never a token-like value.
    const lines = envExample.split("\n").filter((l) => /^[A-Z_]*PADDLE/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const [, value = ""] = line.split("=");
      const trimmed = value.trim();
      // Allow empty, allow the documented "production" default, ban anything
      // that looks like a real Paddle token or webhook secret.
      expect(trimmed === "" || trimmed === "production").toBe(true);
      expect(trimmed).not.toMatch(/^(pdl_|live_|sandbox_|pri_|pro_|ntfset_|whsec_)/);
    }
  });
});

// ---------------------------------------------------------------------------
// Paywall — Paddle when wired, mailto fallback when not; locked copy intact
// ---------------------------------------------------------------------------

describe("Paywall component", () => {
  it("is a client component", () => {
    expect(paywall.startsWith('"use client"')).toBe(true);
  });

  it("never fetches a checkout route — Paddle opens client-side via the SDK", () => {
    expect(paywall).not.toMatch(/fetch\(/);
    expect(paywall).not.toMatch(/window\.location\.href\s*=/);
    // No server-side checkout URL is built or routed to.
    expect(paywall).not.toMatch(/\/api\/(lemonsqueezy|stripe|paddle|checkout)/i);
  });

  it("renders the PaddleCheckoutButton when paddleAvailable and a user is known", () => {
    expect(paywall).toContain("PaddleCheckoutButton");
    expect(paywall).toMatch(/canCheckout\s*=\s*Boolean\(paddleAvailable && userId\)/);
    expect(paywall).toMatch(/canCheckout && userId\s*\?\s*\(?\s*<PaddleCheckoutButton/);
  });

  it("preserves the honest support-email fallback when Paddle is not available", () => {
    expect(paywall).toContain("SUPPORT_EMAIL");
    expect(paywall).toContain('data-testid="paywall-billing-hint"');
    expect(paywall).toMatch(/mailto:\$\{SUPPORT_EMAIL\}/);
    expect(paywall).toMatch(/Billing is being updated/);
  });

  it("displays the founding-contractor copy with honest real price math", () => {
    expect(paywall).toContain("FOUNDING CONTRACTOR");
    expect(paywall).toMatch(/Don&apos;t let good quotes die quiet\./);
    expect(paywall).toMatch(/sent by\s+email when there&apos;s an address/);
    expect(paywall).toMatch(/ready to copy when there\s+isn&apos;t/);
    expect(paywall).not.toMatch(/follows\s+up by email automatically\./);
    expect(paywall).toMatch(/1\.5% of a single \$5,000 job/);
    expect(paywall).toContain("Unlock Silent Quote Command — $79/month");
    expect(paywall).toContain("Not now");
    expect(paywall).toMatch(/Lock in early access\. Cancel anytime\./);
    expect(paywall).toMatch(/Not another\s+CRM\./);
  });

  it("surfaces the 'First 3 quotes are free.' / 'Cancel anytime.' reassurance line", () => {
    expect(paywall).toMatch(/First 3 quotes are free\./);
    expect(paywall).toMatch(/Cancel anytime\./);
  });

  it("preserves the value-anchored CTA when silentQuoteValue > 0", () => {
    expect(paywall).toContain("hasSilent");
    expect(paywall).toContain('data-testid="paywall-money-anchor"');
    expect(paywall).toMatch(/Sitting quiet in your queue/);
    expect(paywall).toMatch(/text-money/);
    expect(paywall).toContain("Import the rest — $79/month");
  });

  it("the value anchor is gated on hasSilent only — no fake/zero numbers ever rendered", () => {
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
// UpgradeButton — Paddle when wired; Pro chip when already paid; mailto otherwise
// ---------------------------------------------------------------------------

describe("UpgradeButton component", () => {
  it("is a client component", () => {
    expect(upgradeButton.startsWith('"use client"')).toBe(true);
  });

  it("never fetches a checkout route — Paddle opens client-side via the SDK", () => {
    expect(upgradeButton).not.toMatch(/fetch\(/);
    expect(upgradeButton).not.toMatch(/window\.location\.href\s*=/);
    expect(upgradeButton).not.toMatch(/\/api\//);
  });

  it("preserves the $79 price label so conversion intent stays visible", () => {
    expect(upgradeButton).toContain("$79/month");
  });

  it("renders the PaddleCheckoutButton when paddleAvailable and a user is known", () => {
    expect(upgradeButton).toContain("PaddleCheckoutButton");
    expect(upgradeButton).toMatch(/canCheckout\s*=\s*Boolean\(paddleAvailable && userId\)/);
  });

  it("collapses to a 'Pro · Active' chip when the user is already paid", () => {
    expect(upgradeButton).toMatch(/if \(isPaid\)/);
    expect(upgradeButton).toContain('data-testid="upgrade-pro-active"');
    expect(upgradeButton).toMatch(/Pro · Active/);
  });

  it("surfaces the support email + mailto on click when Paddle is not wired", () => {
    expect(upgradeButton).toContain("SUPPORT_EMAIL");
    expect(upgradeButton).toContain('data-testid="upgrade-billing-hint"');
    expect(upgradeButton).toMatch(/mailto:\$\{SUPPORT_EMAIL\}/);
    expect(upgradeButton).toMatch(/Billing is being updated/);
  });
});

// ---------------------------------------------------------------------------
// PaddleCheckoutButton — pins user_id, never trusts client-supplied entitlement
// ---------------------------------------------------------------------------

describe("PaddleCheckoutButton component", () => {
  it("is a client component", () => {
    expect(checkoutButton.startsWith('"use client"')).toBe(true);
  });

  it("loads Paddle.js from the official CDN — not from a wildcard URL", () => {
    expect(checkoutButton).toContain("https://cdn.paddle.com/paddle/v2/paddle.js");
  });

  it("reads ONLY the public Paddle env vars on the client", () => {
    expect(checkoutButton).toContain("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
    expect(checkoutButton).toContain("NEXT_PUBLIC_PADDLE_PRICE_ID");
    expect(checkoutButton).not.toContain("PADDLE_API_KEY");
    expect(checkoutButton).not.toContain("PADDLE_WEBHOOK_SECRET");
  });

  it("pins the authenticated user_id into Paddle custom_data", () => {
    expect(checkoutButton).toMatch(/customData:\s*\{\s*user_id:\s*userId/);
    expect(checkoutButton).toMatch(/app:\s*["']quote_reclaim["']/);
  });

  it("never leaks quote or customer PII into custom_data", () => {
    // Custom data carries only user_id + a static app tag ("quote_reclaim").
    // Quote/customer dollar values and client identifiers are never attached.
    expect(checkoutButton).not.toMatch(/customData[\s\S]{0,200}(estimate|client_email|client_name|recovered_amount|quote_id)/i);
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

  it("threads the auth user + paddle availability into the Paywall", () => {
    expect(newQuotePage).toMatch(/userId=\{user\.id\}/);
    expect(newQuotePage).toMatch(/userEmail=\{user\.email \?\? null\}/);
    expect(newQuotePage).toMatch(/paddleAvailable=\{paddleClientConfigured\(\)\}/);
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
// Dashboard header — UpgradeButton is wired with user + paddle availability
// ---------------------------------------------------------------------------

describe("Dashboard header threads user + paddle availability", () => {
  it("dashboard passes userId, userEmail, isPaid, and paddleAvailable to UpgradeButton", () => {
    expect(dashboardPage).toMatch(/<UpgradeButton[\s\S]*?userId=\{user\.id\}/);
    expect(dashboardPage).toMatch(/<UpgradeButton[\s\S]*?userEmail=\{user\.email \?\? null\}/);
    expect(dashboardPage).toMatch(/<UpgradeButton[\s\S]*?isPaid=\{isPaid\}/);
    expect(dashboardPage).toMatch(/<UpgradeButton[\s\S]*?paddleAvailable=\{paddleClientConfigured\(\)\}/);
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
