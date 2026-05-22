import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, Button, Logo } from "@/components/ui";
import { requireUser } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Dashboard",
};

// Force dynamic so the requireUser session read isn't cached.
export const dynamic = "force-dynamic";

export default async function DashboardPlaceholder() {
  const { user } = await requireUser();
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="flex items-center justify-between">
        <Logo showWordmark />
        <Badge variant="warning">Phase 9 placeholder</Badge>
      </header>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          Recovery Dashboard
        </p>
        <h1 className="text-3xl font-bold text-ink-strong">
          You&apos;re signed in.
        </h1>
        <p className="text-ink">
          The real dashboard — Still Bleeding hero, metric cards, the recovery
          queue, the Intelligence Panel — lands in Phase 9. This stub exists so
          that the magic link and Google OAuth callbacks have somewhere to
          land.
        </p>
        <p className="text-sm text-ink-muted">
          Signed in as{" "}
          <span className="font-medium text-ink-strong">{user.email}</span>
        </p>
      </section>

      <section>
        <form action="/api/auth/sign-out" method="post">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </section>
    </main>
  );
}
