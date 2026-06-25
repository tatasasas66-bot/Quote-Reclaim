import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";

function values(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isFullAutoAdminConfigured(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return Boolean(
    values(env.FULL_AUTO_MARKETING_ADMIN_EMAILS).size ||
      values(env.ADMIN_USER_IDS).size,
  );
}

export async function requireFullAutoMarketingAdmin() {
  const { user, supabase } = await requireUser();
  if (!user) return { user: null, supabase, reason: "no_session" as const };
  const emails = values(process.env.FULL_AUTO_MARKETING_ADMIN_EMAILS);
  const ids = values(process.env.ADMIN_USER_IDS);
  const email = user.email?.toLowerCase() ?? "";
  if ((!email || !emails.has(email)) && !ids.has(user.id.toLowerCase())) {
    return { user, supabase, reason: "not_admin" as const };
  }
  return { user, supabase, reason: null };
}

export async function forbiddenIfNotFullAutoAdmin(): Promise<NextResponse | null> {
  const result = await requireFullAutoMarketingAdmin();
  if (result.reason === "no_session") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (result.reason === "not_admin" || !result.user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function forbiddenIfNotFullAutoAdminOrSecret(
  request: Request,
): Promise<NextResponse | null> {
  const hasSecretHeader = Boolean(
    request.headers.get("authorization") ||
      request.headers.get("x-marketing-automation-secret"),
  );
  if (hasSecretHeader) {
    const auth = requireMarketingAutomationSecret(request);
    return auth.ok
      ? null
      : NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return forbiddenIfNotFullAutoAdmin();
}

export function requireMarketingAutomationSecret(
  request: Request,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): { ok: true } | { ok: false; status: number; error: string } {
  const secret = env.MARKETING_AUTOMATION_SECRET?.trim();
  if (!secret) {
    return { ok: false, status: 503, error: "Marketing automation not configured" };
  }
  const authorization = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-marketing-automation-secret") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : headerSecret.trim();
  if (!token) return { ok: false, status: 401, error: "Missing auth" };

  const left = Buffer.from(token);
  const right = Buffer.from(secret);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, status: 401, error: "Invalid auth" };
  }
  return { ok: true };
}
