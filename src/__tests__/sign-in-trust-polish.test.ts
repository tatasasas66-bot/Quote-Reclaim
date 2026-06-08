/**
 * Sign-in trust polish — audit-CTA fix + honest Magic Link copy.
 *
 * Pin the three guarantees this pass exists to defend:
 *   1. No primary CTA on the sign-in/up shell routes to /audit (404).
 *   2. The Magic Link success copy never CLAIMS the inbox received mail
 *      (we have no email-existence check and adding one would create
 *      account enumeration risk).
 *   3. The CTA's destination is preserved through auth via a safe
 *      `?next=` param so a prospect lands on the audit (reveal) right
 *      after sign-up.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(process.cwd(), "src");

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}
function read(rel: string): string {
  return readFileSync(join(SRC_ROOT, rel), "utf8");
}

const authShell = read("components/onboarding/AuthShell.tsx");
const authForm = read("components/onboarding/AuthForm.tsx");
const revealPage = read("app/(app)/onboarding/reveal/page.tsx");

// ───────────────────────────────────────────────────────────────────────
// 1. The /audit 404 is gone — CTA points at the live reveal flow
// ───────────────────────────────────────────────────────────────────────

describe("Audit CTA no longer routes to /audit (404)", () => {
  it("AuthShell CTA href is /onboarding/reveal, not /audit", () => {
    expect(authShell).toContain('href="/onboarding/reveal"');
    expect(authShell).not.toContain('href="/audit"');
  });

  it("the label + subcopy are preserved", () => {
    expect(authShell).toContain("Try the free Silent Quote Audit first");
    expect(authShell).toContain("No credit card. 3 quotes free. Cancel anytime.");
  });

  it("no production UI source file (outside docs/comments in the message engine) links to /audit", () => {
    const sources = collect(SRC_ROOT);
    const offenders: string[] = [];
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      // Hrefs / route paths only — ignore the harmless "audit page" comment
      // strings in fallback-messages.ts and generate-recovery-plan.ts that
      // reference an internal preview surface, not a routable URL.
      if (
        /href=["']\/audit["']|"\/audit"|'\/audit'/.test(text) &&
        !/\/audit\/token|\/audits\//.test(text)
      ) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 2. Magic Link success copy — anti-enumeration, never promises receipt
// ───────────────────────────────────────────────────────────────────────

describe("Magic Link success copy is honest (no email-existence claim)", () => {
  it("uses the conditional 'If that email can receive mail…' wording", () => {
    expect(authForm).toContain(
      "If that email can receive mail, your secure link is on the way.",
    );
  });

  it("the old absolute 'Secure link sent. Open it from your inbox…' is gone", () => {
    expect(authForm).not.toMatch(
      /Secure link sent\. Open it from your inbox to sign in\./,
    );
  });

  it("supporting truthful lines remain intact", () => {
    expect(authForm).toContain(
      "This link expires shortly and can only be used once.",
    );
    expect(authForm).toContain("Use a different email");
    expect(authForm).toMatch(/Sent to /);
  });

  it("the email_not_confirmed fallback also uses the honest wording", () => {
    // Same conditional copy lives in userFacingMagicLinkError for the
    // Supabase code that means "we accepted it but won't confirm".
    expect(authForm).toMatch(
      /email_not_confirmed[\s\S]{0,200}If that email can receive mail/,
    );
  });

  it("no source-side email-existence pre-check was added (zero enumeration surface)", () => {
    // Account-enumeration protection requires: server never tells the client
    // whether a given email is registered. We should not have added any new
    // pre-check that distinguishes "exists" from "doesn't exist".
    expect(authForm).not.toMatch(/account.exists|email.exists|user.exists/i);
    expect(authForm).not.toMatch(/checkEmail|existingUser|isRegisteredEmail/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 3. ?next= is honored end-to-end + safeRedirectPath validates it
// ───────────────────────────────────────────────────────────────────────

describe("AuthForm honors ?next= safely through the auth callback", () => {
  it("reads ?next= from searchParams and routes through safeRedirectPath", () => {
    expect(authForm).toMatch(/const explicitNext = searchParams\.get\("next"\)/);
    expect(authForm).toMatch(/safeRedirectPath\(explicitNext\)/);
  });

  it("never trusts ?next= without sanitization (no raw concat into callbackUrl)", () => {
    // The only path that puts an explicit-next into the callback URL is the
    // safeExplicitNext branch — never the raw `explicitNext`.
    expect(authForm).not.toMatch(/`\$\{base\}\$\{sep\}next=\$\{explicitNext\}/);
  });

  it("still defaults to /dashboard when no next is provided", () => {
    expect(authForm).toMatch(/safeExplicitNext\s*\?\?\s*"\/dashboard"/);
  });
});

describe("reveal page preserves the destination on the unauthenticated branch", () => {
  it("redirects unauthenticated callers to /sign-up?next=/onboarding/reveal", () => {
    expect(revealPage).toContain('redirect("/sign-up?next=/onboarding/reveal")');
    expect(revealPage).not.toMatch(/redirect\("\/sign-in"\)\s*;?\s*$/m);
  });
});
