import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Button, Logo } from "@/components/ui";
import {
  CopyButton,
  QuoteActions,
  SendEarlyButton,
  type RecoveryStatus,
} from "@/components/quotes";
import { requireUser } from "@/lib/auth/require-user";
import {
  getQuoteById,
  listRemindersForQuote,
  type QuoteRow,
  type ReminderRow,
} from "@/lib/quotes/repo";
import { formatCurrency } from "@/lib/utils/currency";

export const metadata: Metadata = { title: "Quote – Quote Reclaim" };
export const dynamic = "force-dynamic";

type Params = { id: string };

const MONTHLY_PRICE_USD = 79;
const CADENCE_DAYS: Record<1 | 2 | 3, number> = { 1: 1, 2: 3, 3: 7 };

function computeStatus(
  quote: QuoteRow,
  reminders: ReminderRow[],
): RecoveryStatus {
  if (quote.outcome === "won") return "won";
  if (quote.outcome === "closed") return "closed";
  const unsent = reminders.filter((r) => !r.sent);
  if (unsent.length === 0) return "running";
  const allPaused = unsent.every((r) => r.paused_at !== null);
  return allPaused ? "paused" : "running";
}

function nextSendAt(reminders: ReminderRow[]): Date | null {
  const candidates = reminders
    .filter((r) => !r.sent && !r.paused_at)
    .map((r) => new Date(r.send_at))
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? null;
}

function formatSendDate(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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

  const status = computeStatus(quote, reminders);
  const next = status === "running" ? nextSendAt(reminders) : null;

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

      <QuoteSummary quote={quote} status={status} />

      {status === "won" ? <WinCelebration quote={quote} /> : null}

      <RecoveryPlanSection
        reminders={reminders}
        status={status}
        nextDate={next}
        hasPhone={Boolean(quote.client_phone)}
      />
    </main>
  );
}

function QuoteSummary({
  quote,
  status,
}: {
  quote: QuoteRow;
  status: RecoveryStatus;
}) {
  const badge = (() => {
    switch (status) {
      case "won":
        return { variant: "success" as const, label: "Won" };
      case "closed":
        return { variant: "neutral" as const, label: "Closed" };
      case "paused":
        return { variant: "warning" as const, label: "Recovery paused" };
      case "running":
      default:
        return { variant: "brand" as const, label: "Recovery running" };
    }
  })();

  return (
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
        <Badge variant={badge.variant}>{badge.label}</Badge>
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

      {status === "running" || status === "paused" ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
          <QuoteActions quoteId={quote.id} status={status} />
          <Link href={`/quotes/${quote.id}/edit`}>
            <Button variant="ghost" size="sm">
              Edit quote
            </Button>
          </Link>
        </div>
      ) : null}
    </section>
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

function WinCelebration({ quote }: { quote: QuoteRow }) {
  const amount = quote.estimate_amount;
  const months = Math.floor(amount / MONTHLY_PRICE_USD);
  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-xl border border-success/40 bg-success/10 p-6"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-success">
        Quote recovered
      </p>
      <p className="mt-2 text-3xl font-bold text-ink-strong">
        +{formatCurrency(amount)} recovered
      </p>
      {months >= 1 ? (
        <p className="mt-2 text-sm text-ink">
          This one job pays for Quote Reclaim for{" "}
          <span className="font-semibold text-ink-strong">
            {months} {months === 1 ? "month" : "months"}
          </span>
          .
        </p>
      ) : null}
    </section>
  );
}

function RecoveryPlanSection({
  reminders,
  status,
  nextDate,
  hasPhone,
}: {
  reminders: ReminderRow[];
  status: RecoveryStatus;
  nextDate: Date | null;
  hasPhone: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-strong">Recovery plan</h2>
        {status === "running" && nextDate ? (
          <p className="text-xs text-ink-muted">
            Next follow-up sends {formatSendDate(nextDate)}
          </p>
        ) : null}
      </div>

      {(status === "running" || status === "paused") && reminders.length > 0 ? (
        <p className="text-sm text-ink-muted">
          {status === "running"
            ? "We'll send these on schedule. You can pause, copy, or send early later. Quote Reclaim does the chasing — you step in when they reply or the job comes back."
            : "Recovery is paused. Future reminders won't send until you resume."}
        </p>
      ) : null}

      {reminders.length === 0 ? (
        <p className="text-sm text-ink-muted">No recovery plan generated.</p>
      ) : (
        <ol className="space-y-3">
          {reminders.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              recoveryStatus={status}
              hasPhone={hasPhone}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function ReminderCard({
  reminder: r,
  recoveryStatus,
  hasPhone,
}: {
  reminder: ReminderRow;
  recoveryStatus: RecoveryStatus;
  hasPhone: boolean;
}) {
  const sendDate = new Date(r.send_at);
  const isPast = sendDate.getTime() < Date.now();

  let statusVariant: "success" | "warning" | "neutral" | "danger" | "brand" =
    "neutral";
  let statusLabel = "Scheduled";
  if (r.sent) {
    statusVariant = "success";
    statusLabel = "Sent";
  } else if (r.paused_at) {
    statusVariant = "warning";
    statusLabel = "Paused";
  } else if (isPast) {
    statusVariant = "brand";
    statusLabel = "Due";
  }

  const dayLabel =
    CADENCE_DAYS[r.followup_number as 1 | 2 | 3] ?? r.followup_number;

  const sendEarlyDisabled =
    r.sent ||
    r.paused_at !== null ||
    recoveryStatus !== "running" ||
    !hasPhone;

  return (
    <li className="space-y-3 rounded-xl border border-line-subtle bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <span className="text-xs font-bold uppercase tracking-widest text-brand">
            Follow-up {r.followup_number} · Day {dayLabel}
          </span>
          <p className="text-xs text-ink-muted">
            {r.framework_used ?? "—"}
          </p>
        </div>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      <p className="text-sm text-ink">{r.message_text}</p>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-3">
        <p className="text-xs text-ink-muted">
          Scheduled {formatSendDate(sendDate)} · {r.message_type.toUpperCase()}
        </p>
        <div className="flex items-center gap-1">
          <CopyButton text={r.message_text} />
          <SendEarlyButton reminderId={r.id} disabled={sendEarlyDisabled} />
        </div>
      </div>
    </li>
  );
}
