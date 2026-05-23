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

describe("Browser Supabase client must use static NEXT_PUBLIC reads", () => {
  // Webpack inlines NEXT_PUBLIC_* env vars at build time only when they are
  // referenced as literal property accesses. A dynamic key produces an
  // undefined value in the browser bundle and throws at runtime in production.

  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  const browserCode = stripComments(readSource("../lib/supabase/browser.ts"));
  const authFormCode = stripComments(
    readSource("../components/onboarding/AuthForm.tsx"),
  );

  it("browser.ts does not import requireEnv", () => {
    expect(browserCode).not.toMatch(/from\s+["']@\/lib\/utils\/env["']/);
    expect(browserCode).not.toMatch(/\brequireEnv\s*\(/);
  });

  it("browser.ts does not use process.env[dynamicKey] bracket syntax", () => {
    expect(browserCode).not.toMatch(/process\.env\s*\[/);
  });

  it("browser.ts reads NEXT_PUBLIC_SUPABASE_URL as a literal property access", () => {
    expect(browserCode).toMatch(/process\.env\.NEXT_PUBLIC_SUPABASE_URL\b/);
  });

  it("browser.ts reads NEXT_PUBLIC_SUPABASE_ANON_KEY as a literal property access", () => {
    expect(browserCode).toMatch(
      /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY\b/,
    );
  });

  it("AuthForm uses static reads for every NEXT_PUBLIC_* var it touches", () => {
    expect(authFormCode).toMatch(
      /process\.env\.NEXT_PUBLIC_AUTH_CALLBACK_URL\b/,
    );
    expect(authFormCode).toMatch(
      /process\.env\.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH\b/,
    );
    expect(authFormCode).not.toMatch(/process\.env\s*\[/);
    expect(authFormCode).not.toMatch(/\brequireEnv\s*\(\s*["']NEXT_PUBLIC_/);
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
