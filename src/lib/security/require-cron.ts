import { timingSafeEqual } from "node:crypto";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

type EnvLike = { NODE_ENV?: string; CRON_SECRET?: string };

/**
 * Cron route gate.
 *
 *   Production:
 *     - CRON_SECRET missing => 503 (fail closed; never let cron run unauth'd).
 *     - Authorization header missing or not "Bearer X" => 401.
 *     - Token literal "undefined" / "null" / empty => 401.
 *     - Mismatch (timing-safe compare) => 401.
 *
 *   Non-production:
 *     - CRON_SECRET missing => allow (local dev, tests). Matches other
 *       webhook helpers in the project that allow unsigned in dev.
 *     - CRON_SECRET set => same strict checks as production.
 */
export function requireCronAuth(
  request: Request,
  env: EnvLike = process.env,
): CronAuthResult {
  const secret = env.CRON_SECRET;

  if (!secret) {
    if (env.NODE_ENV === "production") {
      return { ok: false, status: 503, error: "Cron not configured" };
    }
    return { ok: true };
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing auth" };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || token === "undefined" || token === "null") {
    return { ok: false, status: 401, error: "Missing auth" };
  }

  try {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return { ok: false, status: 401, error: "Invalid auth" };
    if (!timingSafeEqual(a, b)) {
      return { ok: false, status: 401, error: "Invalid auth" };
    }
  } catch {
    return { ok: false, status: 401, error: "Invalid auth" };
  }

  return { ok: true };
}
