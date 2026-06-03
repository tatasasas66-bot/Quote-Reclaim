import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/onboarding/AuthShell";
import { requireUser } from "@/lib/auth/require-user";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

export const metadata: Metadata = {
  title: "Start free",
  description:
    "Start free with Quote Reclaim. 3 silent quotes free. No credit card.",
};

// Rendered fresh per request so an existing session is always detected and the
// stale `?error=auth_callback_failed` from a first-attempt OAuth race is never
// shown to a signed-in user.
export const dynamic = "force-dynamic";

type SignUpPageProps = {
  searchParams?: { next?: string };
};

/**
 * Same self-heal as /sign-in: if a session cookie is already valid, route the
 * user straight into the app instead of rendering the auth shell.
 */
export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { user } = await requireUser();
  if (user) {
    redirect(safeRedirectPath(searchParams?.next));
  }
  return <AuthShell mode="sign-up" />;
}
