/**
 * Admin access guard — mirrors require-user.ts shape.
 *
 * Admin access is granted via an env allowlist of Supabase user UUIDs
 * (ADMIN_USER_IDS, comma-separated). This is the smallest safe server-side
 * guard that reuses the existing auth session without introducing a new
 * DB table or role concept.
 *
 * If ADMIN_USER_IDS is unset/empty, no one is an admin — the feature is
 * disabled. This is the "fail closed" behavior.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireUser } from "./require-user";

type RequireAdminResult =
  | { user: User; supabase: SupabaseClient; reason: null }
  | { user: User | null; supabase: SupabaseClient | null; reason: "no_session" | "not_admin" };

function adminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** True if the admin allowlist is configured (non-empty). */
export function isAdminConfigured(): boolean {
  return adminUserIds().size > 0;
}

/**
 * Returns the authenticated admin user, or a reason explaining why not.
 * Never throws — mirrors requireUser's resilient shape.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const { user, supabase } = await requireUser();
  if (!user) {
    return { user: null, supabase, reason: "no_session" };
  }
  const allowlist = adminUserIds();
  if (allowlist.size === 0 || !allowlist.has(user.id)) {
    return { user, supabase, reason: "not_admin" as const };
  }
  return { user, supabase, reason: null };
}

/**
 * Convenience helper for API routes — returns a 403/401 NextResponse when the
 * caller is not an admin (401 when there is no session at all). Returns null
 * when the caller IS an admin and the route may proceed.
 */
export async function forbiddenResponseIfNotAdmin(): Promise<NextResponse | null> {
  const result = await requireAdmin();
  if (result.reason === "no_session") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (result.reason === "not_admin" || !result.user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
