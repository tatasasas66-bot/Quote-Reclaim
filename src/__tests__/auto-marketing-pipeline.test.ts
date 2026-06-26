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

  it("uses the sharp quote-in-your-truck subject thread", () => {
    expect(CONCRETE_DRIVEWAY_V1.steps.map((step) => step.subject)).toEqual([
      "the quote in your truck",
      "Re: the quote in your truck",
      "Re: the quote in your truck",
    ]);
  });

  it("email 1 body uses the direct audit URL without merge-field dependency", () => {
    const body = CONCRETE_DRIVEWAY_V1.steps[0]!.body;
    expect(body).toContain("You already paid for the gas");
    expect(body).toContain("Before you buy another shared lead this week");
    expect(body).toContain("https://www.quotereclaim.com/audit");
    expect(body).toContain('Reply "stop" and I\'ll close the loop.');
    expect(body).toContain("%signature%");
    expect(body).not.toContain("{first_name}");
    expect(body).not.toContain("{audit_url}");
  });

  it("follow-up names the awkward-reopen problem and 60-second audit", () => {
    const body = CONCRETE_DRIVEWAY_V1.steps[1]!.body;
    expect(body).toContain("60 seconds");
    expect(body).toContain("reopening an old quote feels like rejection");
    expect(body).toContain("https://www.quotereclaim.com/audit");
  });

  it("final email carries the expensive-habit line and opt-out", () => {
    const body = CONCRETE_DRIVEWAY_V1.steps[2]!.body;
    expect(body).toContain(
      "Buying another lead while old estimates sit untouched is an expensive habit.",
    );
    expect(body).toContain("guy with a wheelbarrow");
    expect(body).toContain('Reply "stop" and I\'ll close the loop.');
    expect(body).toContain("https://www.quotereclaim.com/audit");
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
    expect(rendered!.subject).toBe("the quote in your truck");
    expect(rendered!.body).toContain("https://www.quotereclaim.com/audit");
    expect(rendered!.body).not.toContain("Hi Mike,");
    expect(rendered!.body).not.toContain("utm_city=Phoenix");
    expect(rendered!.body).not.toContain("{first_name}");
    expect(rendered!.body).not.toContain("{company}");
    expect(rendered!.body).not.toContain("{audit_url}");
  });

  it("does not rely on first_name when it is missing", () => {
    const rendered = renderEmail("concrete_v1", 1, {
      company: "Acme Concrete",
      city: "Dallas",
    });
    expect(rendered!.body).not.toContain("Hi there,");
    expect(rendered!.body).toContain("You already paid for the gas");
  });

  it("still renders with the direct audit URL when city is missing", () => {
    const rendered = renderEmail("concrete_v1", 1, {
      first_name: "Mike",
      company: "Acme",
    });
    expect(rendered!.body).toContain("https://www.quotereclaim.com/audit");
    expect(rendered!.body).not.toContain("utm_city=Phoenix");
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
