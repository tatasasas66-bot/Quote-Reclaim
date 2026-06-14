/**
 * Paddle webhook signature verification.
 *
 * The verifier MUST:
 *   - Accept a valid `ts=<unix_seconds>;h1=<hex_hmac>` header against the
 *     exact raw body and the configured secret.
 *   - Reject when the timestamp is outside the replay window.
 *   - Reject when the body or secret is mutated.
 *   - Reject malformed headers without throwing.
 *   - Compare hashes in constant time (no early return on first mismatching
 *     byte) — encoded by using `timingSafeEqual` under the hood.
 *
 * `shouldVerifyPaddleMode` must fail closed in production when the secret
 * is missing (returns "reject" so the route can 503) and "allow-unsigned"
 * only when not in production with no secret set — never in production.
 */
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

import {
  inspectPaddleSignature,
  parsePaddleSignatureHeader,
  shouldVerifyPaddleMode,
  verifyPaddleSignature,
} from "../lib/payments/paddle-signature";

const SECRET = "test-secret-do-not-deploy";

function buildHeader(rawBody: string, tsSeconds: number, secret = SECRET): string {
  const h1 = createHmac("sha256", secret).update(`${tsSeconds}:${rawBody}`).digest("hex");
  return `ts=${tsSeconds};h1=${h1}`;
}

describe("parsePaddleSignatureHeader", () => {
  it("extracts ts + h1 from a well-formed header (any key order)", () => {
    expect(parsePaddleSignatureHeader("ts=1700000000;h1=abcdef")).toEqual({
      ts: "1700000000",
      h1: "abcdef",
    });
    expect(parsePaddleSignatureHeader("h1=abcdef;ts=1700000000")).toEqual({
      ts: "1700000000",
      h1: "abcdef",
    });
  });

  it("returns null on a missing field, malformed pair, or empty input", () => {
    expect(parsePaddleSignatureHeader("")).toBeNull();
    expect(parsePaddleSignatureHeader("ts=1700000000")).toBeNull();
    expect(parsePaddleSignatureHeader("h1=abc")).toBeNull();
    expect(parsePaddleSignatureHeader("garbage")).toBeNull();
  });
});

describe("verifyPaddleSignature", () => {
  const rawBody = JSON.stringify({ event_id: "evt_1", event_type: "subscription.activated" });
  const ts = 1_700_000_000;

  it("accepts a valid signature for the raw body inside the replay window", () => {
    const header = buildHeader(rawBody, ts);
    expect(
      verifyPaddleSignature({
        secret: SECRET,
        header,
        rawBody,
        nowSeconds: ts,
      }),
    ).toBe(true);
  });

  it("accepts a fresh-enough timestamp (within 5 min default tolerance)", () => {
    const header = buildHeader(rawBody, ts);
    expect(
      verifyPaddleSignature({
        secret: SECRET,
        header,
        rawBody,
        nowSeconds: ts + 299,
      }),
    ).toBe(true);
  });

  it("rejects a stale timestamp (replay attack outside tolerance)", () => {
    const header = buildHeader(rawBody, ts);
    expect(
      verifyPaddleSignature({
        secret: SECRET,
        header,
        rawBody,
        nowSeconds: ts + 301,
      }),
    ).toBe(false);
  });

  it("rejects body tampering (single character changed in the body)", () => {
    const header = buildHeader(rawBody, ts);
    const tamperedBody = rawBody.replace("evt_1", "evt_2");
    expect(
      verifyPaddleSignature({
        secret: SECRET,
        header,
        rawBody: tamperedBody,
        nowSeconds: ts,
      }),
    ).toBe(false);
  });

  it("rejects when the signing secret is wrong", () => {
    const header = buildHeader(rawBody, ts, "different-secret");
    expect(
      verifyPaddleSignature({
        secret: SECRET,
        header,
        rawBody,
        nowSeconds: ts,
      }),
    ).toBe(false);
  });

  it("rejects when the signature hash is truncated or empty", () => {
    expect(
      verifyPaddleSignature({
        secret: SECRET,
        header: `ts=${ts};h1=`,
        rawBody,
        nowSeconds: ts,
      }),
    ).toBe(false);
    expect(
      verifyPaddleSignature({
        secret: SECRET,
        header: `ts=${ts};h1=deadbeef`,
        rawBody,
        nowSeconds: ts,
      }),
    ).toBe(false);
  });

  it("rejects when the secret is empty (never trusts an unset key)", () => {
    const header = buildHeader(rawBody, ts);
    expect(
      verifyPaddleSignature({
        secret: "",
        header,
        rawBody,
        nowSeconds: ts,
      }),
    ).toBe(false);
  });

  it("never throws on malformed input", () => {
    expect(() =>
      verifyPaddleSignature({
        secret: SECRET,
        header: "garbage",
        rawBody,
        nowSeconds: ts,
      }),
    ).not.toThrow();
    expect(() =>
      verifyPaddleSignature({
        secret: SECRET,
        header: `ts=not-a-number;h1=abc`,
        rawBody,
        nowSeconds: ts,
      }),
    ).not.toThrow();
  });
});

describe("inspectPaddleSignature — failure-path diagnostics", () => {
  const rawBody = JSON.stringify({ event_id: "evt_1" });
  const ts = 1_700_000_000;

  it("ok when signature matches", () => {
    const header = buildHeader(rawBody, ts);
    const r = inspectPaddleSignature({ secret: SECRET, header, rawBody, nowSeconds: ts });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.tsAgeSeconds).toBe(0);
  });

  it("reports missing_secret first, even with everything else present", () => {
    const header = buildHeader(rawBody, ts);
    const r = inspectPaddleSignature({ secret: "", header, rawBody, nowSeconds: ts });
    expect(r.reason).toBe("missing_secret");
  });

  it("reports missing_header when the request had no Paddle-Signature", () => {
    const r = inspectPaddleSignature({ secret: SECRET, header: "", rawBody, nowSeconds: ts });
    expect(r.reason).toBe("missing_header");
  });

  it("reports malformed_header when the header has neither ts nor h1", () => {
    const r = inspectPaddleSignature({
      secret: SECRET,
      header: "garbage",
      rawBody,
      nowSeconds: ts,
    });
    expect(r.reason).toBe("malformed_header");
  });

  it("reports non_numeric_timestamp when ts is not a number", () => {
    const r = inspectPaddleSignature({
      secret: SECRET,
      header: "ts=not-a-number;h1=deadbeef",
      rawBody,
      nowSeconds: ts,
    });
    expect(r.reason).toBe("non_numeric_timestamp");
  });

  it("reports timestamp_out_of_window with the signed age in seconds", () => {
    const header = buildHeader(rawBody, ts);
    const r = inspectPaddleSignature({
      secret: SECRET,
      header,
      rawBody,
      nowSeconds: ts + 600,
    });
    expect(r.reason).toBe("timestamp_out_of_window");
    expect(r.tsAgeSeconds).toBe(600);
  });

  it("reports signature_mismatch when ts/secret/header are fine but the body is tampered", () => {
    const header = buildHeader(rawBody, ts);
    const r = inspectPaddleSignature({
      secret: SECRET,
      header,
      rawBody: rawBody.replace("evt_1", "evt_2"),
      nowSeconds: ts,
    });
    expect(r.reason).toBe("signature_mismatch");
    expect(r.tsAgeSeconds).toBe(0);
  });

  it("reports signature_mismatch when the secret is wrong (does NOT leak which check tripped first)", () => {
    const header = buildHeader(rawBody, ts, "different-secret");
    const r = inspectPaddleSignature({ secret: SECRET, header, rawBody, nowSeconds: ts });
    expect(r.reason).toBe("signature_mismatch");
  });
});

describe("shouldVerifyPaddleMode", () => {
  it("production + secret set → verify", () => {
    expect(
      shouldVerifyPaddleMode({ NODE_ENV: "production", PADDLE_WEBHOOK_SECRET: "x" }),
    ).toBe("verify");
  });

  it("production + secret missing → reject (fail closed)", () => {
    expect(shouldVerifyPaddleMode({ NODE_ENV: "production" })).toBe("reject");
  });

  it("non-production + secret set → verify", () => {
    expect(
      shouldVerifyPaddleMode({ NODE_ENV: "test", PADDLE_WEBHOOK_SECRET: "x" }),
    ).toBe("verify");
  });

  it("non-production + secret missing → allow-unsigned (local dev / tests)", () => {
    expect(shouldVerifyPaddleMode({ NODE_ENV: "development" })).toBe("allow-unsigned");
  });
});
