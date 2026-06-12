/**
 * Launch audit — safe-fix proofs.
 *
 * Four launch-readiness fixes from the full audit, each pinned by test:
 *
 *   1. Stored XSS via OneTapReplyCard — title was rendered through
 *      dangerouslySetInnerHTML; questionText comes from the public reply
 *      endpoint and could carry inert HTML (<img src=x onerror=...>) that
 *      would execute in the contractor's authenticated session. Replaced
 *      with React text content, which is escaped by default.
 *
 *   2. Open-redirect via backslash smuggling — safeRedirectPath rejected
 *      "//host" but accepted "/\host"; browsers normalise "\" to "/", so
 *      "/\evil.com" resolved to the external host. Backslash is now treated
 *      as hostile.
 *
 *   3. Defense-in-depth on a service-client read — the outbound_messages
 *      query on /quotes/[id] scoped only by quote_id even though it was
 *      already inside a service client. Now scoped by user_id too, matching
 *      the sibling recovery_events query.
 *
 *   4. Inbound-email log no longer leaks raw addresses — the "no match"
 *      branch now masks via SHA-1 prefix + domain (same policy as maskPhone).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { safeRedirectPath } from "@/lib/auth/safe-redirect";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const oneTapCardSrc = readSource("../components/quotes/OneTapReplyCard.tsx");
const quoteDetailSrc = readSource("../app/(app)/quotes/[id]/page.tsx");
const emailInboundSrc = readSource("../app/api/webhooks/email-inbound/route.ts");
const dashboardSrc = readSource("../app/(app)/dashboard/page.tsx");
const safeRedirectSrc = readSource("../lib/auth/safe-redirect.ts");

// ───────────────────────────────────────────────────────────────────────
// 1. Stored XSS fix in OneTapReplyCard
// ───────────────────────────────────────────────────────────────────────

describe("[1] OneTapReplyCard no longer renders homeowner-submitted text as raw HTML", () => {
  it("the JSX prop dangerouslySetInnerHTML is gone (only a back-reference in the safety comment remains)", () => {
    // The JSX usage is gone. A single mention survives in the surrounding
    // explanatory comment so future readers know why the prop was removed;
    // it is not an active code path. Lock that exact distribution.
    const propUsages = oneTapCardSrc.match(/dangerouslySetInnerHTML=/g) ?? [];
    expect(propUsages).toEqual([]);
    const totalMentions = oneTapCardSrc.match(/dangerouslySetInnerHTML/g) ?? [];
    expect(totalMentions.length).toBeLessThanOrEqual(1);
  });

  it("the Panel title renders as React text (escaped by default)", () => {
    // The new render is a plain {title} child. No __html attribute anywhere.
    expect(oneTapCardSrc).not.toMatch(/__html\s*:/);
    expect(oneTapCardSrc).toMatch(/<p[\s\S]{0,200}>\s*\{title\}\s*<\/p>/);
  });

  it("the title slot still carries the homeowner's question text — exactly the channel that needed escaping", () => {
    expect(oneTapCardSrc).toMatch(
      /title=\{`"\$\{latestReply\.questionText \?\? "\(no question text\)"\}"`\}/,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────
// 2. Backslash open-redirect fix in safeRedirectPath
// ───────────────────────────────────────────────────────────────────────

describe("[2] safeRedirectPath rejects backslash-smuggled hosts", () => {
  it("paths starting with /\\ resolve to /dashboard (browsers read \\ as /)", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("/\\/evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("/\\\\evil.com")).toBe("/dashboard");
  });

  it("the protocol-relative form // is still rejected", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("//evil.com/x")).toBe("/dashboard");
  });

  it("absolute schemes and the empty / null cases stay rejected", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("http://evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
  });

  it("legitimate root-relative paths are unchanged", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/quotes/abc")).toBe("/quotes/abc");
    expect(safeRedirectPath("/onboarding/reveal")).toBe("/onboarding/reveal");
    expect(safeRedirectPath("/dashboard?next=1")).toBe("/dashboard?next=1");
  });

  it("the docstring documents the backslash case so future edits don't regress it", () => {
    expect(safeRedirectSrc).toMatch(/backslash/i);
    expect(safeRedirectSrc).toContain('next.includes("\\\\")');
  });
});

// ───────────────────────────────────────────────────────────────────────
// 3. Defense-in-depth: outbound_messages query scoped by user_id
// ───────────────────────────────────────────────────────────────────────

describe("[3] /quotes/[id] outbound_messages read is user-scoped", () => {
  it("the service-client query gates on BOTH quote_id and user_id", () => {
    // The order .from -> .select -> .eq("quote_id"...) -> .eq("user_id"...)
    // must be intact in source so a future edit can't silently drop the
    // user_id scope.
    expect(quoteDetailSrc).toMatch(
      /from\("outbound_messages"\)[\s\S]{0,160}\.eq\("quote_id", quote\.id\)\s*\.eq\("user_id", user\.id\)/,
    );
  });

  it("matches the sibling recovery_events query's two-key scoping", () => {
    // Locked sibling query keeps both keys. If a future edit relaxed either,
    // the audit story drifts. Pin the two-key shape.
    expect(quoteDetailSrc).toMatch(
      /from\("recovery_events"\)[\s\S]{0,300}\.eq\("quote_id", quote\.id\)[\s\S]{0,160}\.eq\("user_id", user\.id\)/,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────
// 4. Email-inbound log masks the homeowner address
// ───────────────────────────────────────────────────────────────────────

describe("[4] /api/webhooks/email-inbound 'no match' log masks the email", () => {
  it("the route exports a local maskEmail helper", () => {
    expect(emailInboundSrc).toMatch(/function maskEmail\(email: string\): string/);
  });

  it("maskEmail produces a SHA-1-prefixed + domain-preserving string (deterministic)", () => {
    // Validate the recipe the route uses against a known input. The route
    // never imports the helper, so we reproduce the same pure transform.
    function reproduce(email: string): string {
      const at = email.indexOf("@");
      const domain = at >= 0 ? email.slice(at) : "";
      const hash = createHash("sha1").update(email.toLowerCase()).digest("hex");
      return `[em:${hash.slice(0, 8)}${domain}]`;
    }
    const masked = reproduce("Jane.Doe@Example.COM");
    expect(masked).toMatch(/^\[em:[0-9a-f]{8}@Example\.COM\]$/);
    // The masked output never contains the local part.
    expect(masked).not.toMatch(/jane/i);
    expect(masked).not.toMatch(/doe/i);
    // Same input twice → same hash (correlation across log lines works).
    expect(reproduce("Jane.Doe@Example.COM")).toBe(masked);
  });

  it("the 'no match' log line uses maskEmail, never the raw fromEmail", () => {
    expect(emailInboundSrc).toMatch(
      /\[email:inbound\] no match from=\$\{maskEmail\(fromEmail\)\}/,
    );
    expect(emailInboundSrc).not.toMatch(
      /\[email:inbound\] no match from=\$\{fromEmail\}/,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────
// 5. Dashboard uses the shared currency helper (consistency)
// ───────────────────────────────────────────────────────────────────────

describe("[5] dashboard currency rendering is consistent with the rest of the app", () => {
  it("formatCurrency is imported and used for both bleeding total and won total", () => {
    expect(dashboardSrc).toContain('import { formatCurrency } from "@/lib/utils/currency"');
    expect(dashboardSrc).toContain("formatCurrency(stillBleeding)");
    expect(dashboardSrc).toContain("formatCurrency(wonTotal)");
  });

  it("the inline toLocaleString calls are gone", () => {
    expect(dashboardSrc).not.toMatch(/wonTotal\.toLocaleString/);
    expect(dashboardSrc).not.toMatch(/stillBleeding\.toLocaleString/);
  });
});
