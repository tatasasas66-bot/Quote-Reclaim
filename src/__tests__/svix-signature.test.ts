import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  shouldVerifyResendMode,
  verifySvixSignature,
} from "@/lib/messaging/svix-signature";

// Test secret. "whsec_<base64 of 32 zero bytes>" — fixed value lets us
// pre-compute expected signatures without leaking a real secret.
const TEST_SECRET_RAW = Buffer.alloc(32, 0).toString("base64");
const TEST_SECRET = `whsec_${TEST_SECRET_RAW}`;

function sign(id: string, ts: string, body: string): string {
  const key = Buffer.from(TEST_SECRET_RAW, "base64");
  const sig = createHmac("sha256", key)
    .update(`${id}.${ts}.${body}`)
    .digest("base64");
  return `v1,${sig}`;
}

describe("shouldVerifyResendMode", () => {
  it("rejects in production when the secret is missing", () => {
    expect(shouldVerifyResendMode({ NODE_ENV: "production" })).toBe("reject");
  });
  it("verifies in production when the secret is set", () => {
    expect(
      shouldVerifyResendMode({
        NODE_ENV: "production",
        RESEND_EMAIL_EVENTS_WEBHOOK_SECRET: TEST_SECRET,
      }),
    ).toBe("verify");
  });
  it("allows unsigned in non-production when no secret is set", () => {
    expect(shouldVerifyResendMode({ NODE_ENV: "development" })).toBe(
      "allow-unsigned",
    );
  });
  it("verifies in non-production when a secret IS set", () => {
    expect(
      shouldVerifyResendMode({
        NODE_ENV: "development",
        RESEND_EMAIL_EVENTS_WEBHOOK_SECRET: TEST_SECRET,
      }),
    ).toBe("verify");
  });
});

describe("verifySvixSignature", () => {
  const id = "msg_2N5...";
  const nowSeconds = 1_700_000_000;
  const ts = String(nowSeconds);
  const body = '{"type":"email.opened","data":{"email_id":"abc"}}';
  const goodSig = sign(id, ts, body);

  it("accepts a correctly-signed request", () => {
    expect(
      verifySvixSignature({
        secret: TEST_SECRET,
        svixId: id,
        svixTimestamp: ts,
        svixSignature: goodSig,
        rawBody: body,
        nowSeconds,
      }),
    ).toBe(true);
  });

  it("rejects when the secret is wrong", () => {
    expect(
      verifySvixSignature({
        secret: `whsec_${Buffer.alloc(32, 1).toString("base64")}`,
        svixId: id,
        svixTimestamp: ts,
        svixSignature: goodSig,
        rawBody: body,
        nowSeconds,
      }),
    ).toBe(false);
  });

  it("rejects when the body has been tampered with (length match)", () => {
    expect(
      verifySvixSignature({
        secret: TEST_SECRET,
        svixId: id,
        svixTimestamp: ts,
        svixSignature: goodSig,
        rawBody: body.replace("opened", "OPEN_D"),
        nowSeconds,
      }),
    ).toBe(false);
  });

  it("rejects when the body has been tampered with (length differs)", () => {
    expect(
      verifySvixSignature({
        secret: TEST_SECRET,
        svixId: id,
        svixTimestamp: ts,
        svixSignature: goodSig,
        rawBody: body + " ",
        nowSeconds,
      }),
    ).toBe(false);
  });

  it("rejects stale timestamps (> 5 min skew)", () => {
    expect(
      verifySvixSignature({
        secret: TEST_SECRET,
        svixId: id,
        svixTimestamp: String(nowSeconds - 600),
        svixSignature: sign(id, String(nowSeconds - 600), body),
        rawBody: body,
        nowSeconds,
      }),
    ).toBe(false);
  });

  it("rejects future-skewed timestamps", () => {
    expect(
      verifySvixSignature({
        secret: TEST_SECRET,
        svixId: id,
        svixTimestamp: String(nowSeconds + 600),
        svixSignature: sign(id, String(nowSeconds + 600), body),
        rawBody: body,
        nowSeconds,
      }),
    ).toBe(false);
  });

  it("rejects missing/empty pieces", () => {
    const base = {
      secret: TEST_SECRET,
      svixId: id,
      svixTimestamp: ts,
      svixSignature: goodSig,
      rawBody: body,
      nowSeconds,
    };
    expect(verifySvixSignature({ ...base, secret: "" })).toBe(false);
    expect(verifySvixSignature({ ...base, svixId: "" })).toBe(false);
    expect(verifySvixSignature({ ...base, svixTimestamp: "" })).toBe(false);
    expect(verifySvixSignature({ ...base, svixSignature: "" })).toBe(false);
  });

  it("accepts when the multi-version header carries a matching v1 sig", () => {
    const otherV1 = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const header = `${otherV1} ${goodSig}`;
    expect(
      verifySvixSignature({
        secret: TEST_SECRET,
        svixId: id,
        svixTimestamp: ts,
        svixSignature: header,
        rawBody: body,
        nowSeconds,
      }),
    ).toBe(true);
  });
});
