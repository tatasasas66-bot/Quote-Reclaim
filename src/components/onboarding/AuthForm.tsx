"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
};

const CALLBACK_PATH = "/api/auth/callback";
const RESEND_COOLDOWN_SECONDS = 60;

function normalizeCallbackBase(raw: string): string {
  const trimmed = raw.trim();
  const embeddedUrl = trimmed.match(/https?:\/\/\S+/)?.[0] ?? trimmed;

  try {
    const url = new URL(embeddedUrl);
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = CALLBACK_PATH;
    }
    return url.toString();
  } catch {
    return embeddedUrl;
  }
}

function safeHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).hostname || null;
  } catch {
    return null;
  }
}

function safeOrigin(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).origin || null;
  } catch {
    return null;
  }
}

function authDebugLog(payload: Record<string, unknown>): void {
  if (process.env.NEXT_PUBLIC_AUTH_DEBUG !== "true") return;
  // Hostname / boolean / pathname facts only — never token, code, or full URL.
  console.log("[auth:debug]", payload);
}

function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function describeCallbackError(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "link_expired":
    case "missing_code":
      return "That link expired or was already used. Send a fresh sign-in link.";
    case "auth_callback_failed":
      return "We couldn't finish signing you in. Try the link again or request a new one.";
    default:
      return "Sign-in error. Try again.";
  }
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

function isRateLimitError(err: unknown): boolean {
  const { code, message = "", status } = safeSupabaseError(err);
  const lower = message.toLowerCase();
  return (
    code === "over_email_send_rate_limit" ||
    status === 429 ||
    lower.includes("rate limit") ||
    lower.includes("too many")
  );
}

function userFacingMagicLinkError(err: unknown): string {
  const { code, message = "" } = safeSupabaseError(err);
  const lower = message.toLowerCase();
  if (isRateLimitError(err)) {
    return "Too many attempts. Wait a few minutes, then try again.";
  }
  if (code === "email_not_confirmed") {
    return "Secure link sent. Open it from your inbox to sign in.";
  }
  if (lower.includes("invalid api key") || lower.includes("invalid project")) {
    return "Service configuration error. Contact support if this persists.";
  }
  return "Could not send the link. Try again or contact support.";
}

const GOOGLE_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

export function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const auditToken = searchParams.get("audit_token") ?? undefined;
  const rawCallbackError = describeCallbackError(searchParams.get("error"));

  // Session-check gate. Initial render is "checking" so a stale
  // `?error=auth_callback_failed` never flashes during the brief microtask
  // between mount and the first getSession() resolution. After resolution,
  // either we hard-navigate to /dashboard (session present) or we surface
  // the error AND strip `?error=` from the visible URL so a refresh doesn't
  // keep re-showing it. Both branches preserve a real failure signal in the
  // page body — only the URL is cleaned.
  const [sessionChecking, setSessionChecking] = React.useState(true);
  const [hasSession, setHasSession] = React.useState(false);
  const callbackError =
    hasSession || sessionChecking ? null : rawCallbackError;

  const [email, setEmail] = React.useState("");
  const [sentEmail, setSentEmail] = React.useState("");
  const [magicLoading, setMagicLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [magicSent, setMagicSent] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = React.useState<
    number | null
  >(null);
  const [now, setNow] = React.useState(() => Date.now());

  const cooldownRemaining = resendAvailableAt
    ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000))
    : 0;

  const callbackUrl = React.useMemo(() => {
    // ALWAYS anchor on the current browsing origin so the PKCE code_verifier
    // cookie (written client-side just before the redirect to Google) and the
    // cookies the /api/auth/callback handler reads share the SAME origin.
    // A NEXT_PUBLIC_AUTH_CALLBACK_URL pointing at a different origin (e.g.,
    // the production custom domain while the user is on a Vercel preview, or
    // the apex while the user is on www., etc.) silently strands the verifier
    // cookie on the wrong origin and breaks the first attempt every time.
    const currentOrigin =
      typeof window !== "undefined" ? window.location.origin : "";
    const configured = process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL;
    const configuredOrigin = safeOrigin(configured);

    let base: string;
    if (currentOrigin) {
      // Browser path — current origin wins. If env is set AND its origin
      // matches the current one, honor the env (it may include a custom
      // pathname); otherwise fall back to current origin + default path and
      // optionally surface a hostname-only warning.
      if (configured && configuredOrigin === currentOrigin) {
        base = normalizeCallbackBase(configured);
      } else {
        if (configured && configuredOrigin && configuredOrigin !== currentOrigin) {
          authDebugLog({
            event: "redirectTo_origin_mismatch_ignored_env",
            envHost: safeHostname(configured),
            currentHost: safeHostname(currentOrigin),
          });
        }
        base = `${currentOrigin}${CALLBACK_PATH}`;
      }
    } else if (configured) {
      // SSR / non-browser path — no live origin to anchor on, so use env.
      base = normalizeCallbackBase(configured);
    } else {
      base = CALLBACK_PATH;
    }

    const nextPath = auditToken
      ? `/dashboard?audit_token=${auditToken}`
      : "/dashboard";
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}next=${encodeURIComponent(nextPath)}`;
  }, [auditToken]);

  React.useEffect(() => {
    if (!resendAvailableAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [resendAvailableAt]);

  // First-attempt OAuth recovery: if a Supabase session cookie already exists
  // when the auth page mounts (e.g., the callback succeeded server-side but
  // the browser is showing a stale `/sign-in?error=...` URL), hard-navigate to
  // the dashboard. Hard navigation (vs router.replace) ensures the dashboard
  // server render reads the freshly-written cookies. No token is logged.
  React.useEffect(() => {
    let cancelled = false;
    let supabase: ReturnType<typeof createBrowserSupabaseClient>;
    try {
      supabase = createBrowserSupabaseClient();
    } catch {
      setSessionChecking(false);
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data.session?.user) {
          setHasSession(true);
          const next = searchParams.get("next");
          const target = safeRedirectPath(
            auditToken && !next
              ? `/dashboard?audit_token=${encodeURIComponent(auditToken)}`
              : next,
          );
          authDebugLog({
            event: "auth_page_session_detected_redirecting",
            targetPath: target,
          });
          window.location.replace(target);
          return;
        }
        // No session: drop the stale `?error=` from the URL so a refresh
        // doesn't keep re-showing it. The error stays visible inline (the
        // page body still renders it after sessionChecking flips false) so
        // the user knows what happened.
        if (typeof window !== "undefined" && rawCallbackError) {
          try {
            const url = new URL(window.location.href);
            if (url.searchParams.get("error")) {
              url.searchParams.delete("error");
              const qs = url.searchParams.toString();
              window.history.replaceState(
                null,
                "",
                url.pathname + (qs ? `?${qs}` : "") + url.hash,
              );
            }
          } catch {
            // ignore URL parsing failures
          }
        }
        authDebugLog({
          event: "auth_page_no_session_resolved",
          hadStaleError: Boolean(rawCallbackError),
        });
        setSessionChecking(false);
      })
      .catch(() => {
        if (!cancelled) setSessionChecking(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally one-shot on mount: the auth surface re-renders are state-
    // driven, and getSession() is a fast local-cookie read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startResendCooldown() {
    const next = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    setResendAvailableAt(next);
    setNow(Date.now());
  }

  async function handleMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setFormError("Enter your work email.");
      return;
    }
    setMagicLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: callbackUrl,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setSentEmail(trimmed);
      setMagicSent(true);
      setFormError(null);
      startResendCooldown();
    } catch (err) {
      const safe = safeSupabaseError(err);
      const callbackOriginPath = (() => {
        try {
          const u = new URL(callbackUrl);
          return u.origin + u.pathname;
        } catch {
          return callbackUrl.split("?")[0];
        }
      })();
      console.error("[auth:magic-link] send failed", {
        name: safe.name,
        code: safe.code,
        message: safe.message,
        status: safe.status,
        callbackOriginPath,
      });
      setFormError(userFacingMagicLinkError(err));
      if (isRateLimitError(err)) startResendCooldown();
    } finally {
      setMagicLoading(false);
    }
  }

  async function handleGoogle() {
    setFormError(null);
    setGoogleLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) throw error;
    } catch (err) {
      const safe = safeSupabaseError(err);
      console.error("[auth:google] OAuth start failed", {
        name: safe.name,
        code: safe.code,
        message: safe.message,
        status: safe.status,
      });
      setFormError("Could not start Google sign-in. Try Magic Link instead.");
      setGoogleLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {formError ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          {formError}
        </div>
      ) : null}

      {callbackError && !formError ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          {callbackError}
        </div>
      ) : null}

      {magicSent ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm"
        >
          <p className="font-semibold text-success">
            Secure link sent. Open it from your inbox to sign in.
          </p>
          <p className="mt-1 text-ink">
            This link expires shortly and can only be used once.
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Sent to <span className="font-medium">{sentEmail}</span>
          </p>
          <button
            type="button"
            className="mt-3 text-xs text-ink-muted underline hover:text-ink-strong"
            onClick={() => {
              setMagicSent(false);
              setSentEmail("");
              setFormError(null);
            }}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleMagicLink} noValidate className="space-y-3">
          <Input
            label="Work email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            required
            autoComplete="email"
            inputMode="email"
            disabled={magicLoading || googleLoading}
          />
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={magicLoading}
            disabled={googleLoading || cooldownRemaining > 0}
          >
            {magicLoading
              ? "Sending secure link..."
              : cooldownRemaining > 0
                ? `Try again in ${cooldownRemaining}s`
                : mode === "sign-up"
                  ? "Send secure link"
                  : "Send secure link"}
          </Button>
        </form>
      )}

      {!magicSent && GOOGLE_AUTH_ENABLED ? (
        <>
          <div
            className="flex items-center gap-3 text-xs uppercase tracking-widest text-ink-muted"
            aria-hidden="true"
          >
            <span className="h-px flex-1 bg-line-subtle" />
            OR
            <span className="h-px flex-1 bg-line-subtle" />
          </div>

          <Button
            type="button"
            variant="google"
            fullWidth
            size="lg"
            loading={googleLoading}
            disabled={magicLoading}
            onClick={handleGoogle}
          >
            {googleLoading ? null : <GoogleIcon />}
            {googleLoading ? "Opening Google..." : "Continue with Google"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
