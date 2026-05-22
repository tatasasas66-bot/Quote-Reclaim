import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, Logo } from "@/components/ui";
import { QuoteListItem } from "@/components/quotes";
import { requireUser } from "@/lib/auth/require-user";
import { listPendingQuotes, getProfileStats } from "@/lib/quotes/repo";
import { formatCurrency } from "@/lib/utils/currency";

export const metadata: Metadata = { title: "Dashboard – Quote Reclaim" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) redirect("/sign-in");

  const [pending, profile] = await Promise.all([
    listPendingQuotes(supabase, user.id),
    getProfileStats(supabase, user.id),
  ]);

  const jobsWon = profile?.jobs_won ?? 0;
  const recovered = profile?.recovered_amount ?? 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo showWordmark />
        <form action="/api/auth/sign-out" method="post">
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Quotes won" value={String(jobsWon)} />
        <StatCard label="Revenue recovered" value={formatCurrency(recovered)} />
        <StatCard
          label="In recovery queue"
          value={String(pending.length)}
          accent={pending.length > 0}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-ink-strong">Recovery queue</h1>
          <Link href="/quotes/new">
            <Button size="sm">+ New quote</Button>
          </Link>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-subtle bg-surface-2 px-6 py-10 text-center">
            <p className="font-medium text-ink">No silent quotes yet.</p>
            <p className="mt-1 text-sm text-ink-muted">
              Add a quote to start building your recovery plan.
            </p>
            <Link href="/quotes/new" className="mt-4 inline-block">
              <Button size="sm">Add your first quote</Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line-subtle bg-surface-2">
            {pending.map((q) => (
              <QuoteListItem key={q.id} quote={q} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? "border-brand/40 bg-brand/5"
          : "border-line-subtle bg-surface-2"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-ink-strong">{value}</p>
    </div>
  );
}
