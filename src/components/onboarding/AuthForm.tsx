"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
};

const CALLBACK_PATH = "/api/auth/callback";

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
    case "auth_callback_failed":
      return "We couldn't finish signing you in. Try the link again or use Google.";
    case "missing_code":
      return "That link expired or was already used. Send a new one.";
    default:
      return "Sign-in error. Try again.";
  }
}

const GOOGLE_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

export function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const callbackError = describeCallbackError(searchParams.get("error"));
  const auditToken = searchParams.get("audit_token") ?? undefined;

  const [email, setEmail] = React.useState("");
  const [magicLoading, setMagicLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [magicSent, setMagicSent] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const callbackUrl = React.useMemo(() => {
    const base =
      process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ??
      (typeof window !== "undefined"
        ? `${window.location.origin}${CALLBACK_PATH}`
        : CALLBACK_PATH);
    if (auditToken) {
      const sep = base.includes("?") ? "&" : "?";
      const next = encodeURIComponent(`/dashboard?audit_token=${auditToken}`);
      return `${base}${sep}next=${next}`;
    }
    return base;
  }, [auditToken]);

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
      setMagicSent(true);
    } catch {
      setFormError("Could not send the link. Try again or use Google.");
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
        options: { redirectTo: callbackUrl },
      });
      if (error) throw error;
      // Browser is being redirected; keep the loading state.
    } catch {
      setFormError("Could not start Google sign-in. Try Magic Link instead.");
      setGoogleLoading(false);
    }
  }

  return (
    <div className="space-y-5">
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
          <p className="font-semibold text-success">Secure link sent.</p>
          <p className="mt-1 text-ink">
            Check{" "}
            <span className="font-medium text-ink-strong">{email}</span> for a
            magic link from Quote Reclaim. It expires in 60 minutes.
          </p>
          <button
            type="button"
            className="mt-3 text-xs text-ink-muted underline hover:text-ink-strong"
            onClick={() => {
              setMagicSent(false);
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
            error={formError ?? undefined}
          />
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={magicLoading}
            disabled={googleLoading}
          >
            {magicLoading
              ? "Sending secure link…"
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
            {googleLoading ? "Opening Google…" : "Continue with Google"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
