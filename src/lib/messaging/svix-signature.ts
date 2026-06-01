import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Svix webhook signature verifier (the format Resend uses for email events).
 *
 * Signed payload = "{svix-id}.{svix-timestamp}.{raw-body}" — HMAC-SHA256 with
 * the webhook secret as key, base64-encoded. The svix-signature header carries
 * one or more space-separated "v1,<base64sig>" pairs (key rotation support).
 * A request is valid when at least one of those pairs matches the computed
 * HMAC in constant time.
 *
 * The 5-minute timestamp tolerance below is Svix's documented default and
 * prevents replay of stale captured webhooks.
 */

export type SignatureCheckMode = "verify" | "allow-unsigned" | "reject";

type EnvLike = { NODE_ENV?: string; RESEND_WEBHOOK_SECRET?: string };

/**
 * Mirror of shouldVerifyMode() for Twilio: production always requires the
 * secret to be set (rejected with 503 if missing); non-production verifies
 * when configured and allows unsigned for local dev / source-level tests.
 */
export function shouldVerifyResendMode(env: EnvLike): SignatureCheckMode {
  if (env.NODE_ENV === "production") {
    return env.RESEND_WEBHOOK_SECRET ? "verify" : "reject";
  }
  return env.RESEND_WEBHOOK_SECRET ? "verify" : "allow-unsigned";
}

function decodeSecret(secret: string): Buffer | null {
  // Svix secrets are stored as "whsec_<base64>". Strip the prefix when
  // present and base64-decode. Anything else returns null so we never
  // verify against a malformed key.
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    const buf = Buffer.from(raw, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

function constantTimeEqualB64(expected: string, provided: string): boolean {
  try {
    const a = Buffer.from(expected, "base64");
    const b = Buffer.from(provided, "base64");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifySvixSignature(opts: {
  secret: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  rawBody: string;
  /** Override "now" in tests; defaults to current Unix time. */
  nowSeconds?: number;
  /** Replay window in seconds; Svix default is 5 min. */
  toleranceSeconds?: number;
}): boolean {
  if (!opts.secret || !opts.svixId || !opts.svixTimestamp || !opts.svixSignature) {
    return false;
  }

  const ts = Number(opts.svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? 300;
  if (Math.abs(now - ts) > tolerance) return false;

  const key = decodeSecret(opts.secret);
  if (!key) return false;

  let expected: string;
  try {
    expected = createHmac("sha256", key)
      .update(`${opts.svixId}.${opts.svixTimestamp}.${opts.rawBody}`)
      .digest("base64");
  } catch {
    return false;
  }

  // svix-signature is space-separated "v1,<sig>" pairs.
  const candidates = opts.svixSignature
    .split(" ")
    .map((part) => {
      const [version, sig] = part.split(",");
      return version === "v1" && sig ? sig : null;
    })
    .filter((s): s is string => s !== null);

  return candidates.some((sig) => constantTimeEqualB64(expected, sig));
}
