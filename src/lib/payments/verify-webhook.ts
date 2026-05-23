import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureCheckMode = "verify" | "allow-unsigned" | "reject";

type EnvLike = { NODE_ENV?: string; LEMONSQUEEZY_WEBHOOK_SECRET?: string };

/**
 * Production: webhook secret is required. Missing => 503 (fail closed).
 * Non-production: verify if a secret is configured; otherwise allow
 * unsigned bodies so local dev / source-level tests can exercise the path.
 */
export function shouldVerifyLemonMode(env: EnvLike): SignatureCheckMode {
  if (env.NODE_ENV === "production") {
    return env.LEMONSQUEEZY_WEBHOOK_SECRET ? "verify" : "reject";
  }
  return env.LEMONSQUEEZY_WEBHOOK_SECRET ? "verify" : "allow-unsigned";
}

/**
 * Lemon Squeezy signs webhook bodies with HMAC-SHA256 using the configured
 * webhook secret. The signature is delivered as a hex string in the
 * X-Signature header. Compare with timingSafeEqual to avoid side-channel
 * leaks.
 */
export function verifyLemonSignature(params: {
  secret: string;
  body: string;
  signature: string;
}): boolean {
  if (!params.secret || !params.signature) return false;
  let expected: string;
  try {
    expected = createHmac("sha256", params.secret)
      .update(params.body)
      .digest("hex");
  } catch {
    return false;
  }
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(params.signature, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
