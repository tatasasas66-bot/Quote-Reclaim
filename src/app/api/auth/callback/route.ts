import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

export const dynamic = "force-dynamic";

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

function safeHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Opt-in diagnostic logging. Behind AUTH_DEBUG=true so production stays quiet.
 * Logs ONLY non-sensitive facts: hostnames, booleans, category strings,
 * redirect pathnames. The OAuth `code`, any token, refresh_token, full URL,
 * query string, or cookie value MUST NEVER be passed to this helper.
 */
function authDebugLog(payload: Record<string, unknown>): void {
  if (process.env.AUTH_DEBUG !== "true") return;
  console.log("[auth:debug]", payload);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  // Log origin+pathname only — never log query params (they contain the auth code).
  const requestPath = requestUrl.origin + requestUrl.pathname;
  const code = requestUrl.searchParams.get("code");
  const next = safeRedirectPath(requestUrl.searchParams.get("next"));

  authDebugLog({
    event: "callback_reached",
    hasCode: Boolean(code),
    originHost: requestUrl.hostname,
    configuredCallbackHost: safeHostname(
      process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL,
    ),
    redirectPath: next,
  });

  if (!code) {
    console.warn("[auth:callback] no code in request", { path: requestPath });
    authDebugLog({ event: "callback_no_code" });
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
      const errorCategory = callbackErrorCode(error);
      authDebugLog({ event: "exchange_failed", errorCategory });
      // Rescue: a valid session may already exist on these cookies (e.g., a
      // duplicate callback request, a back/refresh that replayed a one-time
      // code, or a parallel attempt that already completed). If so, never
      // strand the signed-in user on an error page — send them into the app.
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          authDebugLog({
            event: "rescue_via_getuser_success",
            redirectPath: next,
          });
          return NextResponse.redirect(new URL(next, request.url));
        }
        authDebugLog({ event: "rescue_via_getuser_no_user" });
      } catch {
        // getUser failing is fine here — we just fall through to the error.
        authDebugLog({ event: "rescue_via_getuser_threw" });
      }
      return NextResponse.redirect(
        new URL(`/sign-in?error=${errorCategory}`, request.url),
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
    authDebugLog({ event: "callback_client_exception" });
    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_failed", request.url),
    );
  }

  authDebugLog({ event: "exchange_success", redirectPath: next });
  return NextResponse.redirect(new URL(next, request.url));
}
