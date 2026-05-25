import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import {
  safeRedirectFromRedirectTo,
  safeRedirectPath,
} from "@/lib/auth/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_EMAIL_OTP_TYPES = new Set(["signup", "magiclink", "email"]);

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

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeType(value: string | null): EmailOtpType | null {
  if (!value || !ALLOWED_EMAIL_OTP_TYPES.has(value)) return null;
  return value as EmailOtpType;
}

export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const requestPath = requestUrl.origin + requestUrl.pathname;
  const formData = await request.formData();
  const tokenHash = formString(formData, "token_hash");
  const type = normalizeType(formString(formData, "type"));
  const redirectTo = safeRedirectFromRedirectTo(
    formString(formData, "redirect_to"),
    request.url,
  );

  if (!tokenHash || !type) {
    console.warn("[auth:confirm] missing auth fields", {
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

  return NextResponse.redirect(
    new URL(safeRedirectPath(redirectTo), request.url),
  );
}
