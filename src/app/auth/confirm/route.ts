import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Magic-link / email confirmation endpoint.
 *
 * Supabase email templates that use the {{ .TokenHash }} pattern link here:
 *   /auth/confirm?token_hash=...&type=magiclink&next=/dashboard
 *
 * We exchange the token hash for a session via verifyOtp (the SSR client
 * persists the session cookies on the redirect response), then send the user
 * on. Google OAuth still flows through /api/auth/callback (the ?code= path).
 */

const ALLOWED_EMAIL_OTP_TYPES = new Set([
  "magiclink",
  "signup",
  "email",
  "recovery",
  "invite",
  "email_change",
]);

function safeRedirectPath(next: string | null): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

function safeSupabaseError(err: unknown): {
  name?: string;
  code?: string;
  message?: string;
  status?: number;
} {
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
  const lower = `${message} ${code}`.toLowerCase();
  if (
    lower.includes("expired") ||
    lower.includes("otp") ||
    lower.includes("invalid token")
  ) {
    return "link_expired";
  }
  return "auth_callback_failed";
}

function normalizeType(value: string | null): EmailOtpType | null {
  if (!value || !ALLOWED_EMAIL_OTP_TYPES.has(value)) return null;
  return value as EmailOtpType;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  // Log origin+pathname only — never log query params (they carry the token).
  const requestPath = requestUrl.origin + requestUrl.pathname;
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = normalizeType(requestUrl.searchParams.get("type"));
  const next = safeRedirectPath(requestUrl.searchParams.get("next"));

  if (!tokenHash || !type) {
    console.warn("[auth:confirm] missing token_hash or type", {
      path: requestPath,
    });
    return NextResponse.redirect(
      new URL("/sign-in?error=missing_code", request.url),
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) {
      const safe = safeSupabaseError(error);
      console.error("[auth:confirm] verifyOtp failed", {
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
    console.error("[auth:confirm] Supabase client exception", {
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
