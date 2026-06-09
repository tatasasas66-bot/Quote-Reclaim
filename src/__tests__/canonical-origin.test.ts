/**
 * Canonical production origin guard.
 *
 * Decision: https://www.quotereclaim.com is the ONE canonical production
 * origin. apex (quotereclaim.com) 301s to www; quote-reclaim.vercel.app 308s
 * to www. These tests lock the code-side contract so generated links
 * (One-Tap Reply, recovery-email quick-reply, inbound-reply notifications)
 * never emit a non-canonical web origin and production source never hardcodes
 * a vercel.app host.
 *
 * NOTE on email addresses: `hello@quotereclaim.com` / `mike@quotereclaim.com`
 * are sender/contact addresses, NOT web origins. Email addresses never carry
 * `www`, so those are intentionally NOT rewritten and are excluded below.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(process.cwd(), "src");

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectSources(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const productionSources = collectSources(SRC_ROOT).map((path) => ({
  path,
  content: readFileSync(path, "utf8"),
}));

function read(rel: string): string {
  return readFileSync(join(SRC_ROOT, rel), "utf8");
}

// ---------------------------------------------------------------------------
// 7 + 8. No production source hardcodes a vercel.app host (links or otherwise)
// ---------------------------------------------------------------------------

describe("no vercel.app host in production code", () => {
  it("zero production source files reference vercel.app", () => {
    const offenders = productionSources
      .filter((s) => /vercel\.app/i.test(s.content))
      .map((s) => s.path);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5 + 6. URL builders default to the canonical www host, honor APP_BASE_URL
// ---------------------------------------------------------------------------

describe("canonical www host in URL-builder fallbacks", () => {
  it("One-Tap appBaseUrl fallback is https://www.quotereclaim.com", () => {
    const src = read("lib/quotes/one-tap-reply.ts");
    expect(src).toMatch(/return\s+"https:\/\/www\.quotereclaim\.com";/);
    // The non-canonical apex fallback is gone.
    expect(src).not.toMatch(/return\s+"https:\/\/quotereclaim\.com";/);
  });

  it("email-inbound notification appBaseUrl fallback is https://www.quotereclaim.com", () => {
    const src = read("app/api/webhooks/email-inbound/route.ts");
    expect(src).toMatch(/return\s+"https:\/\/www\.quotereclaim\.com";/);
    expect(src).not.toMatch(/return\s+"https:\/\/quotereclaim\.com";/);
  });

  it("both builders prefer APP_BASE_URL when set (env wins over the fallback)", () => {
    for (const rel of [
      "lib/quotes/one-tap-reply.ts",
      "app/api/webhooks/email-inbound/route.ts",
    ]) {
      const src = read(rel);
      expect(src).toMatch(/process\.env\.APP_BASE_URL\?\.trim\(\)/);
      expect(src).toMatch(/if \(explicit\) return explicit\.replace/);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Billing carries no app-origin URL — provider-agnostic, no Lemon refs
// ---------------------------------------------------------------------------

describe("billing modules carry no app-origin URLs and no MoR name", () => {
  const entitlement = read("lib/payments/entitlement.ts");
  const disabled = read("lib/payments/disabled-provider.ts");
  const providerSrc = read("lib/payments/provider.ts");
  const types = read("lib/payments/types.ts");

  it("provider-agnostic billing modules carry no app-origin URL", () => {
    for (const src of [entitlement, disabled, providerSrc, types]) {
      expect(src).not.toMatch(/vercel\.app/i);
      expect(src).not.toMatch(/quotereclaim\.com\/(?!terms|privacy)/);
    }
  });

  it("no billing module names any specific MoR (provider-agnostic)", () => {
    for (const src of [entitlement, disabled, providerSrc, types]) {
      expect(src.toLowerCase()).not.toMatch(/lemon|stripe|paddle/);
    }
  });

  it("pricing stays $79 (FREE_PLAN_LIMIT + price constants untouched)", () => {
    expect(entitlement).toContain("MONTHLY_PRICE_USD = 79");
    expect(entitlement).toContain("FREE_PLAN_LIMIT = 3");
  });
});

// ---------------------------------------------------------------------------
// Magic Link path contract — confirm route still handles /auth/confirm
// ---------------------------------------------------------------------------

describe("Magic Link + OAuth route paths", () => {
  it("/auth/confirm verifies token_hash (Magic Link token_hash template path)", () => {
    const confirm = read("app/auth/confirm/route.ts");
    expect(confirm).toContain("verifyOtp");
    expect(confirm).toContain("token_hash");
    expect(confirm).not.toMatch(/vercel\.app/i);
  });

  it("/api/auth/callback handles the OAuth/PKCE code path", () => {
    const callback = read("app/api/auth/callback/route.ts");
    expect(callback).toContain("exchangeCodeForSession");
    expect(callback).not.toMatch(/vercel\.app/i);
  });

  it("AuthForm anchors redirectTo on the current browsing origin (no env required)", () => {
    const form = read("components/onboarding/AuthForm.tsx");
    expect(form).toContain("window.location.origin");
    // Env is only honored when its origin matches the current origin.
    expect(form).toMatch(/configuredOrigin === currentOrigin/);
  });
});
