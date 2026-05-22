import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Button, Logo } from "@/components/ui";
import { QuoteActions } from "@/components/quotes";
import { requireUser } from "@/lib/auth/require-user";
import {
  getQuoteById,
  listRemindersForQuote,
  type ReminderRow,
} from "@/lib/quotes/repo";
import { formatCurrency } from "@/lib/utils/currency";

export const metadata: Metadata = { title: "Quote – Quote Reclaim" };
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function QuoteDetailPage({
  params,
}: {
  params: Params;
}) {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) redirect("/sign-in");

  const [quote, reminders] = await Promise.all([
    getQuoteById(supabase, user.id, params.id),
    listRemindersForQuote(supabase, user.id, params.id),
  ]);

  if (!quote) notFound();

  const isPending = quote.outcome === "pending";
  const isWon = quote.outcome === "won";

  const outcomeVariant = isWon ? "success" : isPending ? "warning" : "neutral";
  const outcomeLabel = isWon ? "Won" : isPending ? "Pending" : "Closed";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo showWordmark />
        <Link
          href="/dashboard"
          className="text-sm text-ink-muted hover:text-ink-strong"
        >
          ← Dashboard
        </Link>
      </header>

      <section className="space-y-4 rounded-xl border border-line-subtle bg-surface-2 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink-strong">
              {quote.client_name}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {quote.trade}
              {quote.city ? ` · ${quote.city}` : ""}
              {quote.state ? `, ${quote.state}` : ""}
            </p>
          </div>
          <Badge variant={outcomeVariant}>{outcomeLabel}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Estimate" value={formatCurrency(quote.estimate_amount)} />
          <Field label="Days silent" value={String(quote.days_silent)} />
          {quote.client_email ? (
            <Field label="Email" value={quote.client_email} />
          ) : null}
          {quote.client_phone ? (
            <Field label="Phone" value={quote.client_phone} />
          ) : null}
          {quote.job_description ? (
            <div className="col-span-full">
              <Field label="Description" value={quote.job_description} />
            </div>
          ) : null}
        </dl>

        {isPending ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
            <QuoteActions quoteId={quote.id} />
            <Link href={`/quotes/${quote.id}/edit`}>
              <Button variant="secondary" size="sm">
                Edit
              </Button>
            </Link>
          </div>
        ) : null}
        {isWon ? (
          <p className="border-t border-line-subtle pt-4 text-sm text-success">
            Won on {new Date(quote.won_at!).toLocaleDateString()}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink-strong">Recovery plan</h2>
        {reminders.length === 0 ? (
          <p className="text-sm text-ink-muted">No recovery plan generated.</p>
        ) : (
          <ol className="space-y-3">
            {reminders.map((r) => (
              <ReminderCard key={r.id} reminder={r} />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink-strong">{value}</dd>
    </div>
  );
}

function ReminderCard({ reminder: r }: { reminder: ReminderRow }) {
  const sendDate = new Date(r.send_at);
  const isPast = sendDate < new Date();

  let statusVariant: "success" | "warning" | "neutral" | "danger" = "neutral";
  let statusLabel = "Scheduled";
  if (r.sent) {
    statusVariant = "success";
    statusLabel = "Sent";
  } else if (r.paused_at) {
    statusVariant = "neutral";
    statusLabel = "Paused";
  } else if (isPast) {
    statusVariant = "warning";
    statusLabel = "Due";
  }

  return (
    <li className="rounded-xl border border-line-subtle bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-bold uppercase tracking-widest text-brand">
          Follow-up {r.followup_number} · Day{" "}
          {r.followup_number === 1 ? 1 : r.followup_number === 2 ? 3 : 7}
        </span>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>
      <p className="mt-2 text-sm text-ink">{r.message_text}</p>
      <p className="mt-2 text-xs text-ink-muted">
        Scheduled{" "}
        {sendDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}{" "}
        · {r.message_type.toUpperCase()}
      </p>
    </li>
  );
}
