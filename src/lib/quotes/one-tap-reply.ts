/**
 * One-Tap Reply — pure helpers (no I/O).
 *
 * Tokens are issued per email-send. The raw token only lives in the URL we
 * embed in the outbound email; the database stores nothing but the SHA-256
 * of that raw token. Server-side, every public-page request hashes the URL
 * token and looks up the corresponding row — there is no plaintext token
 * anywhere in our storage layer.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes → 43-char base64url. ~256 bits of entropy. */
const TOKEN_BYTES = 32;

export type IssuedToken = {
  /** Raw token. Embed in URLs. NEVER persist. */
  token: string;
  /** SHA-256 of the raw token, hex-encoded. Persist this. */
  tokenHash: string;
};

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Issue a fresh token. Pure; takes no inputs. */
export function generateToken(): IssuedToken {
  const raw = randomBytes(TOKEN_BYTES);
  const token = toBase64Url(raw);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

/** Hash a token from the URL the same way storage hashes it. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Compare a URL token against a stored hash in constant time. Defends
 * against any future timing-based probe of the token lookup path.
 */
export function tokenHashMatches(rawFromUrl: string, storedHash: string): boolean {
  if (!rawFromUrl || !storedHash) return false;
  const candidate = hashToken(rawFromUrl);
  if (candidate.length !== storedHash.length) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Answer types — the closed set the public page can emit
// ---------------------------------------------------------------------------

export const ANSWER_TYPES = [
  "interested",
  "price_concern",
  "bad_timing",
  "need_to_talk",
  "went_another_way",
  // Legacy values remain readable for existing links and stored replies.
  "question",
  "not_now",
  "option_selected",
] as const;

export type OneTapAnswerType = (typeof ANSWER_TYPES)[number];

export type { OneTapBranchAnswer } from "./one-tap-choices";
export { ONE_TAP_CHOICES } from "./one-tap-choices";

export function isAnswerType(value: unknown): value is OneTapAnswerType {
  return (
    typeof value === "string" &&
    (ANSWER_TYPES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Map answer_type → ReplyIntent so existing Quiet Signal + ReplyRadarCard
// pipelines absorb one-tap replies without any refactor.
// ---------------------------------------------------------------------------

import type { ReplyIntent } from "@/lib/ai/classify-reply";

export function mapAnswerTypeToReplyIntent(
  answer: OneTapAnswerType,
): ReplyIntent {
  switch (answer) {
    case "interested":
      return "positive";
    case "price_concern":
      return "price_objection";
    case "bad_timing":
      return "needs_time";
    case "need_to_talk":
      return "question";
    case "went_another_way":
      return "not_interested";
    case "option_selected":
      return "positive";
    case "question":
      return "question";
    case "not_now":
      return "not_interested";
  }
}

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

/**
 * Production-safe base URL: explicit env, otherwise the canonical marketing
 * host. Mirrors the helper in the email-inbound webhook to avoid leaking
 * localhost. Canonical origin is www (apex 301s to www), so the fallback uses
 * www to keep homeowner-facing /reply/{token} links hop-free.
 */
export function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return "https://www.quotereclaim.com";
}

export function buildReplyUrl(token: string, base?: string): string {
  const root = (base ?? appBaseUrl()).replace(/\/+$/, "");
  return `${root}/reply/${token}`;
}

// ---------------------------------------------------------------------------
// Hash an IP for abuse telemetry without storing the raw address
// ---------------------------------------------------------------------------

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT ?? "qr-one-tap-default-salt-v1";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

// ---------------------------------------------------------------------------
// Public-page gating — the same answer regardless of which gate trips, so
// we never leak which condition failed.
// ---------------------------------------------------------------------------

export type QuoteForGating = {
  outcome: "pending" | "won" | "closed";
  client_opted_out: boolean | null;
};

export type LinkForGating = {
  revoked_at: string | null;
  expires_at: string | null;
};

/** True iff the homeowner page should render the reply form. */
export function canRenderReplyPage(
  quote: QuoteForGating,
  link: LinkForGating,
  nowMs: number = Date.now(),
): boolean {
  if (quote.outcome !== "pending") return false;
  if (quote.client_opted_out) return false;
  if (link.revoked_at) return false;
  if (link.expires_at && Date.parse(link.expires_at) <= nowMs) return false;
  return true;
}
