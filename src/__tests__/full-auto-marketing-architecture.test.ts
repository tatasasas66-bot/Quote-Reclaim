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
const adminClient = source(
  "../app/admin/full-auto-marketing/FullAutoMarketingClient.tsx",
);
const adminRoute = source(
  "../app/api/admin/full-auto-marketing/run/route.ts",
);
const cronRoute = source("../app/api/cron/full-auto-marketing/route.ts");
const orchestrator = source("../lib/marketing/full-auto-orchestrator.ts");
const repo = source("../lib/marketing/repo.ts");
const smartlead = source("../lib/marketing/smartlead.ts");
const apify = source("../lib/marketing/apify.ts");
const verifier = source("../lib/marketing/email-verifier.ts");
const sequence = source("../lib/marketing/sequence.ts");
const legacyRunAuto = source(
  "../app/api/admin/auto-marketing/run-auto/route.ts",
);
const legacySmartleadPush = source(
  "../app/api/admin/auto-marketing/smartlead/push/route.ts",
);
const legacyReplyWebhook = source(
  "../app/api/admin/auto-marketing/reply-webhook/route.ts",
);
const legacyCampaignConfig = source(
  "../lib/auto-marketing/campaign-config.ts",
);
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
    expect(cronRoute).toContain("hasCompliancePostalAddress");
    expect(cronRoute).toContain("status: 409");
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

  it("refreshes persisted old default sequence copy when campaigns load", () => {
    expect(repo).toContain("refreshOldDefaultMarketingSequenceConfig");
    expect(repo).toContain("refreshCampaignSequenceIfOldDefault");
    expect(repo).toMatch(/listMarketingCampaigns[\s\S]*refreshCampaignSequenceIfOldDefault/);
    expect(repo).toContain('.from("marketing_campaigns")');
  });

  it("updates Smartlead mapping on the selected campaign without creating a duplicate", () => {
    expect(adminClient).toContain(
      "Smartlead campaign ID for selected campaign",
    );
    expect(adminClient).toContain("Save Smartlead mapping");
    expect(adminRoute).toContain('case "set_smartlead_campaign"');
    expect(adminRoute).toContain("getMarketingCampaignBySmartleadId");
    expect(adminRoute).toContain(
      "smartlead_campaign_id: smartleadCampaignId",
    );
    expect(repo).toContain("smartlead_campaign_id: string | null");
  });

  it("guards lead upload when no Smartlead campaign is mapped", () => {
    expect(adminClient).toContain("SMARTLEAD_CAMPAIGN_MAPPING_REQUIRED");
    expect(adminRoute).toContain("SMARTLEAD_CAMPAIGN_MAPPING_REQUIRED");
    expect(adminRoute).toMatch(
      /case "upload"[\s\S]*!campaign\.smartlead_campaign_id[\s\S]*SMARTLEAD_CAMPAIGN_MAPPING_REQUIRED/,
    );
  });

  it("sends social-media scraping as an object, never a boolean", () => {
    expect(apify).toContain("DISABLED_SOCIAL_MEDIA_PROFILES");
    expect(apify).toContain("normalizeActorObjectOption");
    expect(apify).toContain("scrapeSocialMediaProfiles:");
    expect(apify).not.toMatch(/scrapeSocialMediaProfiles:\s*false/);
  });

  it("never imports or uses Resend for cold outreach", () => {
    expect(marketingFiles).not.toMatch(/from ["']resend["']/);
    expect(marketingFiles).not.toMatch(/RESEND_API_KEY/);
  });

  it("blocks live mode and activation at the admin API boundary", () => {
    expect(adminRoute).toContain("campaignActivationAllowed");
    expect(adminRoute).toContain("requireAllowedMode");
    expect(adminRoute).toContain("LiveComplianceError");
    expect(adminRoute).toContain("status: error instanceof LiveComplianceError ? 409");
  });

  it("shows the required compliance warning in the admin UI", () => {
    expect(adminClient).toContain("Dry-run allowed");
    expect(adminClient).toContain(
      "Live sending blocked: missing compliance postal address",
    );
    expect(adminClient).toContain("Do not use a fake address");
  });

  it("contains no compliance-address placeholder in sequence copy", () => {
    expect(sequence).not.toContain("{{compliance_postal_address}}");
    expect(sequence).not.toContain("1 Main St");
    expect(sequence).not.toContain("123 Main");
  });

  it("closes legacy Smartlead upload and auto-reply bypasses", () => {
    expect(legacyRunAuto).toContain("hasCompliancePostalAddress");
    expect(legacyRunAuto).toContain("LIVE_COMPLIANCE_BLOCK_REASON");
    expect(legacySmartleadPush).toContain("hasCompliancePostalAddress");
    expect(legacySmartleadPush).toContain("status: 409");
    expect(legacyReplyWebhook).toContain("getCompliancePostalAddress");
    expect(legacyReplyWebhook).toContain("compliancePostalAddress &&");
    expect(legacyCampaignConfig).toContain("getCompliancePostalAddress");
    expect(legacyCampaignConfig).toMatch(
      /const body = compliancePostalAddress\s*\?/,
    );
  });
});
