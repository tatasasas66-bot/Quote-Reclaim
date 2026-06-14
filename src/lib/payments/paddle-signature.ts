import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paddle webhook signature verifier (Paddle Billing v1 format).
 *
 * Paddle signs each webhook with a per-endpoint secret and sends a single
 * `paddle-signature` header in the form:
 *
 *   ts=<unix_seconds>;h1=<hex_hmac_sha256>
 *
 * The signed payload is `<unix_seconds>:<raw_body>` — the colon-joined
 * timestamp and the *exact* raw request body, byte-for-byte. JSON re-parsing
 * before verification will break the signature, so callers MUST verify
 * against the original bytes.
 *
 * Replay protection: Paddle's documented tolerance is 5 minutes; older
 * timestamps are rejected so a captured webhook cannot be replayed against
 * us indefinitely.
 *
 * Comparison is constant-time via `timingSafeEqual` against equal-length
 * buffers; bad-format inputs short-circuit to `false` rather than throwing.
 */

export type SignatureCheckMode = "verify" | "allow-unsigned" | "reject";

type EnvLike = { NODE_ENV?: string; PADDLE_WEBHOOK_SECRET?: string };

export function shouldVerifyPaddleMode(env: EnvLike): SignatureCheckMode {
  if (env.NODE_ENV === "production") {
    return env.PADDLE_WEBHOOK_SECRET ? "verify" : "reject";
  }
  return env.PADDLE_WEBHOOK_SECRET ? "verify" : "allow-unsigned";
}

type ParsedSignature = { ts: string; h1: string } | null;

export function parsePaddleSignatureHeader(header: string): ParsedSignature {
  if (!header) return null;
  let ts = "";
  let h1 = "";
  for (const part of header.split(";")) {
    const [k, v] = part.split("=");
    if (!k || !v) continue;
    if (k.trim() === "ts") ts = v.trim();
    else if (k.trim() === "h1") h1 = v.trim();
  }
  if (!ts || !h1) return null;
  return { ts, h1 };
}

function constantTimeEqualHex(expected: string, provided: string): boolean {
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyPaddleSignature(opts: {
  secret: string;
  header: string;
  rawBody: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  return inspectPaddleSignature(opts).ok;
}

/**
 * Detailed verification result for failure-path diagnostics.
 *
 * Reason codes are safe to log: they identify WHICH check failed without
 * ever exposing the secret, the header value, or the body. The webhook
 * route can include this in its 401 line so operators can diagnose a
 * misconfiguration from Vercel logs alone.
 */
export type PaddleSignatureReason =
  | "ok"
  | "missing_secret"
  | "missing_header"
  | "missing_body"
  | "malformed_header"
  | "non_numeric_timestamp"
  | "timestamp_out_of_window"
  | "hmac_compute_failed"
  | "signature_mismatch";

export type PaddleSignatureInspection = {
  ok: boolean;
  reason: PaddleSignatureReason;
  /** Seconds between request timestamp and "now" (signed; negative = future).
   *  Only populated when the timestamp parses; safe to log. */
  tsAgeSeconds?: number;
};

export function inspectPaddleSignature(opts: {
  secret: string;
  header: string;
  rawBody: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): PaddleSignatureInspection {
  if (!opts.secret) return { ok: false, reason: "missing_secret" };
  if (!opts.header) return { ok: false, reason: "missing_header" };
  if (opts.rawBody === undefined || opts.rawBody === null) {
    return { ok: false, reason: "missing_body" };
  }

  const parsed = parsePaddleSignatureHeader(opts.header);
  if (!parsed) return { ok: false, reason: "malformed_header" };

  const ts = Number(parsed.ts);
  if (!Number.isFinite(ts)) return { ok: false, reason: "non_numeric_timestamp" };
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? 300;
  const tsAgeSeconds = now - ts;
  if (Math.abs(tsAgeSeconds) > tolerance) {
    return { ok: false, reason: "timestamp_out_of_window", tsAgeSeconds };
  }

  let expected: string;
  try {
    expected = createHmac("sha256", opts.secret)
      .update(`${parsed.ts}:${opts.rawBody}`)
      .digest("hex");
  } catch {
    return { ok: false, reason: "hmac_compute_failed", tsAgeSeconds };
  }

  if (!constantTimeEqualHex(expected, parsed.h1)) {
    return { ok: false, reason: "signature_mismatch", tsAgeSeconds };
  }
  return { ok: true, reason: "ok", tsAgeSeconds };
}
