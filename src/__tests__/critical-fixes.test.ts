import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  withPersistentSessionCookie,
} from "@/lib/supabase/cookie-options";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const dashboard = readSource("../app/(app)/dashboard/page.tsx");
const upgradeButton = readSource("../components/billing/UpgradeButton.tsx");
const serverClient = readSource("../lib/supabase/server.ts");
const middleware = readSource("../middleware.ts");
const signOutRoute = readSource("../app/api/auth/sign-out/route.ts");

// ---------------------------------------------------------------------------
// A1 — Sign out
// ---------------------------------------------------------------------------

describe("A1: Sign out button", () => {
  it("dashboard header posts to the sign-out route", () => {
    expect(dashboard).toContain('action="/api/auth/sign-out"');
    expect(dashboard).toContain("Sign out");
    expect(dashboard).toMatch(/method="post"/);
  });

  it("sign-out route signs out and redirects to /sign-in", () => {
    expect(signOutRoute).toContain("signOut");
    expect(signOutRoute).toMatch(/redirect[\s\S]*?\/sign-in/);
  });

  it("is styled as a quiet text link (small, muted text — quieter than ghost Button)", () => {
    // Mobile polish pass: Sign out is now an even quieter plain `<button>`
    // styled as a tiny text link, never a sized Button that competes with
    // Upgrade for visual weight.
    expect(dashboard).toMatch(
      /<button\s+type="submit"[\s\S]*?text-xs[\s\S]*?text-ink-muted[\s\S]*?>\s*Sign out/,
    );
    expect(dashboard).toContain("text-ink-muted");
  });
});

// ---------------------------------------------------------------------------
// A2 — Session persistence
// ---------------------------------------------------------------------------

describe("A2: session cookie persistence", () => {
  it("uses a persistent maxAge (well beyond a single session)", () => {
    // At least 30 days so the refresh token survives browser restarts.
    expect(SESSION_COOKIE_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(60 * 60 * 24 * 30);
  });

  it("attaches a persistent maxAge to a real session write that lacks one", () => {
    const out = withPersistentSessionCookie("sb-access-token-value", {});
    expect(out.maxAge).toBe(SESSION_COOKIE_MAX_AGE_SECONDS);
  });

  it("respects an explicit maxAge already chosen by Supabase", () => {
    const out = withPersistentSessionCookie("token", { maxAge: 1234 });
    expect(out.maxAge).toBe(1234);
  });

  it("does NOT force a maxAge on a deletion (empty value) so sign-out clears", () => {
    const out = withPersistentSessionCookie("", { path: "/" });
    expect(out.maxAge).toBeUndefined();
  });

  it("does NOT override an explicit maxAge<=0 deletion", () => {
    expect(withPersistentSessionCookie("", { maxAge: 0 }).maxAge).toBe(0);
    expect(withPersistentSessionCookie("x", { maxAge: -1 }).maxAge).toBe(-1);
  });

  it("server client uses getAll/setAll and the persistent-cookie helper", () => {
    expect(serverClient).toContain("getAll()");
    expect(serverClient).toContain("setAll(");
    expect(serverClient).toContain("withPersistentSessionCookie");
  });

  it("middleware refreshes the session and persists cookies", () => {
    expect(middleware).toContain("supabase.auth.getUser()");
    expect(middleware).toContain("withPersistentSessionCookie");
  });
});

// ---------------------------------------------------------------------------
// A3 — Upgrade button
// ---------------------------------------------------------------------------

describe("A3: Upgrade - $79/month button", () => {
  it("dashboard header renders the UpgradeButton", () => {
    expect(dashboard).toContain("UpgradeButton");
    expect(dashboard).toMatch(/<UpgradeButton[\s\S]*?\/>/);
  });

  it("button is labeled Upgrade - $79/month", () => {
    expect(upgradeButton).toContain("PAYWALL_PRICE_LABEL");
    expect(upgradeButton).toMatch(/Upgrade - \$\{PAYWALL_PRICE_LABEL\}|Upgrade \$79/);
  });

  it("does not build a server-side checkout URL — Paddle opens client-side", () => {
    // Checkout opens via Paddle.js overlay on the client; the button never
    // fetches a server checkout route. The Lemon/Stripe routes are gone.
    expect(upgradeButton).not.toMatch(/\/api\/(lemonsqueezy|stripe)/i);
    expect(upgradeButton).not.toMatch(/\/api\/.+checkout/i);
    expect(upgradeButton).not.toMatch(/fetch\(/);
  });

  it("surfaces a safe mailto fallback when Paddle is NOT wired (no dead fetch)", () => {
    expect(upgradeButton).toContain("SUPPORT_EMAIL");
    expect(upgradeButton).toContain("Billing is being updated");
    expect(upgradeButton).toMatch(/mailto:\$\{SUPPORT_EMAIL\}/);
    // Must not hard-redirect to '#'.
    expect(upgradeButton).not.toMatch(/href\s*=\s*['"]#['"]/);
  });

  it("pins the authenticated user id into the Paddle checkout custom_data — never trusts client input", () => {
    // The button forwards the server-resolved userId into PaddleCheckoutButton.
    // Server-side, the webhook re-validates against paddle_subscription_id.
    expect(upgradeButton).toMatch(/userId=\{userId\}/);
    expect(upgradeButton).not.toMatch(/user_id\s*:\s*['"]/);
  });
});
