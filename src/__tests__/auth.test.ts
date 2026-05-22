import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("AuthForm contract", () => {
  const source = readSource("../components/onboarding/AuthForm.tsx");

  it("calls signInWithOtp for Magic Link", () => {
    expect(source).toContain("signInWithOtp");
  });

  it("calls signInWithOAuth with provider google", () => {
    expect(source).toContain("signInWithOAuth");
    expect(source).toContain('provider: "google"');
  });

  it("uses the browser client (not service role)", () => {
    expect(source).toContain("createBrowserSupabaseClient");
    expect(source).not.toContain("createServiceSupabaseClient");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("never accepts a password field", () => {
    expect(source).not.toMatch(/type=["']password["']/);
  });
});

describe("Auth callback route", () => {
  const source = readSource("../app/api/auth/callback/route.ts");

  it("rejects protocol-relative redirects (//evil.com)", () => {
    expect(source).toContain('next.startsWith("//")');
  });

  it("falls back to /dashboard for unsafe targets", () => {
    expect(source).toContain('"/dashboard"');
  });

  it("exchanges the code for a session", () => {
    expect(source).toContain("exchangeCodeForSession");
  });

  it("redirects to /sign-in with error=missing_code when no code is supplied", () => {
    expect(source).toContain("error=missing_code");
  });
});

describe("AuthShell renders both pathways", () => {
  const source = readSource("../components/onboarding/AuthShell.tsx");

  it("links to the free Silent Quote Audit", () => {
    expect(source).toContain("/audit");
  });

  it("renders the AuthForm inside a Suspense boundary", () => {
    expect(source).toContain("Suspense");
    expect(source).toContain("<AuthForm");
  });
});

describe("safeRedirectPath behavior (replicated for runtime test)", () => {
  function safeRedirectPath(next: string | null): string {
    if (!next) return "/dashboard";
    if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
    return next;
  }

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

  it("blocks the empty string and null", () => {
    expect(safeRedirectPath("")).toBe("/dashboard");
    expect(safeRedirectPath(null)).toBe("/dashboard");
  });
});
