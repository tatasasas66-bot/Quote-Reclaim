import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app/AppHeader";
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
      <AppHeader />

      <section className="space-y-1">
        <Link
          href={`/quotes/${params.id}`}
          className="inline-flex min-h-10 items-center rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          ← Back to recovery plan
        </Link>
        <h1 className="text-2xl font-bold text-ink-strong">Edit quote</h1>
        <p className="text-sm text-ink-muted">
          Editing a quote does not change the existing recovery plan schedule.
        </p>
      </section>

      <QuoteForm mode="edit" initial={quote} action={boundAction} />
    </main>
  );
}
