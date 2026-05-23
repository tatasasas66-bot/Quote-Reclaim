import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

import {
  verifyLemonSignature,
  shouldVerifyLemonMode,
} from "../lib/payments/verify-webhook";
import {
  FREE_PLAN_LIMIT,
  MONTHLY_PRICE_USD,
  PAYWALL_PRICE_LABEL,
  isPaidStatus,
  resolveCheckoutMode,
  readLemonEnv,
} from "../lib/payments/lemonsqueezy";
import { createLemonCheckoutForUser } from "../lib/payments/create-checkout";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const paywall = readSource("../components/billing/Paywall.tsx");
const newQuotePage = readSource("../app/(app)/quotes/new/page.tsx");
const checkoutRoute = readSource("../app/api/lemonsqueezy/checkout/route.ts");
const webhookRoute = readSource("../app/api/webhooks/lemonsqueezy/route.ts");
const lsLib = readSource("../lib/payments/lemonsqueezy.ts");
const actions = readSource("../lib/quotes/actions.ts");

// ---------------------------------------------------------------------------
// Pricing invariants
// ---------------------------------------------------------------------------

describe("Pricing invariants", () => {
  it("monthly price is exactly $79 — no discounts, no founding offer", () => {
    expect(MONTHLY_PRICE_USD).toBe(79);
    expect(PAYWALL_PRICE_LABEL).toBe("$79/month");
  });

  it("free plan limit is exactly 3", () => {
    expect(FREE_PLAN_LIMIT).toBe(3);
  });

  it("Paywall UI shows only $79/month — no $39, no $49, no 'founding', no 'discount'", () => {
    expect(paywall).toContain("$79/month");
    expect(paywall).not.toMatch(/\$39\b/);
    expect(paywall).not.toMatch(/\$49\b/);
    expect(paywall).not.toMatch(/founding/i);
    expect(paywall).not.toMatch(/discount/i);
    expect(paywall).not.toMatch(/\bsale\b/i);
    expect(paywall).not.toMatch(/limited.time/i);
  });

  it("no Lemon paywall surface uses the word 'Bid'", () => {
    expect(paywall).not.toMatch(/\bBid\b/);
    expect(newQuotePage).not.toMatch(/\bBid\b/);
    expect(webhookRoute).not.toMatch(/\bBid\b/);
    expect(checkoutRoute).not.toMatch(/\bBid\b/);
  });
});

// ---------------------------------------------------------------------------
// isPaidStatus
// ---------------------------------------------------------------------------

describe("isPaidStatus", () => {
  it("treats active and on_trial as paid", () => {
    expect(isPaidStatus("active")).toBe(true);
    expect(isPaidStatus("on_trial")).toBe(true);
    expect(isPaidStatus("ACTIVE")).toBe(true);
  });

  it("treats every non-paid status as unpaid", () => {
    expect(isPaidStatus("cancelled")).toBe(false);
    expect(isPaidStatus("expired")).toBe(false);
    expect(isPaidStatus("past_due")).toBe(false);
    expect(isPaidStatus("unpaid")).toBe(false);
    expect(isPaidStatus("paused")).toBe(false);
    expect(isPaidStatus("")).toBe(false);
    expect(isPaidStatus(null)).toBe(false);
    expect(isPaidStatus(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveCheckoutMode
// ---------------------------------------------------------------------------

describe("resolveCheckoutMode", () => {
  it("prefers API mode when all three API vars are set", () => {
    expect(
      resolveCheckoutMode({
        apiKey: "k",
        storeId: "s",
        variantId: "v",
        publicCheckoutUrl: "https://example.com",
      }),
    ).toBe("api");
  });

  it("falls back to public-url when only the public URL is set", () => {
    expect(
      resolveCheckoutMode({ publicCheckoutUrl: "https://example.com" }),
    ).toBe("public-url");
  });

  it("returns 'unavailable' when nothing is configured", () => {
    expect(resolveCheckoutMode({})).toBe("unavailable");
  });

  it("returns 'unavailable' when API config is partial", () => {
    expect(resolveCheckoutMode({ apiKey: "k", storeId: "s" })).toBe(
      "unavailable",
    );
    expect(resolveCheckoutMode({ apiKey: "k", variantId: "v" })).toBe(
      "unavailable",
    );
  });
});

// ---------------------------------------------------------------------------
// readLemonEnv
// ---------------------------------------------------------------------------

describe("readLemonEnv", () => {
  it("reads the documented env vars and ignores empty strings", () => {
    const env = readLemonEnv({
      LEMONSQUEEZY_API_KEY: "k",
      LEMONSQUEEZY_STORE_ID: "s",
      LEMONSQUEEZY_VARIANT_ID: "v",
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL: "",
      LEMONSQUEEZY_WEBHOOK_SECRET: "wh",
    });
    expect(env.apiKey).toBe("k");
    expect(env.storeId).toBe("s");
    expect(env.variantId).toBe("v");
    expect(env.publicCheckoutUrl).toBeUndefined();
    expect(env.webhookSecret).toBe("wh");
  });
});

// ---------------------------------------------------------------------------
// createLemonCheckoutForUser
// ---------------------------------------------------------------------------

describe("createLemonCheckoutForUser", () => {
  it("returns 503 when nothing is configured (no fallback to '#')", async () => {
    const result = await createLemonCheckoutForUser({
      userId: "user-1",
      env: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).toMatch(/configure/i);
    }
  });

  it("public-url mode appends user_id and email as Lemon custom params", async () => {
    const result = await createLemonCheckoutForUser({
      userId: "user-42",
      userEmail: "founder@example.com",
      env: { publicCheckoutUrl: "https://store.lemonsqueezy.com/buy/abc" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const url = new URL(result.url);
      expect(url.searchParams.get("checkout[custom][user_id]")).toBe("user-42");
      expect(url.searchParams.get("checkout[email]")).toBe(
        "founder@example.com",
      );
      expect(result.url).not.toBe("#");
      expect(result.url.startsWith("https://")).toBe(true);
    }
  });

  it("public-url mode rejects non-HTTPS checkout URLs", async () => {
    const result = await createLemonCheckoutForUser({
      userId: "user-1",
      env: { publicCheckoutUrl: "http://example.com/buy" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  it("public-url mode rejects malformed checkout URLs", async () => {
    const result = await createLemonCheckoutForUser({
      userId: "user-1",
      env: { publicCheckoutUrl: "not-a-url" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// verifyLemonSignature + shouldVerifyLemonMode
// ---------------------------------------------------------------------------

describe("verifyLemonSignature", () => {
  const secret = "whsec_unit_test_secret";
  const body = JSON.stringify({
    meta: { event_name: "subscription_created" },
  });

  it("accepts a correctly computed HMAC-SHA256 signature", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyLemonSignature({ secret, body, signature: sig })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(
      verifyLemonSignature({ secret, body: body + "tamper", signature: sig }),
    ).toBe(false);
  });

  it("rejects a tampered signature", () => {
    expect(
      verifyLemonSignature({ secret, body, signature: "deadbeef" }),
    ).toBe(false);
  });

  it("rejects empty secret or empty signature", () => {
    expect(verifyLemonSignature({ secret: "", body, signature: "x" })).toBe(
      false,
    );
    expect(verifyLemonSignature({ secret, body, signature: "" })).toBe(false);
  });
});

describe("shouldVerifyLemonMode", () => {
  it("returns 'verify' in production with secret set", () => {
    expect(
      shouldVerifyLemonMode({
        NODE_ENV: "production",
        LEMONSQUEEZY_WEBHOOK_SECRET: "x",
      }),
    ).toBe("verify");
  });

  it("returns 'reject' (fail closed) in production without secret", () => {
    expect(shouldVerifyLemonMode({ NODE_ENV: "production" })).toBe("reject");
  });

  it("allows unsigned in non-production with no secret (dev/test)", () => {
    expect(shouldVerifyLemonMode({ NODE_ENV: "test" })).toBe("allow-unsigned");
    expect(shouldVerifyLemonMode({ NODE_ENV: "development" })).toBe(
      "allow-unsigned",
    );
  });
});

// ---------------------------------------------------------------------------
// /api/lemonsqueezy/checkout route
// ---------------------------------------------------------------------------

describe("/api/lemonsqueezy/checkout route", () => {
  it("exports a POST handler", () => {
    expect(checkoutRoute).toMatch(/export async function POST/);
  });

  it("requires an authenticated user (401 on missing session)", () => {
    expect(checkoutRoute).toContain("auth.getUser");
    expect(checkoutRoute).toMatch(/status:\s*401/);
  });

  it("never trusts a client-provided user_id (uses server session)", () => {
    expect(checkoutRoute).toMatch(/userData\.user\.id/);
    expect(checkoutRoute).not.toMatch(/formData|request\.json\(\)[\s\S]{0,100}user_id/);
  });

  it("delegates to createLemonCheckoutForUser (server-side)", () => {
    expect(checkoutRoute).toContain("createLemonCheckoutForUser");
  });

  it("returns 503 when checkout is not configured (no '#' fallback)", () => {
    expect(checkoutRoute).not.toMatch(/url:\s*['"]#['"]/);
  });
});

// ---------------------------------------------------------------------------
// /api/webhooks/lemonsqueezy route
// ---------------------------------------------------------------------------

describe("/api/webhooks/lemonsqueezy route", () => {
  it("exports a POST handler", () => {
    expect(webhookRoute).toMatch(/export async function POST/);
  });

  it("verifies the signature with LEMONSQUEEZY_WEBHOOK_SECRET", () => {
    expect(webhookRoute).toContain("verifyLemonSignature");
    expect(webhookRoute).toContain("LEMONSQUEEZY_WEBHOOK_SECRET");
    expect(webhookRoute).toContain("X-Signature");
  });

  it("returns 401 on invalid signature", () => {
    expect(webhookRoute).toMatch(/Invalid signature[\s\S]*?status:\s*401/);
  });

  it("returns 503 in production without webhook secret (fail closed)", () => {
    expect(webhookRoute).toMatch(/mode === "reject"[\s\S]*?status:\s*503/);
  });

  it("reads user_id from custom_data and returns 500 if missing (Lemon retries)", () => {
    expect(webhookRoute).toContain("custom_data");
    expect(webhookRoute).toMatch(/Missing user_id[\s\S]*?status:\s*500/);
  });

  it("upserts the subscriptions row keyed by user_id (idempotent)", () => {
    expect(webhookRoute).toMatch(
      /from\("subscriptions"\)\.upsert\([\s\S]*?onConflict:\s*"user_id"/,
    );
  });

  it("updates profiles.is_paid from the subscription status", () => {
    expect(webhookRoute).toContain("is_paid: paid");
    expect(webhookRoute).toContain("isPaidStatus");
  });

  it("returns 500 when no profile row was updated (retry)", () => {
    expect(webhookRoute).toMatch(/updated\.length === 0[\s\S]*?status:\s*500/);
  });

  it("handles subscription_* events and ignores others", () => {
    expect(webhookRoute).toMatch(/eventName\.startsWith\("subscription_"\)/);
  });

  it("never echoes raw error details into the response body", () => {
    // Body strings are static phrases; supabase error.message should only
    // be passed to console.error, not into NextResponse body.
    expect(webhookRoute).not.toMatch(
      /NextResponse[^;]*error\.message/,
    );
    expect(webhookRoute).not.toMatch(
      /new NextResponse\(\s*[`'"][^`'"]*\$\{[^}]*error/,
    );
  });

  it("uses the service-role client (RLS bypass needed to update profiles)", () => {
    expect(webhookRoute).toContain("createServiceSupabaseClient");
  });
});

// ---------------------------------------------------------------------------
// Paywall UI invariants
// ---------------------------------------------------------------------------

describe("Paywall component", () => {
  it("is a client component", () => {
    expect(paywall.startsWith('"use client"')).toBe(true);
  });

  it("calls /api/lemonsqueezy/checkout", () => {
    expect(paywall).toContain("/api/lemonsqueezy/checkout");
  });

  it("displays the prescribed copy", () => {
    expect(paywall).toContain("You");
    expect(paywall).toContain("3 free silent quotes");
    expect(paywall).toContain("The quiet money is still");
    expect(paywall).toContain("One won-back job can pay");
    expect(paywall).toContain(
      "Unlock unlimited silent quote recovery — $79/month",
    );
    expect(paywall).toContain("Unlock unlimited recovery");
    expect(paywall).toContain("Keep viewing existing recovery plans");
  });

  it("shows a loading state and shows checkout errors inline", () => {
    expect(paywall).toContain("loading={pending}");
    expect(paywall).toContain('role="alert"');
  });

  it("does not redirect to '#' on error", () => {
    expect(paywall).not.toMatch(/href\s*=\s*['"]#['"]/);
    expect(paywall).not.toMatch(/window\.location\.href\s*=\s*['"]#['"]/);
  });

  it("never shows feature-list paywall, fake urgency, or testimonials", () => {
    expect(paywall).not.toMatch(/feature.list|features:|✓ feature/i);
    expect(paywall).not.toMatch(/only \d+ left|hurry|expires soon/i);
    expect(paywall).not.toMatch(/testimonial|review|"[^"]+" —/);
  });
});

// ---------------------------------------------------------------------------
// New-quote page paywall integration
// ---------------------------------------------------------------------------

describe("/quotes/new page paywall integration", () => {
  it("imports Paywall and FREE_PLAN_LIMIT", () => {
    expect(newQuotePage).toContain("Paywall");
    expect(newQuotePage).toContain("FREE_PLAN_LIMIT");
  });

  it("blocks the form when usage >= FREE_PLAN_LIMIT and not paid", () => {
    expect(newQuotePage).toMatch(
      /!isPaid\s*&&\s*usage\s*>=\s*FREE_PLAN_LIMIT/,
    );
    expect(newQuotePage).toMatch(/\{\s*blocked\s*\?\s*\(?\s*<Paywall/);
  });

  it("renders the QuoteForm only on the unblocked branch", () => {
    expect(newQuotePage).toMatch(/blocked\s*\?[\s\S]*?<Paywall[\s\S]*?:[\s\S]*?<QuoteForm/);
  });

  it("reads usage_count + is_paid from profile, not from client input", () => {
    expect(newQuotePage).toContain("usage_count");
    expect(newQuotePage).toContain("is_paid");
  });

  it("does not block existing data access — dashboard link remains", () => {
    expect(newQuotePage).toContain('href="/dashboard"');
  });
});

// ---------------------------------------------------------------------------
// createQuoteAction: gated message points at subscribe, no stale copy
// ---------------------------------------------------------------------------

describe("createQuoteAction free-plan gate", () => {
  it("uses the up-to-date 'Subscribe to unlock' copy", () => {
    expect(actions).toContain("Subscribe to unlock");
    expect(actions).toContain("$79/month");
  });

  it("no longer ships the 'later phase' placeholder copy", () => {
    expect(actions).not.toContain("Upgrades land in a later phase");
  });

  it("still calls check_and_increment_usage", () => {
    expect(actions).toContain("check_and_increment_usage");
  });
});

// ---------------------------------------------------------------------------
// Centralized price constants
// ---------------------------------------------------------------------------

describe("lemonsqueezy lib constants", () => {
  it("paid-status set has exactly active + on_trial", () => {
    expect(lsLib).toContain('"active"');
    expect(lsLib).toContain('"on_trial"');
    // The constant set should not contain any other status name.
    expect(lsLib).not.toMatch(/"past_due"/);
    expect(lsLib).not.toMatch(/"unpaid"/);
  });
});
