import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/AppHeader";
import { CrewGapClient } from "./CrewGapClient";
import { requireUser } from "@/lib/auth/require-user";
import {
  getProfileStats,
  listPendingQuotes,
} from "@/lib/quotes/repo";
import { FREE_PLAN_LIMIT } from "@/lib/payments/entitlement";

export const metadata: Metadata = {
  title: "Crew Gap Rescue - Quote Reclaim",
  description:
    "Find the quiet quote most likely to fill an upcoming crew gap.",
};
export const dynamic = "force-dynamic";

export default async function CrewGapPage() {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) redirect("/sign-in");

  const [pending, profile] = await Promise.all([
    listPendingQuotes(supabase, user.id),
    getProfileStats(supabase, user.id),
  ]);

  const isPaid = Boolean(profile?.is_paid);
  const usageCount = profile?.usage_count ?? 0;
  const freeRemaining = isPaid
    ? Number.POSITIVE_INFINITY
    : Math.max(0, FREE_PLAN_LIMIT - usageCount);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 bg-canvas px-4 py-8 sm:px-6 lg:px-8">
      <AppHeader />
      <section className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-widest text-brand">
          Crew Gap Rescue
        </p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-ink-strong sm:text-5xl">
          Fill your next open crew day from quotes that already went quiet.
        </h1>
        <p className="mt-4 text-base leading-7 text-ink">
          Built for home-service contractors who already quoted the work. Enter
          the crew gap, then Quote Reclaim ranks the quiet estimates in your
          queue and gives you the practical follow-up to send.
        </p>
      </section>

      <CrewGapClient
        quotes={pending}
        isPaid={isPaid}
        freeRemaining={freeRemaining}
      />
    </main>
  );
}
