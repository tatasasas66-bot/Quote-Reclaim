import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { QuoteForm } from "@/components/quotes";
import { requireUser } from "@/lib/auth/require-user";
import { getQuoteById } from "@/lib/quotes/repo";
import { updateQuoteAction } from "@/lib/quotes/actions";

export const metadata: Metadata = { title: "Edit quote – Quote Reclaim" };
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function EditQuotePage({
  params,
}: {
  params: Params;
}) {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) redirect("/sign-in");

  const quote = await getQuoteById(supabase, user.id, params.id);
  if (!quote) notFound();

  if (quote.outcome !== "pending") redirect(`/quotes/${params.id}`);

  const boundAction = updateQuoteAction.bind(null, params.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo showWordmark />
        <Link
          href={`/quotes/${params.id}`}
          className="text-sm text-ink-muted hover:text-ink-strong"
        >
          ← Back
        </Link>
      </header>

      <section className="space-y-1">
        <h1 className="text-2xl font-bold text-ink-strong">Edit quote</h1>
        <p className="text-sm text-ink-muted">
          Editing a quote does not change the existing recovery plan schedule.
        </p>
      </section>

      <QuoteForm mode="edit" initial={quote} action={boundAction} />
    </main>
  );
}
