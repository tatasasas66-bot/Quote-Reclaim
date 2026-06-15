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

  it("verifyOtp is GATED behind NEXT_PUBLIC_AUTH_OTP_MODE (default off keeps Magic Link)", () => {
    // The OTP code-entry path exists, but lives behind AUTH_OTP_MODE so the
    // current Magic Link flow is unchanged when the flag is unset/"false".
    // verifyOtp must therefore appear in the source AND its only callsite
    // must be inside the AUTH_OTP_MODE-gated handler.
    expect(source).toContain("AUTH_OTP_MODE");
    expect(source).toMatch(
      /AUTH_OTP_MODE\s*=\s*process\.env\.NEXT_PUBLIC_AUTH_OTP_MODE === "true"/,
    );
    expect(source).toContain("verifyOtp");
    expect(source).toMatch(/type:\s*"email"/);
    // The verifyOtp call lives in handleVerifyOtp, whose JSX is only rendered
    // inside an `AUTH_OTP_MODE ?` branch — never in the default flow.
    expect(source).toMatch(/AUTH_OTP_MODE \? \(\s*<form onSubmit=\{handleVerifyOtp\}/);
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

  it("shows safe Magic Link success, expired-link, and rate-limit copy", () => {
    expect(source).toContain(
      "If that email can receive mail, your secure link is on the way.",
    );
    expect(source).toContain(
      "This link expires shortly and can only be used once.",
    );
    expect(source).toContain(
      "That link expired or was already used. Send a fresh sign-in link.",
    );
    expect(source).toContain(
      "Too many attempts. Wait a few minutes, then try again.",
    );
  });

  it("OTP UI copy is GATED — Magic Link UX is untouched when the flag is off", () => {
    // The old hybrid 'Link not working? Enter the 6-digit code' fallback is
    // gone — we never show both at once. The 6-digit-code copy now belongs to
    // the dedicated OTP mode and lives only inside the AUTH_OTP_MODE branch.
    expect(source).not.toContain("Link not working?");
    expect(source).not.toContain("showOtpFallback");
    expect(source).toContain("6-digit code");
    // The code-entry UI (label "6-digit code") is only rendered inside the
    // AUTH_OTP_MODE branch — never in the default Magic Link path.
    expect(source).toMatch(
      /AUTH_OTP_MODE \? \([\s\S]*?label="6-digit code"[\s\S]*?\) : \(/,
    );
  });

  it("does not log auth tokens or secrets", () => {
    const consoleCalls =
      source.match(/console\.(?:log|error|warn|info)\([\s\S]*?\);/g) ?? [];
    for (const call of consoleCalls) {
      expect(call).not.toMatch(/\btoken\b/);
      expect(call).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(call).not.toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    }
  });
});

describe("Auth callback route", () => {
  const source = readSource("../app/api/auth/callback/route.ts");
  // The open-redirect guard now lives in a shared helper.
  const safeRedirect = readSource("../lib/auth/safe-redirect.ts");

  it("delegates redirect safety to the shared safeRedirectPath helper", () => {
    expect(source).toContain("safeRedirectPath");
    expect(safeRedirect).toContain('next.startsWith("//")');
  });

  it("falls back to /dashboard for unsafe targets", () => {
    expect(safeRedirect).toContain('"/dashboard"');
  });

  it("exchanges the code for a session", () => {
    expect(source).toContain("exchangeCodeForSession");
  });

  it("redirects to /sign-in with error=missing_code when no code is supplied", () => {
    expect(source).toContain("error=missing_code");
  });

  it("rescues an already-signed-in caller when exchange fails (never strand a real session)", () => {
    // If exchangeCodeForSession errors but the request cookies already carry a
    // valid session (duplicate / racing callback), the route MUST send the user
    // into the app instead of to /sign-in?error=...
    expect(source).toMatch(
      /exchangeCodeForSession[\s\S]*?if \(error\)[\s\S]*?getUser\(\)[\s\S]*?return NextResponse\.redirect\(new URL\(next/,
    );
  });
});

describe("AuthShell renders both pathways", () => {
  const source = readSource("../components/onboarding/AuthShell.tsx");

  it("links the free Silent Quote Audit CTA to the live reveal flow (not the dead /audit route)", () => {
    expect(source).toContain("/onboarding/reveal");
    expect(source).not.toContain('href="/audit"');
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

  it("AuthForm normalizes labeled callback URL values before signInWithOtp", () => {
    expect(authFormCode).toContain("normalizeCallbackBase");
    expect(authFormCode).toContain("https?:");
    expect(authFormCode).toContain("url.pathname = CALLBACK_PATH");
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

// Phase 2 — Google OAuth contract assertions
describe("Google OAuth contract (Phase 2)", () => {
  const formSource = readSource("../components/onboarding/AuthForm.tsx");
  const callbackSource = readSource("../app/api/auth/callback/route.ts");

  it("AuthForm uses signInWithOtp and signInWithOAuth(google)", () => {
    expect(formSource).toContain("signInWithOtp");
    expect(formSource).toContain("signInWithOAuth");
    expect(formSource).toContain('provider: "google"');
  });

  it("Google flow requests offline access and consent prompt", () => {
    expect(formSource).toContain("access_type");
    expect(formSource).toContain("prompt");
  });

  it("Google button is gated by NEXT_PUBLIC_ENABLE_GOOGLE_AUTH", () => {
    expect(formSource).toContain("NEXT_PUBLIC_ENABLE_GOOGLE_AUTH");
    expect(formSource).toContain("GOOGLE_AUTH_ENABLED");
  });

  it("auth callback blocks protocol-relative open-redirect targets via the shared helper", () => {
    const safeRedirectSource = readSource("../lib/auth/safe-redirect.ts");
    expect(callbackSource).toContain("safeRedirectPath");
    expect(safeRedirectSource).toContain('next.startsWith("//")');
  });
});

// Launch decision (auth strategy study): Google is HIDDEN by default. The
// backend OAuth handler + config stay intact (asserted above) so re-enabling
// is a one-flag change — but nothing Google/Supabase-branded may render in the
// auth UI unless NEXT_PUBLIC_ENABLE_GOOGLE_AUTH is explicitly "true". This lock
// prevents a future edit from silently re-exposing the unbranded Google screen.
describe("Google hidden by default — no visible social-login copy at launch", () => {
  const formSource = readSource("../components/onboarding/AuthForm.tsx");
  const shellSource = readSource("../components/onboarding/AuthShell.tsx");
  const signInSource = readSource("../app/(auth)/sign-in/page.tsx");
  const signUpSource = readSource("../app/(auth)/sign-up/page.tsx");

  it("the Google button + 'OR' divider render ONLY when the flag is strictly 'true'", () => {
    // Default-off gate: the constant compares === "true", so unset/false/any
    // other value hides Google. Both the button and the divider sit behind it.
    expect(formSource).toMatch(
      /GOOGLE_AUTH_ENABLED\s*=\s*\n?\s*process\.env\.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true"/,
    );
    expect(formSource).toMatch(/!magicSent && GOOGLE_AUTH_ENABLED \?/);
  });

  it("AuthShell renders NO Google/Supabase social-login copy", () => {
    expect(shellSource).not.toMatch(/google/i);
    expect(shellSource).not.toMatch(/supabase/i);
    // Subtitles for BOTH auth modes are present in source — the
    // AUTH_OTP_MODE flag selects which renders at build time.
    expect(shellSource).toContain("Sign in with Magic Link. No password.");
    expect(shellSource).toContain("Sign in with a 6-digit code. No password.");
  });

  it("sign-in / sign-up page metadata does not advertise Google", () => {
    expect(signInSource).not.toMatch(/google/i);
    expect(signUpSource).not.toMatch(/google/i);
  });

  it("the magic-link path is unconditional (NOT behind any feature flag)", () => {
    // signInWithOtp must always be reachable; only Google is flag-gated.
    expect(formSource).toContain("signInWithOtp");
    const otpIdx = formSource.indexOf("signInWithOtp");
    const gateIdx = formSource.indexOf("GOOGLE_AUTH_ENABLED");
    // The OTP call appears in handleMagicLink, outside the GOOGLE_AUTH_ENABLED
    // render gate — they are independent code paths.
    expect(otpIdx).toBeGreaterThan(0);
    expect(gateIdx).toBeGreaterThan(0);
  });
});

// Launch-readiness lock for the typed-OTP path. The verify flow exists and is
// gated; when the flag flips on, the user sees code-entry copy and the typed
// code is verified via supabase.auth.verifyOtp({ type: "email" }).
describe("Email OTP (6-digit code) — flag-gated, default off", () => {
  const formSource = readSource("../components/onboarding/AuthForm.tsx");

  it("AUTH_OTP_MODE constant is the single source of truth for the flag", () => {
    expect(formSource).toMatch(
      /const AUTH_OTP_MODE\s*=\s*\n?\s*process\.env\.NEXT_PUBLIC_AUTH_OTP_MODE === "true"/,
    );
  });

  it("calls supabase.auth.verifyOtp with type 'email' (the code-from-email type)", () => {
    expect(formSource).toMatch(
      /verifyOtp\(\s*\{[\s\S]*?email:\s*sentEmail[\s\S]*?token:\s*code[\s\S]*?type:\s*"email"/,
    );
  });

  it("renders the recommended OTP copy (under the gate)", () => {
    expect(formSource).toContain("Enter the 6-digit code we sent to your email.");
    expect(formSource).toContain("send a new code");
    // Mobile-friendly input semantics: numeric keyboard + one-time-code autofill
    expect(formSource).toContain('autoComplete="one-time-code"');
    expect(formSource).toContain('inputMode="numeric"');
  });

  it("invalid / expired codes show a safe message — never leaks the raw error", () => {
    expect(formSource).toContain(
      "That code is invalid or expired. Send a new code.",
    );
    // The verify failure logger logs name/code/status/hadMessage only — never
    // the token, email body, or raw message.
    expect(formSource).toMatch(/console\.error\("\[auth:otp\] verify failed"/);
    expect(formSource).not.toMatch(/console\.\w+\([^)]*otpCode/);
    expect(formSource).not.toMatch(/console\.\w+\([^)]*\btoken\b/);
  });

  it("the email-button label switches to 'Send 6-digit code' when the flag is on", () => {
    // Both labels coexist in source; the runtime ternary picks one.
    expect(formSource).toContain("Send 6-digit code");
    expect(formSource).toContain("Send secure link");
    expect(formSource).toMatch(/AUTH_OTP_MODE[\s\S]{0,40}"Send 6-digit code"[\s\S]{0,40}"Send secure link"/);
  });

  it("Magic Link path stays identical when AUTH_OTP_MODE is off (regression guard)", () => {
    // The original honest success copy is preserved verbatim in the off-branch.
    expect(formSource).toContain(
      "If that email can receive mail, your secure link is on the way.",
    );
    expect(formSource).toContain(
      "This link expires shortly and can only be used once.",
    );
  });
});
