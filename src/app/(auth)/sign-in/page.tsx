import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/onboarding/AuthShell";
import { requireUser } from "@/lib/auth/require-user";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Quote Reclaim with a secure email link. No password.",
};

// Rendered fresh per request so an existing session is always detected and the
// stale `?error=auth_callback_failed` from a first-attempt OAuth race is never
// shown to a signed-in user.
export const dynamic = "force-dynamic";

type SignInPageProps = {
  searchParams?: { next?: string };
};

/**
 * If a Supabase session cookie is already present (e.g., the OAuth callback
 * succeeded server-side and the browser somehow ended up back on /sign-in with
 * a stale ?error= param), short-circuit to the dashboard. Otherwise render the
 * normal auth shell. Never weakens auth: we require a real `user` row.
 */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { user } = await requireUser();
  if (user) {
    redirect(safeRedirectPath(searchParams?.next));
  }
  return <AuthShell mode="sign-in" />;
}
