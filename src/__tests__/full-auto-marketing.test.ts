import { describe, expect, it, vi } from "vitest";
import {
  campaignActivationAllowed,
  getCompliancePostalAddress,
  getMarketingSetupStatus,
  LIVE_COMPLIANCE_BLOCK_REASON,
  marketingModeAllowed,
  normalizeDailyCap,
} from "@/lib/marketing/config";
import { verifyMarketingEmail } from "@/lib/marketing/email-verifier";
import {
  normalizeApifyRecord,
  normalizeMarketingEmail,
  websiteDomain,
} from "@/lib/marketing/normalize";
import {
  applyDailyCap,
  buildMarketingAuditUrl,
  campaignCanUploadLive,
  classifySuppressionText,
  isDuplicateIdentity,
  leadIsEligibleForSmartlead,
  verificationAllowsLiveUpload,
} from "@/lib/marketing/safety";
import { buildComplianceSafeSequence } from "@/lib/marketing/sequence";
import type { MarketingCampaign, MarketingLead } from "@/lib/marketing/types";

const VALID_TEST_POSTAL_ADDRESS = "Authorized test postal address";

const campaign: MarketingCampaign = {
  id: "campaign-1",
  name: "Concrete Phoenix v1",
  slug: "concrete-phoenix-v1",
  trade: "concrete",
  city: "Phoenix",
  search_query: "concrete driveway contractors Phoenix AZ",
  apify_actor_id: null,
  smartlead_campaign_id: "123",
  daily_cap: 10,
  status: "active",
  mode: "live",
  sequence_config: buildComplianceSafeSequence(VALID_TEST_POSTAL_ADDRESS),
  last_run_at: null,
  created_at: "2026-06-25T00:00:00.000Z",
  updated_at: "2026-06-25T00:00:00.000Z",
};

const lead: MarketingLead = {
  id: "lead-1",
  campaign_id: campaign.id,
  company_name: "Phoenix Concrete",
  first_name: null,
  trade: "concrete",
  city: "Phoenix",
  website: "https://phoenixconcrete.example",
  website_domain: "phoenixconcrete.example",
  email: "hello@phoenixconcrete.example",
  phone: null,
  address: null,
  google_maps_url: null,
  source: "apify",
  source_place_id: "place-1",
  apify_run_id: "run-1",
  verification_status: "valid",
  verification_detail: "valid",
  smartlead_lead_id: null,
  smartlead_status: null,
  reply_status: "none",
  suppressed: false,
  suppression_reason: null,
  audit_url: "https://www.quotereclaim.com/audit",
  last_contacted_at: null,
  created_at: "2026-06-25T00:00:00.000Z",
  updated_at: "2026-06-25T00:00:00.000Z",
};

describe("Apify result normalization", () => {
  it("normalizes common Google Maps Scraper field shapes", () => {
    const normalized = normalizeApifyRecord(
      {
        title: "Mike's Concrete",
        website: "mikesconcrete.com",
        phoneNumber: "602-555-0100",
        fullAddress: "1 Main St, Phoenix, AZ",
        placeId: "abc",
        googleMapsUrl: "https://google.com/maps/place/abc",
        emails: ["INFO@MIKESCONCRETE.COM"],
      },
      { city: "Phoenix" },
    );
    expect(normalized.companyName).toBe("Mike's Concrete");
    expect(normalized.firstName).toBe("Mike");
    expect(normalized.websiteDomain).toBe("mikesconcrete.com");
    expect(normalized.emails).toEqual(["info@mikesconcrete.com"]);
    expect(normalized.sourcePlaceId).toBe("abc");
  });

  it("finds nested contact-enrichment emails without treating Maps URLs as websites", () => {
    const normalized = normalizeApifyRecord(
      {
        companyName: "Desert Driveways",
        url: "https://www.google.com/maps/place/desert",
        websiteUrl: "https://desertdriveways.com/",
        companyContacts: [{ email: "owner@desertdriveways.com" }],
      },
      { city: "Phoenix" },
    );
    expect(normalized.website).toBe("https://desertdriveways.com");
    expect(normalized.googleMapsUrl).toContain("google.com/maps");
    expect(normalized.emails).toEqual(["owner@desertdriveways.com"]);
  });

  it("keeps a no-email place but makes it ineligible for upload", () => {
    const normalized = normalizeApifyRecord(
      { name: "No Email Concrete", website: "https://no-email.example" },
      { city: "Phoenix" },
    );
    expect(normalized.emails).toEqual([]);
    expect(leadIsEligibleForSmartlead({ ...lead, email: null })).toBe(false);
  });
});

describe("dedupe, suppression, and live eligibility", () => {
  it("deduplicates by email or website domain", () => {
    expect(
      isDuplicateIdentity({
        email: "hello@example.com",
        domain: "new.example",
        knownEmails: new Set(["hello@example.com"]),
        knownDomains: new Set(),
      }),
    ).toBe(true);
    expect(
      isDuplicateIdentity({
        email: "other@example.com",
        domain: "known.example",
        knownEmails: new Set(),
        knownDomains: new Set(["known.example"]),
      }),
    ).toBe(true);
  });

  it("never uploads suppressed, unverified, invalid, risky, or unknown leads", () => {
    expect(leadIsEligibleForSmartlead({ ...lead, suppressed: true })).toBe(false);
    for (const status of ["unverified", "invalid", "risky", "unknown"] as const) {
      expect(
        leadIsEligibleForSmartlead({ ...lead, verification_status: status }),
      ).toBe(false);
      expect(verificationAllowsLiveUpload(status)).toBe(false);
    }
    expect(leadIsEligibleForSmartlead(lead)).toBe(true);
  });

  it("classifies stop, unsubscribe, no, wrong person, bounce, and spam", () => {
    for (const text of [
      "no",
      "please stop",
      "unsubscribe me",
      "not interested",
      "remove me",
      "wrong person",
      "this is spam",
      "message bounced",
    ]) {
      expect(classifySuppressionText(text)).not.toBeNull();
    }
  });

  it("enforces the remaining daily cap", () => {
    expect(applyDailyCap([1, 2, 3, 4], 3, 1)).toEqual([1, 2]);
    expect(applyDailyCap([1], 10, 10)).toEqual([]);
    expect(normalizeDailyCap(100)).toBe(15);
  });

  it("requires active live campaign, Smartlead mapping, and complete setup", () => {
    expect(
      campaignCanUploadLive(campaign, true, VALID_TEST_POSTAL_ADDRESS),
    ).toBe(true);
    expect(
      campaignCanUploadLive(
        { ...campaign, mode: "dry_run" },
        true,
        VALID_TEST_POSTAL_ADDRESS,
      ),
    ).toBe(false);
    expect(
      campaignCanUploadLive(
        { ...campaign, status: "paused" },
        true,
        VALID_TEST_POSTAL_ADDRESS,
      ),
    ).toBe(false);
    expect(
      campaignCanUploadLive(campaign, false, VALID_TEST_POSTAL_ADDRESS),
    ).toBe(false);
    expect(campaignCanUploadLive(campaign, true, null)).toBe(false);
  });
});

describe("audit URL and setup status", () => {
  it("builds a PII-free UTM audit URL", () => {
    const url = buildMarketingAuditUrl({
      campaignSlug: "concrete-phoenix-v1",
      trade: "concrete",
      city: "Phoenix",
    });
    expect(url).toContain("utm_source=cold_email");
    expect(url).toContain("utm_campaign=concrete-phoenix-v1");
    expect(url).toContain("utm_trade=concrete");
    expect(url).toContain("utm_city=Phoenix");
    const keys = Array.from(new URL(url).searchParams.keys());
    expect(keys).not.toContain("company");
    expect(keys).not.toContain("email");
  });

  it("shows setup-required state without throwing when env vars are absent", () => {
    const setup = getMarketingSetupStatus({});
    expect(setup.liveReady).toBe(false);
    expect(setup.dryRunAllowed).toBe(true);
    expect(setup.complianceAddressConfigured).toBe(false);
    expect(setup.liveBlockReason).toBe(LIVE_COMPLIANCE_BLOCK_REASON);
    expect(setup.missingForLive).toContain("Smartlead API");
    expect(setup.missingForLive).toContain("Compliance postal address");
  });
});

describe("compliance postal address gate", () => {
  it("allows dry-run without a compliance postal address", () => {
    expect(marketingModeAllowed("dry_run", {})).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("blocks live mode and campaign activation without an address", () => {
    expect(marketingModeAllowed("live", {})).toEqual({
      allowed: false,
      reason: LIVE_COMPLIANCE_BLOCK_REASON,
    });
    expect(campaignActivationAllowed("active", {})).toEqual({
      allowed: false,
      reason: LIVE_COMPLIANCE_BLOCK_REASON,
    });
  });

  it("treats a blank or whitespace-only address as missing", () => {
    expect(getCompliancePostalAddress({ COMPLIANCE_POSTAL_ADDRESS: "" })).toBeNull();
    expect(
      getCompliancePostalAddress({ COMPLIANCE_POSTAL_ADDRESS: "   \t " }),
    ).toBeNull();
    expect(
      marketingModeAllowed("live", { COMPLIANCE_POSTAL_ADDRESS: "   " }),
    ).toEqual({
      allowed: false,
      reason: LIVE_COMPLIANCE_BLOCK_REASON,
    });
  });

  it("allows live mode only when a non-blank address exists", () => {
    expect(
      marketingModeAllowed("live", {
        COMPLIANCE_POSTAL_ADDRESS: `  ${VALID_TEST_POSTAL_ADDRESS}  `,
      }),
    ).toEqual({ allowed: true, reason: null });
    expect(
      campaignActivationAllowed("active", {
        COMPLIANCE_POSTAL_ADDRESS: VALID_TEST_POSTAL_ADDRESS,
      }),
    ).toEqual({ allowed: true, reason: null });
  });

  it("adds no footer or fake placeholder when an address is absent", () => {
    const sequence = JSON.stringify(buildComplianceSafeSequence());
    expect(sequence).not.toContain("compliance_postal_address");
    expect(sequence).not.toContain("1 Main St");
    expect(sequence).not.toContain("123 Main");
    expect(sequence).not.toContain("PO Box 123");
  });

  it("uses only the supplied address in every generated email footer", () => {
    const sequence = buildComplianceSafeSequence(
      `  ${VALID_TEST_POSTAL_ADDRESS}  `,
    );
    const steps = sequence.steps as Array<{ body: string }>;
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step.body.endsWith(VALID_TEST_POSTAL_ADDRESS)).toBe(true);
      expect(step.body).not.toContain("compliance_postal_address");
    }
  });
});

describe("email verifier", () => {
  it("does not fake validity when verifier configuration is missing", async () => {
    await expect(
      verifyMarketingEmail("owner@example.com", { env: {} }),
    ).resolves.toMatchObject({ status: "unverified" });
  });

  it("maps a ZeroBounce valid response to valid", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ status: "valid", sub_status: "" }), {
        status: 200,
      }),
    );
    await expect(
      verifyMarketingEmail("owner@example.com", {
        env: {
          EMAIL_VERIFIER_PROVIDER: "zerobounce",
          EMAIL_VERIFIER_API_KEY: "test-key",
        },
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toMatchObject({ status: "valid", provider: "zerobounce" });
  });

  it("maps catch-all and unknown results away from live eligibility", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ status: "catch-all", sub_status: "catch_all" }),
        { status: 200 },
      ),
    );
    const result = await verifyMarketingEmail("owner@example.com", {
      env: {
        EMAIL_VERIFIER_PROVIDER: "zerobounce",
        EMAIL_VERIFIER_API_KEY: "test-key",
      },
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.status).toBe("risky");
  });

  it("rejects malformed email syntax before calling a provider", async () => {
    expect(normalizeMarketingEmail("not-an-email")).toBeNull();
    expect(websiteDomain("example.com")).toBe("example.com");
    await expect(
      verifyMarketingEmail("not-an-email", { env: {} }),
    ).resolves.toMatchObject({ status: "invalid" });
  });
});
