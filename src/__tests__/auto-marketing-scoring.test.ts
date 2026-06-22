/**
 * Lead scoring formula tests — pure, no DB.
 */
import { describe, expect, it } from "vitest";
import { scoreLead, scoreLeadWithFirstName } from "@/lib/auto-marketing/scoring";

describe("scoring — trade fit", () => {
  it("concrete scores 30 for trade fit", () => {
    const r = scoreLead({
      trade: "concrete", email: "mike@test.com", website: "https://x.com",
      reviewCount: 50, reviewResponseRate: 0.2, publicSignal: null,
      notes: "free estimate", city: "Phoenix", niche: "driveway",
    });
    expect(r.breakdown.tradeFit).toBe(30);
  });
  it("driveway scores 30 for trade fit (sub-service match)", () => {
    const r = scoreLead({
      trade: "driveway", email: "x@x.com", website: null, reviewCount: null,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.tradeFit).toBe(30);
  });
  it("fencing scores 22", () => {
    const r = scoreLead({
      trade: "fencing", email: "x@x.com", website: null, reviewCount: null,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.tradeFit).toBe(22);
  });
  it("painting scores 18", () => {
    const r = scoreLead({
      trade: "painting", email: "x@x.com", website: null, reviewCount: null,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.tradeFit).toBe(18);
  });
  it("hvac scores 16", () => {
    const r = scoreLead({
      trade: "hvac", email: "x@x.com", website: null, reviewCount: null,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.tradeFit).toBe(16);
  });
  it("roofing scores 15", () => {
    const r = scoreLead({
      trade: "roofing", email: "x@x.com", website: null, reviewCount: null,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.tradeFit).toBe(15);
  });
  it("other trade scores 8", () => {
    const r = scoreLead({
      trade: "gutters", email: "x@x.com", website: null, reviewCount: null,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.tradeFit).toBe(8);
  });
});

describe("scoring — email quality", () => {
  it("named/owner email scores 20", () => {
    const r = scoreLead({
      trade: "concrete", email: "mike@sunbelt.com", website: null, reviewCount: null,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.emailQuality).toBe(20);
  });
  it("info@ scores 10", () => {
    const r = scoreLead({
      trade: "concrete", email: "info@sunbelt.com", website: null, reviewCount: null,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.emailQuality).toBe(10);
  });
  it("no email scores 0 and is not sendable", () => {
    const r = scoreLead({
      trade: "concrete", email: null, website: null, reviewCount: null,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.emailQuality).toBe(0);
    expect(r.sendable).toBe(false);
    expect(r.status).toBe("rejected");
  });
});

describe("scoring — review count tiers", () => {
  it("10-100 reviews scores 15 (sweet spot)", () => {
    const r = scoreLead({
      trade: "concrete", email: "x@x.com", website: null, reviewCount: 45,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.reviewCount).toBe(15);
  });
  it("101-300 reviews scores 8", () => {
    const r = scoreLead({
      trade: "concrete", email: "x@x.com", website: null, reviewCount: 200,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.reviewCount).toBe(8);
  });
  it("300+ reviews scores 3", () => {
    const r = scoreLead({
      trade: "concrete", email: "x@x.com", website: null, reviewCount: 500,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.reviewCount).toBe(3);
  });
  it("under 10 reviews scores 2", () => {
    const r = scoreLead({
      trade: "concrete", email: "x@x.com", website: null, reviewCount: 5,
      reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null,
    });
    expect(r.breakdown.reviewCount).toBe(2);
  });
});

describe("scoring — status thresholds", () => {
  it("score >= 70 → approved + sendable", () => {
    const r = scoreLead({
      trade: "concrete", email: "mike@sunbelt.com", website: "https://sunbelt.com",
      reviewCount: 50, reviewResponseRate: 0.2,
      publicSignal: "now booking into August", notes: "free estimate",
      city: "Phoenix", niche: "driveway",
    });
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.status).toBe("approved");
    expect(r.sendable).toBe(true);
  });
  it("score 50-69 → review", () => {
    const r = scoreLead({
      trade: "painting", email: "info@paint.com", website: "https://paint.com",
      reviewCount: 5, reviewResponseRate: null, publicSignal: null,
      notes: null, city: "Dallas", niche: null,
    });
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.score).toBeLessThan(70);
    expect(r.status).toBe("review");
    expect(r.sendable).toBe(false);
  });
  it("score < 50 → rejected", () => {
    const r = scoreLead({
      trade: "gutters", email: "info@x.com", website: null, reviewCount: 2,
      reviewResponseRate: null, publicSignal: null, notes: null,
      city: "Portland", niche: null,
    });
    expect(r.score).toBeLessThan(50);
    expect(r.status).toBe("rejected");
  });
  it("no email → rejected regardless of score", () => {
    const r = scoreLead({
      trade: "concrete", email: null, website: "https://x.com", reviewCount: 100,
      reviewResponseRate: 0.1, publicSignal: "now booking", notes: "free estimate",
      city: "Phoenix", niche: "driveway",
    });
    expect(r.status).toBe("rejected");
    expect(r.sendable).toBe(false);
  });
});

describe("scoring — cap at 100", () => {
  it("never exceeds 100", () => {
    const r = scoreLead({
      trade: "concrete", email: "mike@sunbelt.com", website: "https://sunbelt.com",
      reviewCount: 50, reviewResponseRate: 0.2,
      publicSignal: "now booking into August crew availability",
      notes: "free estimate owner operated LLC", city: "Phoenix", niche: "driveway",
    });
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("scoring — scoreLeadWithFirstName", () => {
  it("first name adds owner-operator points", () => {
    const withName = scoreLeadWithFirstName(
      { trade: "concrete", email: "x@x.com", website: null, reviewCount: null,
        reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null },
      "Mike",
    );
    const withoutName = scoreLeadWithFirstName(
      { trade: "concrete", email: "x@x.com", website: null, reviewCount: null,
        reviewResponseRate: null, publicSignal: null, notes: null, city: null, niche: null },
      null,
    );
    expect(withName.breakdown.ownerOperator).toBe(8);
    expect(withoutName.breakdown.ownerOperator).toBe(0);
    expect(withName.score).toBeGreaterThanOrEqual(withoutName.score);
  });
});
