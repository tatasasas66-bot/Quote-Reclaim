import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureCheckMode = "verify" | "allow-unsigned" | "reject";

type EnvLike = { NODE_ENV?: string; TWILIO_AUTH_TOKEN?: string };

/**
 * Production: signature is required. Missing token => "reject" (503).
 * Non-production: prefer to verify when a token is configured; otherwise
 * allow unsigned requests for local dev / source-level tests. Production is
 * never permitted to fall through to "allow-unsigned".
 */
export function shouldVerifyMode(env: EnvLike): SignatureCheckMode {
  if (env.NODE_ENV === "production") {
    return env.TWILIO_AUTH_TOKEN ? "verify" : "reject";
  }
  return env.TWILIO_AUTH_TOKEN ? "verify" : "allow-unsigned";
}

export function verifyTwilioSignature(params: {
  authToken: string;
  url: string;
  formParams: Record<string, string>;
  signature: string;
}): boolean {
  if (!params.authToken || !params.signature) return false;
  const sortedKeys = Object.keys(params.formParams).sort();
  let data = params.url;
  for (const key of sortedKeys) {
    data += key + params.formParams[key];
  }
  let expected: string;
  try {
    expected = createHmac("sha1", params.authToken).update(data).digest("base64");
  } catch {
    return false;
  }
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(params.signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
