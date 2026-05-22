import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { QuoteForm } from "@/components/quotes";
import { requireUser } from "@/lib/auth/require-user";
import { createQuoteAction } from "@/lib/quotes/actions";

export const metadata: Metadata = { title: "New quote – Quote Reclaim" };
export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const { user } = await requireUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo showWordmark />
        <Link
          href="/dashboard"
          className="text-sm text-ink-muted hover:text-ink-strong"
        >
          ← Back
        </Link>
      </header>

      <section className="space-y-1">
        <h1 className="text-2xl font-bold text-ink-strong">Add a silent quote</h1>
        <p className="text-sm text-ink-muted">
          We&apos;ll build a 3-step recovery plan and schedule follow-ups
          automatically.
        </p>
      </section>

      <QuoteForm mode="create" action={createQuoteAction} />
    </main>
  );
}
