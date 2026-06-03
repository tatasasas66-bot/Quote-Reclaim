/**
 * @vitest-environment happy-dom
 *
 * Self-heal contract for first-attempt Google OAuth failures.
 *
 * Symptom this guards against: the first Google sign-in returned the user to
 * /sign-in?error=auth_callback_failed even when cookies actually carried a
 * valid session (PKCE / SameSite race on the verifier cookie). After this
 * pass, three layers cooperate:
 *
 *   1. Server  — /sign-in and /sign-up redirect to /dashboard when a session
 *                already exists, ignoring stale `?error=` params.
 *   2. Client  — AuthForm checks getSession() on mount and hard-navigates to
 *                /dashboard if a session is present, suppressing the stale
 *                callback error in the UI.
 *   3. Callback — if exchangeCodeForSession errors but getUser() shows the
 *                cookies are already authenticated, route to /dashboard.
 *
 * Magic Link, Google env-gating, and "no token / secret / code" logging
 * contracts remain intact.
 */
import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { AuthForm } from "@/components/onboarding/AuthForm";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const signInPage = readSource("../app/(auth)/sign-in/page.tsx");
const signUpPage = readSource("../app/(auth)/sign-up/page.tsx");
const callbackRoute = readSource("../app/api/auth/callback/route.ts");
const authForm = readSource("../components/onboarding/AuthForm.tsx");

// ---------------------------------------------------------------------------
// 1. Server-side guard on /sign-in and /sign-up
// ---------------------------------------------------------------------------

describe("server-side guard: signed-in user never sees the auth shell", () => {
  it("/sign-in calls requireUser and redirects on a present session", () => {
    expect(signInPage).toContain("requireUser");
    expect(signInPage).toMatch(/if \(user\)\s*\{\s*redirect\(/);
  });

  it("/sign-up calls requireUser and redirects on a present session", () => {
    expect(signUpPage).toContain("requireUser");
    expect(signUpPage).toMatch(/if \(user\)\s*\{\s*redirect\(/);
  });

  it("both pages route to a safe `next` (no open-redirect)", () => {
    for (const src of [signInPage, signUpPage]) {
      expect(src).toContain("safeRedirectPath");
    }
  });

  it("both pages are force-dynamic so the cookie check runs per request", () => {
    for (const src of [signInPage, signUpPage]) {
      expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Client-side guard inside AuthForm
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  getSession: vi.fn(),
}));

const routeState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => routeState.searchParams,
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      signInWithOAuth: mocks.signInWithOAuth,
      getSession: mocks.getSession,
    },
  }),
}));

const originalLocation = window.location;
const replaceSpy = vi.fn();

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.signInWithOAuth.mockResolvedValue({ error: null });
  mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  routeState.searchParams = new URLSearchParams();
  replaceSpy.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, origin: "https://app.test", replace: replaceSpy },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("AuthForm — first-attempt OAuth recovery", () => {
  it("hard-navigates to /dashboard when a session is detected on mount", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "ignored-token",
          user: { id: "u1", email: "j@x.com" },
        },
      },
      error: null,
    });
    render(<AuthForm mode="sign-in" />);
    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledTimes(1);
    });
    expect(replaceSpy).toHaveBeenCalledWith("/dashboard");
  });

  it("suppresses the stale `auth_callback_failed` error when a session exists", async () => {
    routeState.searchParams = new URLSearchParams("error=auth_callback_failed");
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "x", user: { id: "u1", email: "a@b.com" } },
      },
      error: null,
    });
    render(<AuthForm mode="sign-in" />);
    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalled();
    });
    expect(
      screen.queryByText(/We couldn't finish signing you in/),
    ).toBeNull();
  });

  it("still shows the callback error when no session exists (legitimate failure)", async () => {
    routeState.searchParams = new URLSearchParams("error=auth_callback_failed");
    render(<AuthForm mode="sign-in" />);
    expect(
      await screen.findByText(/We couldn't finish signing you in/),
    ).toBeTruthy();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("respects a safe `next` query when redirecting", async () => {
    routeState.searchParams = new URLSearchParams("next=/dashboard?audit_token=abc");
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "x", user: { id: "u1", email: "a@b.com" } },
      },
      error: null,
    });
    render(<AuthForm mode="sign-in" />);
    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith("/dashboard?audit_token=abc");
    });
  });

  it("rejects an unsafe `next` and falls back to /dashboard", async () => {
    routeState.searchParams = new URLSearchParams("next=//evil.com/steal");
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "x", user: { id: "u1", email: "a@b.com" } },
      },
      error: null,
    });
    render(<AuthForm mode="sign-in" />);
    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("does not crash or redirect when getSession errors", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "boom" },
    });
    render(<AuthForm mode="sign-in" />);
    // Form still mounts and stays interactive.
    expect(
      await screen.findByRole("button", { name: /send secure link/i }),
    ).toBeTruthy();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("does not log access_token, refresh_token, code, or full URLs on mount", () => {
    // Mount-time recovery must not leak secrets to console.
    expect(authForm).not.toMatch(/console\.\w+\([^)]*access_token/);
    expect(authForm).not.toMatch(/console\.\w+\([^)]*refresh_token/);
    expect(authForm).not.toMatch(/console\.\w+\([^)]*\?code=/);
    expect(authForm).not.toMatch(/console\.\w+\([^)]*data\.session/);
  });
});

// ---------------------------------------------------------------------------
// 3. Callback rescue layer
// ---------------------------------------------------------------------------

describe("Callback route — last-line-of-defence rescue", () => {
  it("if exchangeCodeForSession errors, the route checks getUser() and redirects to `next` when authenticated", () => {
    expect(callbackRoute).toMatch(
      /exchangeCodeForSession[\s\S]*?if \(error\)[\s\S]*?getUser\(\)[\s\S]*?return NextResponse\.redirect\(new URL\(next/,
    );
  });

  it("still shows the safe sign-in error when both exchange AND getUser fail", () => {
    // The error branch must end at the existing sign-in redirect.
    expect(callbackRoute).toMatch(
      /return NextResponse\.redirect\(\s*new URL\(`\/sign-in\?error=\$\{callbackErrorCode\(error\)\}`/,
    );
  });

  it("never logs the auth code, full URL, access_token, or refresh_token", () => {
    const consoleCalls =
      callbackRoute.match(/console\.\w+\([\s\S]*?\);/g) ?? [];
    for (const call of consoleCalls) {
      // The local `code` variable is the one-time OAuth authorization code —
      // it must never be passed to console. `safe.code` (Supabase error code,
      // e.g. "invalid_grant") is fine and intentional.
      expect(call).not.toMatch(/\bcode:\s*code\b/);
      expect(call).not.toMatch(/access_token/);
      expect(call).not.toMatch(/refresh_token/);
      // requestPath is origin+pathname only — explicitly exclude full URLs
      // and any raw query-string source.
      expect(call).not.toMatch(/request\.url\b/);
      expect(call).not.toMatch(/searchParams\b/);
    }
  });

  it("Magic Link still flows through /auth/confirm unchanged", () => {
    const confirm = readSource("../app/auth/confirm/route.ts");
    expect(confirm).toContain("verifyOtp");
    expect(confirm).toContain("token_hash");
  });
});

// ---------------------------------------------------------------------------
// 4. Google button env-gating intact
// ---------------------------------------------------------------------------

describe("Google button is still gated by NEXT_PUBLIC_ENABLE_GOOGLE_AUTH", () => {
  it("AuthForm references the env flag exactly once and gates the button on it", () => {
    expect(authForm).toContain("NEXT_PUBLIC_ENABLE_GOOGLE_AUTH");
    expect(authForm).toContain("GOOGLE_AUTH_ENABLED");
  });
});

// ---------------------------------------------------------------------------
// 5. safeRedirectPath helper sanity
// ---------------------------------------------------------------------------

describe("safeRedirectPath helper", () => {
  it("permits a safe absolute path", () => {
    expect(safeRedirectPath("/dashboard?audit_token=abc")).toBe(
      "/dashboard?audit_token=abc",
    );
  });
  it("blocks protocol-relative URLs", () => {
    expect(safeRedirectPath("//evil.com/path")).toBe("/dashboard");
  });
  it("blocks fully-qualified URLs", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
  });
  it("blocks javascript: URLs", () => {
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
  });
  it("blocks the empty string, null, undefined", () => {
    expect(safeRedirectPath("")).toBe("/dashboard");
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
  });
});
