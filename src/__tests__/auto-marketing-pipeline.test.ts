/**
 * Campaign config + pipeline orchestration tests — pure, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  CONCRETE_DRIVEWAY_V1,
  resolveCampaignConfig,
  renderEmail,
} from "@/lib/auto-marketing/campaign-config";
import { buildSearchStrings } from "@/lib/auto-marketing/apify";

describe("campaign-config — concrete_driveway_v1", () => {
  it("has exactly 3 steps (email 1, follow-up, breakup)", () => {
    expect(CONCRETE_DRIVEWAY_V1.steps).toHaveLength(3);
    expect(CONCRETE_DRIVEWAY_V1.steps[0]!.step).toBe(1);
    expect(CONCRETE_DRIVEWAY_V1.steps[1]!.step).toBe(2);
    expect(CONCRETE_DRIVEWAY_V1.steps[2]!.step).toBe(3);
  });

  it("subject line contains {company} merge field", () => {
    for (const step of CONCRETE_DRIVEWAY_V1.steps) {
      expect(step.subject).toContain("{company}");
    }
  });

  it("email 1 body contains the core promise + audit URL + opt-out", () => {
    const body = CONCRETE_DRIVEWAY_V1.steps[0]!.body;
    expect(body).toContain("Before buying another lead");
    expect(body).toContain("{audit_url}");
    expect(body).toContain('Reply "no" and I\'ll stop');
    expect(body).toContain("No signup. No card. No customer names.");
  });

  it("follow-up references 60 seconds", () => {
    const body = CONCRETE_DRIVEWAY_V1.steps[1]!.body;
    expect(body).toContain("60 seconds");
  });

  it("breakup gives an opt-out before the CTA", () => {
    const body = CONCRETE_DRIVEWAY_V1.steps[2]!.body;
    expect(body).toContain("Should I close this out?");
    expect(body).toContain('reply "no" and I\'ll stop');
  });

  it("auditUrl builds the correct trade-specific URL with UTMs", () => {
    const url = CONCRETE_DRIVEWAY_V1.auditUrl("Phoenix");
    expect(url).toContain("utm_source=cold_email");
    expect(url).toContain("utm_campaign=concrete_driveway_v1");
    expect(url).toContain("utm_trade=concrete");
    expect(url).toContain("utm_city=Phoenix");
  });

  it("auditUrl URL-encodes the city", () => {
    const url = CONCRETE_DRIVEWAY_V1.auditUrl("Las Vegas");
    expect(url).toContain("utm_city=Las%20Vegas");
  });
});

describe("resolveCampaignConfig", () => {
  it("resolves concrete_v1", () => {
    const c = resolveCampaignConfig("concrete_v1");
    expect(c).not.toBeNull();
    expect(c!.trade).toBe("concrete");
  });
  it("returns null for unknown variant", () => {
    expect(resolveCampaignConfig("nonexistent_v1")).toBeNull();
  });
});

describe("renderEmail", () => {
  it("substitutes merge fields in subject + body", () => {
    const rendered = renderEmail("concrete_v1", 1, {
      first_name: "Mike",
      company: "Sun Belt Concrete",
      city: "Phoenix",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.subject).toBe("quiet concrete quotes — Sun Belt Concrete");
    expect(rendered!.body).toContain("Hi Mike,");
    expect(rendered!.body).toContain("utm_city=Phoenix");
    expect(rendered!.body).not.toContain("{first_name}");
    expect(rendered!.body).not.toContain("{company}");
    expect(rendered!.body).not.toContain("{audit_url}");
  });

  it("falls back to 'there' when first_name is missing", () => {
    const rendered = renderEmail("concrete_v1", 1, {
      company: "Acme Concrete",
      city: "Dallas",
    });
    expect(rendered!.body).toContain("Hi there,");
  });

  it("falls back to default city when city is missing", () => {
    const rendered = renderEmail("concrete_v1", 1, {
      first_name: "Mike",
      company: "Acme",
    });
    expect(rendered!.body).toContain("utm_city=Phoenix");
  });

  it("returns null for unknown variant", () => {
    expect(renderEmail("nonexistent", 1, { company: "X", city: "Y" })).toBeNull();
  });

  it("returns null for invalid step number", () => {
    expect(renderEmail("concrete_v1", 99, { company: "X", city: "Y" })).toBeNull();
  });
});

describe("buildSearchStrings (Apify)", () => {
  it("concrete trade returns 3 concrete-specific queries", () => {
    const queries = buildSearchStrings("concrete", "Phoenix");
    expect(queries).toContain("concrete contractor Phoenix");
    expect(queries).toContain("driveway contractor Phoenix");
    expect(queries).toContain("concrete replacement Phoenix");
  });
  it("driveway trade aliases to concrete queries", () => {
    const queries = buildSearchStrings("driveway", "Dallas");
    expect(queries).toContain("concrete contractor Dallas");
  });
  it("fencing trade returns fence-specific queries", () => {
    const queries = buildSearchStrings("fencing", "Austin");
    expect(queries).toContain("fence contractor Austin");
  });
  it("unknown trade falls back to generic query", () => {
    const queries = buildSearchStrings("gutters", "Portland");
    expect(queries).toContain("gutters contractor Portland");
  });
});
