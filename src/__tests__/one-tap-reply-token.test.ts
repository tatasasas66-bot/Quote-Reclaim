/**
 * One-Tap Reply — token helpers + gating (pure, no DB).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ANSWER_TYPES,
  appBaseUrl,
  buildReplyUrl,
  canRenderReplyPage,
  generateToken,
  hashIp,
  hashToken,
  isAnswerType,
  mapAnswerTypeToReplyIntent,
  tokenHashMatches,
} from "@/lib/quotes/one-tap-reply";

describe("generateToken", () => {
  it("returns base64url raw token + sha256 hex hash", () => {
    const { token, tokenHash } = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is cryptographically distinct across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) seen.add(generateToken().token);
    expect(seen.size).toBe(64);
  });

  it("hashToken is deterministic and matches generateToken's hash", () => {
    const { token, tokenHash } = generateToken();
    expect(hashToken(token)).toBe(tokenHash);
    expect(hashToken(token)).toBe(hashToken(token));
  });
});

describe("tokenHashMatches", () => {
  it("accepts the matching raw token in constant time", () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHashMatches(token, tokenHash)).toBe(true);
  });

  it("rejects any tampered token", () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHashMatches(token + "x", tokenHash)).toBe(false);
    expect(tokenHashMatches(token.slice(0, -1), tokenHash)).toBe(false);
    expect(tokenHashMatches("", tokenHash)).toBe(false);
    expect(tokenHashMatches(token, "")).toBe(false);
  });
});

describe("isAnswerType + closed set", () => {
  it("exposes the five current branches plus legacy stored answer types", () => {
    expect([...ANSWER_TYPES]).toEqual([
      "interested",
      "price_concern",
      "bad_timing",
      "need_to_talk",
      "went_another_way",
      "question",
      "not_now",
      "option_selected",
    ]);
  });

  it("isAnswerType narrows correctly", () => {
    expect(isAnswerType("interested")).toBe(true);
    expect(isAnswerType("question")).toBe(true);
    expect(isAnswerType("not_now")).toBe(true);
    expect(isAnswerType("option_selected")).toBe(true);
    expect(isAnswerType("won")).toBe(false);
    expect(isAnswerType("")).toBe(false);
    expect(isAnswerType(null)).toBe(false);
    expect(isAnswerType(undefined)).toBe(false);
  });
});

describe("mapAnswerTypeToReplyIntent", () => {
  it("interested + option_selected → positive (Quiet Signal R0 suppress)", () => {
    expect(mapAnswerTypeToReplyIntent("interested")).toBe("positive");
    expect(mapAnswerTypeToReplyIntent("option_selected")).toBe("positive");
  });
  it("question → question (Reply Radar renders it)", () => {
    expect(mapAnswerTypeToReplyIntent("question")).toBe("question");
  });
  it("not_now → not_interested (Quiet Signal lost_interest path)", () => {
    expect(mapAnswerTypeToReplyIntent("not_now")).toBe("not_interested");
  });
});

describe("buildReplyUrl / appBaseUrl", () => {
  const ORIGINAL_APP_BASE_URL = process.env.APP_BASE_URL;
  afterEach(() => {
    if (ORIGINAL_APP_BASE_URL === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = ORIGINAL_APP_BASE_URL;
  });

  it("appends /reply/{token} to the configured base", () => {
    expect(buildReplyUrl("abc123", "https://example.com")).toBe(
      "https://example.com/reply/abc123",
    );
  });
  it("strips trailing slashes on the base", () => {
    expect(buildReplyUrl("abc", "https://example.com/")).toBe(
      "https://example.com/reply/abc",
    );
  });
  it("appBaseUrl falls back to the canonical www host when env unset", () => {
    delete process.env.APP_BASE_URL;
    expect(appBaseUrl()).toBe("https://www.quotereclaim.com");
  });
  it("appBaseUrl uses APP_BASE_URL when set (canonical www in production)", () => {
    process.env.APP_BASE_URL = "https://www.quotereclaim.com";
    expect(appBaseUrl()).toBe("https://www.quotereclaim.com");
  });
  it("buildReplyUrl produces a canonical https://www.quotereclaim.com/reply/{token}", () => {
    process.env.APP_BASE_URL = "https://www.quotereclaim.com";
    expect(buildReplyUrl("TOKEN123")).toBe(
      "https://www.quotereclaim.com/reply/TOKEN123",
    );
  });
});

describe("hashIp", () => {
  it("returns null when no ip is supplied", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp("")).toBeNull();
  });
  it("returns a 64-char sha256 hex digest, deterministic for the same input", () => {
    const a = hashIp("1.2.3.4");
    const b = hashIp("1.2.3.4");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(b);
    expect(hashIp("5.6.7.8")).not.toBe(a);
  });
});

describe("canRenderReplyPage gating", () => {
  const base = {
    quote: { outcome: "pending" as const, client_opted_out: false },
    link: { revoked_at: null, expires_at: null },
  };

  it("allows pending, non-opted-out, live link", () => {
    expect(canRenderReplyPage(base.quote, base.link)).toBe(true);
  });
  it("rejects WON quote", () => {
    expect(
      canRenderReplyPage({ ...base.quote, outcome: "won" }, base.link),
    ).toBe(false);
  });
  it("rejects CLOSED quote", () => {
    expect(
      canRenderReplyPage({ ...base.quote, outcome: "closed" }, base.link),
    ).toBe(false);
  });
  it("rejects opted-out customer", () => {
    expect(
      canRenderReplyPage(
        { ...base.quote, client_opted_out: true },
        base.link,
      ),
    ).toBe(false);
  });
  it("rejects revoked link", () => {
    expect(
      canRenderReplyPage(base.quote, {
        ...base.link,
        revoked_at: new Date().toISOString(),
      }),
    ).toBe(false);
  });
  it("rejects expired link", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(
      canRenderReplyPage(base.quote, { ...base.link, expires_at: past }),
    ).toBe(false);
  });
  it("accepts a link whose expires_at is in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(
      canRenderReplyPage(base.quote, { ...base.link, expires_at: future }),
    ).toBe(true);
  });
});
