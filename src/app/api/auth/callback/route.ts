import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Rejects open-redirect attempts. Anything that doesn't start with a single
 * forward slash falls back to /dashboard.
 *
 *   ?next=/dashboard         -> /dashboard
 *   ?next=//evil.com         -> /dashboard  (protocol-relative)
 *   ?next=https://evil.com   -> /dashboard
 *   ?next=javascript:alert() -> /dashboard
 */
function safeRedirectPath(next: string | null): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeRedirectPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/sign-in?error=missing_code", request.url),
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL("/sign-in?error=auth_callback_failed", request.url),
      );
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("auth callback: Supabase unavailable", err);
    }
    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_failed", request.url),
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
