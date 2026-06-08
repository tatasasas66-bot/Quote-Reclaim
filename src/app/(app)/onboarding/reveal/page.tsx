import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getProfileStats, listPendingQuotes } from "@/lib/quotes/repo";
import { RevealClient } from "./RevealClient";

export const metadata: Metadata = {
  title: "Find the money sitting quiet — Quote Reclaim",
};

export const dynamic = "force-dynamic";

export default async function OnboardingRevealPage() {
  const { user, supabase } = await requireUser();
  // Preserve the destination through auth so a prospect clicking the
  // "Try the free Silent Quote Audit first ->" CTA lands back here right
  // after sign-up instead of getting dropped on the default /dashboard.
  if (!user || !supabase) {
    redirect("/sign-up?next=/onboarding/reveal");
  }

  const [profile, pending] = await Promise.all([
    getProfileStats(supabase, user.id),
    listPendingQuotes(supabase, user.id),
  ]);
  const usage = profile?.usage_count ?? 0;
  const isPaid = Boolean(profile?.is_paid);
  const pendingCount = pending.length;

  return (
    <RevealClient
      isPaid={isPaid}
      usageCount={usage}
      pendingCount={pendingCount}
    />
  );
}
