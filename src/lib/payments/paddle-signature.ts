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
  if (!opts.secret || !opts.header || opts.rawBody === undefined) return false;

  const parsed = parsePaddleSignatureHeader(opts.header);
  if (!parsed) return false;

  const ts = Number(parsed.ts);
  if (!Number.isFinite(ts)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? 300;
  if (Math.abs(now - ts) > tolerance) return false;

  let expected: string;
  try {
    expected = createHmac("sha256", opts.secret)
      .update(`${parsed.ts}:${opts.rawBody}`)
      .digest("hex");
  } catch {
    return false;
  }

  return constantTimeEqualHex(expected, parsed.h1);
}
