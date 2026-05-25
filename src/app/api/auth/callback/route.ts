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

function safeSupabaseError(err: unknown): { name?: string; code?: string; message?: string; status?: number } {
  if (!err || typeof err !== "object") return {};
  const e = err as Record<string, unknown>;
  return {
    name: typeof e.name === "string" ? e.name : undefined,
    code: typeof e.code === "string" ? e.code : undefined,
    message: typeof e.message === "string" ? e.message : undefined,
    status: typeof e.status === "number" ? e.status : undefined,
  };
}

function callbackErrorCode(err: unknown): string {
  const { message = "", code = "" } = safeSupabaseError(err);
  const lower = (message + " " + code).toLowerCase();
  if (lower.includes("expired") || lower.includes("otp") || lower.includes("invalid token")) {
    return "link_expired";
  }
  return "auth_callback_failed";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  // Log origin+pathname only — never log query params (they contain the auth code).
  const requestPath = requestUrl.origin + requestUrl.pathname;
  const code = requestUrl.searchParams.get("code");
  const next = safeRedirectPath(requestUrl.searchParams.get("next"));

  if (!code) {
    console.warn("[auth:callback] no code in request", { path: requestPath });
    return NextResponse.redirect(
      new URL("/sign-in?error=missing_code", request.url),
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const safe = safeSupabaseError(error);
      console.error("[auth:callback] exchangeCodeForSession failed", {
        name: safe.name,
        code: safe.code,
        message: safe.message,
        status: safe.status,
        path: requestPath,
      });
      return NextResponse.redirect(
        new URL(`/sign-in?error=${callbackErrorCode(error)}`, request.url),
      );
    }
  } catch (err) {
    const safe = safeSupabaseError(err);
    console.error("[auth:callback] Supabase client exception", {
      name: safe.name,
      code: safe.code,
      message: safe.message,
      path: requestPath,
    });
    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_failed", request.url),
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
