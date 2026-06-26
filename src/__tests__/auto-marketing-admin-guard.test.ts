/**
 * Source-level tests for the auto-marketing admin guard, migration, and
 * attribution PII safety. These follow the repo's source-assertion pattern
 * (read the file, assert on string contents) used by paddle-webhook.test.ts
 * and one-tap-reply-integration.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const requireAdminSrc = readSource("../lib/auth/require-admin.ts");
const migration = readSource("../../supabase/migrations/013_auto_marketing.sql");
const attributionRoute = readSource(
  "../app/api/admin/auto-marketing/audit-attribution/route.ts",
);
const importRoute = readSource("../app/api/admin/auto-marketing/import/route.ts");
const exportRoute = readSource("../app/api/admin/auto-marketing/export-approved/route.ts");
const replyWebhookRoute = readSource("../app/api/admin/auto-marketing/reply-webhook/route.ts");
const adminPage = readSource("../app/admin/auto-marketing/page.tsx");

// ---------------------------------------------------------------------------
// Admin guard — env allowlist, fail closed
// ---------------------------------------------------------------------------

describe("admin guard — require-admin.ts", () => {
  it("uses an env allowlist (ADMIN_USER_IDS), not a DB role", () => {
    expect(requireAdminSrc).toMatch(/ADMIN_USER_IDS/);
    expect(requireAdminSrc).not.toMatch(/is_admin/);
  });
  it("fails closed when allowlist is empty", () => {
    expect(requireAdminSrc).toMatch(/allowlist\.size === 0/);
  });
  it("exposes forbiddenResponseIfNotAdmin for API routes", () => {
    expect(requireAdminSrc).toMatch(/export async function forbiddenResponseIfNotAdmin/);
  });
  it("returns 401 for no session, 403 for non-admin", () => {
    expect(requireAdminSrc).toMatch(/status: 401/);
    expect(requireAdminSrc).toMatch(/status: 403/);
  });
});

// ---------------------------------------------------------------------------
// Migration — additive, RLS, no edits to existing tables
// ---------------------------------------------------------------------------

describe("migration 013_auto_marketing — additive schema", () => {
  it("creates exactly the six required tables", () => {
    const tables = migration.match(/create table if not exists/g) ?? [];
    expect(tables).toHaveLength(6);
    expect(migration).toContain("public.auto_marketing_campaigns");
    expect(migration).toContain("public.auto_marketing_leads");
    expect(migration).toContain("public.auto_marketing_replies");
    expect(migration).toContain("public.auto_marketing_events");
    expect(migration).toContain("public.auto_marketing_suppression");
    expect(migration).toContain("public.audit_attribution_events");
  });
  it("enables RLS on every table", () => {
    const rls = migration.match(/enable row level security/g) ?? [];
    expect(rls.length).toBeGreaterThanOrEqual(6); // 6 tables
  });
  it("does not edit existing tables (no drop table / drop function)", () => {
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/drop function/i);
  });
  it("lead status CHECK enforces the closed set", () => {
    expect(migration).toMatch(
      /status text not null default 'rejected' check \(status in \('approved','review','rejected','suppressed'\)\)/,
    );
  });
  it("reply classification CHECK enforces the closed set", () => {
    for (const c of [
      "interested", "asks_price", "asks_how_it_works", "lead_gen_confusion",
      "existing_crm_objection", "not_interested", "unsubscribe", "angry",
      "wrong_person", "low_confidence",
    ]) {
      expect(migration).toContain(`'${c}'`);
    }
  });
  it("audit_attribution_events stores NO PII columns", () => {
    const tableBlock = migration.slice(
      migration.indexOf("public.audit_attribution_events"),
    );
    expect(tableBlock).not.toMatch(/homeowner_name|customer_name|client_email|client_phone|raw_ip|homeowner_email/);
    // visitor_hash is a hash, not raw IP — column name must be visitor_hash.
    expect(tableBlock).toMatch(/visitor_hash text/);
  });
});

// ---------------------------------------------------------------------------
// Admin route guard — every API route calls forbiddenResponseIfNotAdmin
// ---------------------------------------------------------------------------

describe("admin API routes are guarded", () => {
  it("import route guards with forbiddenResponseIfNotAdmin", () => {
    expect(importRoute).toMatch(/forbiddenResponseIfNotAdmin/);
    expect(importRoute).toMatch(/if \(guard\) return guard/);
  });
  it("export-approved route guards with forbiddenResponseIfNotAdmin", () => {
    expect(exportRoute).toMatch(/forbiddenResponseIfNotAdmin/);
  });
  it("reply-webhook route guards with shared secret OR admin session", () => {
    expect(replyWebhookRoute).toMatch(/REPLY_WEBHOOK_SECRET/);
    expect(replyWebhookRoute).toMatch(/forbiddenResponseIfNotAdmin/);
  });
  it("all admin API routes use nodejs runtime + force-dynamic", () => {
    for (const src of [importRoute, exportRoute, replyWebhookRoute]) {
      expect(src).toMatch(/export const runtime = "nodejs"/);
      expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    }
  });
});

// ---------------------------------------------------------------------------
// Admin page — redirects non-admins
// ---------------------------------------------------------------------------

describe("admin page guards + redirects", () => {
  it("calls requireAdmin and redirects on no_session / not_admin", () => {
    expect(adminPage).toMatch(/requireAdmin/);
    expect(adminPage).toMatch(/redirect\(safeRedirectPath/);
    expect(adminPage).toMatch(/\/sign-in\?next=\/admin\/auto-marketing/);
    expect(adminPage).toMatch(/\/dashboard/);
  });
});

// ---------------------------------------------------------------------------
// Attribution PII safety — the critical privacy rail
// ---------------------------------------------------------------------------

describe("audit-attribution route — PII safety", () => {
  it("whitelists only safe fields (no PII accepted)", () => {
    // The route must accept ONLY this closed set of fields.
    expect(attributionRoute).toMatch(/utm_source/);
    expect(attributionRoute).toMatch(/utm_campaign/);
    expect(attributionRoute).toMatch(/utm_trade/);
    expect(attributionRoute).toMatch(/utm_city/);
    expect(attributionRoute).toMatch(/visitor_hash/);
    expect(attributionRoute).toMatch(/total_quiet_value_bucket/);
    expect(attributionRoute).toMatch(/top_recovery_window/);
  });
  it("never accepts raw amounts (only bucketed)", () => {
    expect(attributionRoute).not.toMatch(/total_quiet_value[^_]/);
    expect(attributionRoute).toMatch(/total_quiet_value_bucket/);
  });
  it("asString helper truncates to 200 chars (prevents bloat)", () => {
    expect(attributionRoute).toMatch(/\.slice\(0, 200\)/);
  });
  it("does not import any PII-carrying module", () => {
    expect(attributionRoute).not.toMatch(/client_name|client_email|client_phone|customer_email/);
  });
});

// ---------------------------------------------------------------------------
// Existing surfaces untouched — homepage and audit still have their copy
// ---------------------------------------------------------------------------

describe("existing surfaces are not broken by auto-marketing", () => {
  it("homepage still has the approved headline", () => {
    const homepage = readSource("../app/page.tsx");
    expect(homepage).toMatch(
      /Buying another lead while old estimates sit untouched is an\s+expensive habit\./,
    );
  });
  it("audit page still has the audit form", () => {
    const audit = readSource("../app/audit/AuditCalculatorClient.tsx");
    expect(audit).toMatch(/data-testid="audit-form-card"/);
    expect(audit).toMatch(/data-testid="audit-submit"/);
  });
});
