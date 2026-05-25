"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { Button } from "@/components/ui";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

// Scanner-safe landing gate. Email security tools that GET-prefetch links
// won't click a button, so the one-time token survives until the human
// presses "Confirm Secure Sign-In". Only then do we call verifyOtp.
export function ConfirmClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "magiclink") as EmailOtpType;

  const [verifying, setVerifying] = React.useState(false);

  async function handleConfirm() {
    if (!tokenHash) return;
    setVerifying(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (error) throw error;
      router.replace("/dashboard");
    } catch {
      router.replace("/sign-in?error=link_expired");
    }
  }

  const linkIncomplete = !tokenHash;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0B0F12] px-6 text-center">
      <div className="w-full max-w-sm space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
          Silent Quote Command
        </p>

        {linkIncomplete ? (
          <div
            role="alert"
            aria-live="polite"
            className="space-y-3 rounded-xl border border-danger/40 bg-danger/10 p-5"
          >
            <p className="text-sm font-semibold text-danger">
              This sign-in link is incomplete or invalid.
            </p>
            <p className="text-sm text-ink">
              Send a fresh sign-in link from the sign-in page.
            </p>
            <a
              href="/sign-in"
              className="inline-block text-sm font-medium text-ink-strong underline"
            >
              Return to sign in
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold text-ink-strong">
              Confirm your secure sign-in
            </h1>
            <Button
              type="button"
              size="lg"
              fullWidth
              loading={verifying}
              onClick={handleConfirm}
            >
              {verifying ? "Verifying..." : "Confirm Secure Sign-In"}
            </Button>
            <p className="text-sm text-ink-muted">
              No password required. Your security command is verifying your
              identity.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
