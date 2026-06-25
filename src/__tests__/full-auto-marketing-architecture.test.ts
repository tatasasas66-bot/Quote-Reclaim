import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const migration = source("../../supabase/migrations/015_full_auto_marketing.sql");
const adminPage = source("../app/admin/full-auto-marketing/page.tsx");
const adminRoute = source(
  "../app/api/admin/full-auto-marketing/run/route.ts",
);
const cronRoute = source("../app/api/cron/full-auto-marketing/route.ts");
const orchestrator = source("../lib/marketing/full-auto-orchestrator.ts");
const smartlead = source("../lib/marketing/smartlead.ts");
const apify = source("../lib/marketing/apify.ts");
const verifier = source("../lib/marketing/email-verifier.ts");
const marketingFiles = [
  adminPage,
  adminRoute,
  cronRoute,
  orchestrator,
  smartlead,
  apify,
  verifier,
].join("\n");

describe("full-auto marketing schema isolation", () => {
  it("creates the five marketing-only tables", () => {
    for (const table of [
      "marketing_campaigns",
      "marketing_runs",
      "marketing_leads",
      "marketing_suppression_list",
      "marketing_events",
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
  });

  it("enables RLS and revokes customer roles on every marketing table", () => {
    expect(migration.match(/enable row level security/g)).toHaveLength(5);
    expect(migration.match(/revoke all on table/g)).toHaveLength(5);
    expect(migration).toContain("from anon, authenticated");
  });

  it("does not alter existing customer, auth, billing, or reminder tables", () => {
    expect(migration).not.toMatch(/alter table public\.(quotes|reminders|profiles)/i);
    expect(migration).not.toMatch(/paddle|stripe|auth\./i);
  });
});

describe("routes and orchestration safety", () => {
  it("protects the admin page and action route", () => {
    expect(adminPage).toContain("requireFullAutoMarketingAdmin");
    expect(adminRoute).toContain("forbiddenIfNotFullAutoAdminOrSecret");
  });

  it("keeps cron disabled unless explicitly enabled and secret-authenticated", () => {
    expect(cronRoute).toContain("marketingAutomationEnabled");
    expect(cronRoute).toContain("requireMarketingAutomationSecret");
  });

  it("has dry-run and live mode with valid-only Smartlead eligibility", () => {
    expect(orchestrator).toContain('campaign.mode === "dry_run"');
    expect(orchestrator).toContain("listUploadEligibleLeads");
    expect(orchestrator).toContain("applyDailyCap");
  });

  it("records run metrics for ingestion, verification, and upload", () => {
    expect(orchestrator).toContain("leads_found");
    expect(orchestrator).toContain("valid_emails");
    expect(orchestrator).toContain("uploaded_to_smartlead");
    expect(orchestrator).toContain("skipped_invalid");
    expect(orchestrator).toContain("skipped_risky");
    expect(orchestrator).toContain("skipped_unknown");
  });

  it("uses the current documented Apify and Smartlead campaign endpoints", () => {
    expect(apify).toContain("/runs");
    expect(apify).toContain("/actor-runs/");
    expect(apify).toContain("/datasets/");
    expect(smartlead).toContain("/campaigns/");
    expect(smartlead).toContain("lead_list");
    expect(orchestrator).toContain("getSmartleadCampaignStatus");
  });

  it("never imports or uses Resend for cold outreach", () => {
    expect(marketingFiles).not.toMatch(/from ["']resend["']/);
    expect(marketingFiles).not.toMatch(/RESEND_API_KEY/);
  });
});
