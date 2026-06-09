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

  it("Paywall UI shows only $79/month — no $39/$49, no discount/sale/fake urgency", () => {
    expect(paywall).toContain("$79/month");
    expect(paywall).not.toMatch(/\$39\b/);
    expect(paywall).not.toMatch(/\$49\b/);
    expect(paywall).not.toMatch(/discount/i);
    expect(paywall).not.toMatch(/\bsale\b/i);
    expect(paywall).not.toMatch(/limited.time/i);
    // Founding-contractor framing is intentional and honest (no fake countdown).
    expect(paywall).toMatch(/FOUNDING CONTRACTOR/);
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

  it("handles subscription lifecycle events and ignores others", () => {
    expect(webhookRoute).toContain("SUBSCRIPTION_LIFECYCLE_EVENTS");
    expect(webhookRoute).toMatch(
      /SUBSCRIPTION_LIFECYCLE_EVENTS\.has\(eventName\)/,
    );
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

  it("displays the founding-contractor copy with honest real price math", () => {
    expect(paywall).toContain("FOUNDING CONTRACTOR");
    expect(paywall).toMatch(/Don&apos;t let good quotes die quiet\./);
    // The only honest automation claim: email auto-send (Resend) is real.
    expect(paywall).toMatch(/follows\s+up by email automatically/);
    // The only allowed ROI proof is the real price math.
    expect(paywall).toMatch(/1\.5% of a single \$5,000 job/);
    expect(paywall).toContain("Unlock Silent Quote Command — $79/month");
    expect(paywall).toContain("Not now");
    expect(paywall).toMatch(/Lock in early access\. Cancel anytime\./);
    expect(paywall).toMatch(/Not another\s+CRM\./);
  });

  it("shows a loading state and shows checkout errors inline", () => {
    expect(paywall).toContain("loading={pending}");
    expect(paywall).toContain('role="alert"');
  });

  it("does not redirect to '#' on error", () => {
    expect(paywall).not.toMatch(/href\s*=\s*['"]#['"]/);
    expect(paywall).not.toMatch(/window\.location\.href\s*=\s*['"]#['"]/);
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
// LAUNCH-BLOCKER FIX #1 — billing column lockdown (Migration 011)
// ---------------------------------------------------------------------------

describe("Migration 011 — billing column lockdown trigger", () => {
  const migrationSrc = readSource(
    "../../supabase/migrations/011_billing_column_lockdown.sql",
  );

  it("creates a BEFORE UPDATE trigger on public.profiles", () => {
    expect(migrationSrc).toMatch(
      /create trigger trg_guard_billing_columns[\s\S]*?before update on public\.profiles/,
    );
  });

  it("guards EVERY billing/usage column an attacker could try to flip", () => {
    expect(migrationSrc).toMatch(/is_paid is distinct from old\.is_paid/);
    expect(migrationSrc).toMatch(/usage_count is distinct from old\.usage_count/);
    expect(migrationSrc).toMatch(/jobs_won is distinct from old\.jobs_won/);
    expect(migrationSrc).toMatch(
      /recovered_amount is distinct from old\.recovered_amount/,
    );
  });

  it("raises permission_denied (42501) for authenticated/anon callers", () => {
    expect(migrationSrc).toMatch(/permission denied: billing and usage columns/);
    expect(migrationSrc).toMatch(/errcode\s*=\s*'42501'/);
  });

  it("allows service_role and the RPC owner to mutate billing columns", () => {
    // The bypass is "current_user NOT IN (authenticated, anon)" — anything
    // else (service_role, postgres, supabase_admin, the RPC owner) is trusted.
    expect(migrationSrc).toMatch(
      /current_user not in \('authenticated', 'anon'\)/,
    );
  });

  it("revokes EXECUTE on the guard function from public", () => {
    expect(migrationSrc).toMatch(
      /revoke execute on function public\.guard_billing_columns_on_profiles\(\) from public/,
    );
  });

  it("is idempotent (safe to re-run)", () => {
    expect(migrationSrc).toMatch(/create or replace function/);
    expect(migrationSrc).toMatch(
      /drop trigger if exists trg_guard_billing_columns/,
    );
  });

  it("touches NO existing tables or policies (additive only)", () => {
    // No ALTER, no DROP TABLE, no CREATE/DROP POLICY.
    expect(migrationSrc).not.toMatch(/^alter table/im);
    expect(migrationSrc).not.toMatch(/^drop table/im);
    expect(migrationSrc).not.toMatch(/create policy/i);
    expect(migrationSrc).not.toMatch(/drop policy/i);
  });
});

// ---------------------------------------------------------------------------
// LAUNCH-BLOCKER FIX #2 — webhook out-of-order protection
// ---------------------------------------------------------------------------

describe("/api/webhooks/lemonsqueezy — out-of-order event protection", () => {
  it("reads the existing subscription row's updated_at before upserting", () => {
    expect(webhookRoute).toMatch(
      /from\("subscriptions"\)[\s\S]*?\.select\("updated_at"\)[\s\S]*?\.eq\("user_id", userId\)/,
    );
  });

  it("compares incoming attrs.updated_at against the stored updated_at", () => {
    expect(webhookRoute).toContain("incomingUpdatedAtIso");
    expect(webhookRoute).toMatch(/attrs\.updated_at\s*\?\?\s*null/);
    expect(webhookRoute).toMatch(/Date\.parse\(incomingUpdatedAtIso\)/);
    expect(webhookRoute).toMatch(/Date\.parse\(existingUpdatedAtIso\)/);
  });

  it("drops stale events with 200 (no DB mutation) so Lemon stops retrying", () => {
    // A stale or duplicate-timestamp event must short-circuit BEFORE the
    // upsert + profile update.
    expect(webhookRoute).toMatch(
      /incomingMs\s*<=\s*existingMs[\s\S]*?return new NextResponse\("ok", \{ status: 200 \}\)/,
    );
  });

  it("new users (no existing row) still go through — first event creates the row", () => {
    // If there's no existing row, the comparison branch is skipped and the
    // upsert path runs normally.
    expect(webhookRoute).toMatch(
      /if \(existingUpdatedAtIso\)\s*\{[\s\S]*?const incomingMs/,
    );
  });

  it("never logs the OAuth code, raw secret, or full request URL on the stale path", () => {
    // The stale-event branch is silent — no console.log/error with payload data.
    // (The existing 'no secret logging' contract from the previous suite still
    // holds; just pin it for the new branch.)
    expect(webhookRoute).not.toMatch(/console\.\w+\([^)]*incomingUpdatedAtIso/);
    expect(webhookRoute).not.toMatch(/console\.\w+\([^)]*existingUpdatedAtIso/);
  });
});

// ---------------------------------------------------------------------------
// Webhook event-name handling — explicit allow + safe-ignore
// ---------------------------------------------------------------------------

describe("webhook event handling — lifecycle-only entitlement, invoice events ignored", () => {
  it("defines the exact 7 subscription lifecycle events that drive entitlement", () => {
    for (const ev of [
      "subscription_created",
      "subscription_updated",
      "subscription_cancelled",
      "subscription_expired",
      "subscription_resumed",
      "subscription_paused",
      "subscription_unpaused",
    ]) {
      expect(webhookRoute).toContain(`"${ev}"`);
    }
  });

  it("does NOT treat payment/invoice events as lifecycle (the activation bug)", () => {
    // subscription_payment_success / _failed / _refunded must not be in the
    // lifecycle set — their invoice status ("paid") would wrongly downgrade.
    const lifecycleBlock = webhookRoute.slice(
      webhookRoute.indexOf("SUBSCRIPTION_LIFECYCLE_EVENTS: ReadonlySet"),
      webhookRoute.indexOf("]);"),
    );
    expect(lifecycleBlock).not.toContain("subscription_payment_success");
    expect(lifecycleBlock).not.toContain("subscription_payment_failed");
    expect(lifecycleBlock).not.toContain("subscription_payment_refunded");
  });

  it("ack-200s every non-lifecycle event (incl. payment_*) without DB writes", () => {
    expect(webhookRoute).toMatch(
      /if \(!SUBSCRIPTION_LIFECYCLE_EVENTS\.has\(eventName\)\)\s*\{[\s\S]*?return new NextResponse\("ok", \{ status: 200 \}\)/,
    );
  });

  it("only computes entitlement from a `subscriptions` data resource (defence in depth)", () => {
    expect(webhookRoute).toMatch(
      /dataType && dataType !== "subscriptions"[\s\S]*?return new NextResponse\("ok", \{ status: 200 \}\)/,
    );
  });

  it("invoice status 'paid' is never a paid entitlement (isPaidStatus allow-list)", () => {
    // Belt + suspenders at the lib layer: even if "paid" reached isPaidStatus,
    // it is NOT in the allow-list, so it cannot grant entitlement.
    expect(isPaidStatus("paid")).toBe(false);
    expect(isPaidStatus("active")).toBe(true);
    expect(isPaidStatus("on_trial")).toBe(true);
  });

  it("debug diagnostics are opt-in and never log payload/secret/PII", () => {
    expect(webhookRoute).toMatch(
      /LEMONSQUEEZY_WEBHOOK_DEBUG !== "true"/,
    );
    const debugCalls = webhookRoute.match(/webhookDebugLog\(\{[\s\S]*?\}\)/g) ?? [];
    expect(debugCalls.length).toBeGreaterThan(0);
    for (const call of debugCalls) {
      expect(call).not.toMatch(/rawBody|signature|secret|payload\b/);
      expect(call).not.toMatch(/\bemail\b/);
      // Only a user_id PREFIX is allowed, never the full id field on its own.
      expect(call).not.toMatch(/userId\s*[,}]/);
    }
  });
});

// ---------------------------------------------------------------------------
// Canonical domain — checkout / webhook URLs in docs use www, never vercel.app
// ---------------------------------------------------------------------------

describe("billing URLs use the canonical www origin", () => {
  it("no production code references vercel.app", () => {
    expect(checkoutRoute).not.toMatch(/vercel\.app/i);
    expect(webhookRoute).not.toMatch(/vercel\.app/i);
    expect(lsLib).not.toMatch(/vercel\.app/i);
    expect(actions).not.toMatch(/vercel\.app/i);
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
