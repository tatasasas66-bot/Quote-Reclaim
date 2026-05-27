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
import { nextBestAction } from "@/lib/quotes/next-best-action";
import {
  getProfileStats,
  getQuoteById,
  listRemindersForQuote,
  type QuoteRow,
  type ReminderRow,
} from "@/lib/quotes/repo";
import { getRecoveryScore } from "@/lib/quotes/recovery-score";
import { computeStepDisplay } from "@/lib/quotes/step-status";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { formatCurrency } from "@/lib/utils/currency";
import { titleCaseName } from "@/lib/utils/title-case";

export const metadata: Metadata = { title: "Quote - Quote Reclaim" };
export const dynamic = "force-dynamic";

type Params = { id: string };

const CADENCE_DAYS: Record<1 | 2 | 3, number> = { 1: 1, 2: 3, 3: 7 };

// Research rationale shown under each step so the contractor trusts the
// message instead of seeing "AI text". Keyed by follow-up number.
const WHY_THIS_WORKS: Record<1 | 2 | 3, string> = {
  1: "Surfaces real objections — scope, materials, price — without begging.",
  2: "Schedule scarcity flips the dynamic. You're the prize, not the supplicant.",
  3: "A 'No' answer feels safer than ignoring. That's how silent quotes break.",
};

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

  const [quote, reminders, profile] = await Promise.all([
    getQuoteById(supabase, user.id, params.id),
    listRemindersForQuote(supabase, user.id, params.id),
    getProfileStats(supabase, user.id),
  ]);

  if (!quote) notFound();

  const allTimeRecovered = profile?.recovered_amount ?? 0;

  const status = computeStatus(quote, reminders);
  const next = status === "running" ? nextSendAt(reminders) : null;

  // Was there any inbound reply for this quote? Used to flip per-step status
  // to "Paused - customer replied" without flagging the sequence as ended.
  // Reads via service client to bypass RLS on outbound_messages.
  const serviceClient = createServiceSupabaseClient();
  const { data: replyRows } = await serviceClient
    .from("outbound_messages")
    .select("id")
    .eq("quote_id", quote.id)
    .eq("status", "replied")
    .limit(1);
  const hasReplyForQuote = (replyRows ?? []).length > 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 bg-canvas px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between border-b border-line-subtle/80 pb-5">
        <Logo showWordmark />
        <Link
          href="/dashboard"
          className="rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Dashboard
        </Link>
      </header>

      <QuoteSummary
        quote={quote}
        status={status}
        hasReplyForQuote={hasReplyForQuote}
        allTimeRecovered={allTimeRecovered}
      />

      <RecoveryPlanSection
        reminders={reminders}
        status={status}
        nextDate={next}
        hasPhone={Boolean(quote.client_phone)}
        hasReplyForQuote={hasReplyForQuote}
      />
    </main>
  );
}

function QuoteSummary({
  quote,
  status,
  hasReplyForQuote,
  allTimeRecovered,
}: {
  quote: QuoteRow;
  status: RecoveryStatus;
  hasReplyForQuote: boolean;
  allTimeRecovered: number;
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

  const score = getRecoveryScore(quote);
  const scoreBadgeVariant: "success" | "warning" | "danger" | "neutral" =
    score.tone === "success"
      ? "success"
      : score.tone === "warning"
        ? "warning"
        : score.tone === "danger"
          ? "danger"
          : "neutral";
  const daysQuiet = effectiveDaysSilent(quote);
  const nba = nextBestAction(quote, hasReplyForQuote);

  return (
    <section className="rounded-lg border border-line-subtle bg-surface-1 shadow-[0_24px_74px_rgba(0,0,0,0.32)]">
      <div className="grid gap-5 border-b border-line-subtle p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={scoreBadgeVariant}>{score.label}</Badge>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <h1 className="mt-3 truncate text-4xl font-black text-ink-strong">
            {titleCaseName(quote.client_name)}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {titleCaseName(quote.trade)}
            {quote.city ? ` · ${titleCaseName(quote.city)}` : ""}
            {quote.state ? `, ${quote.state.toUpperCase()}` : ""}
          </p>
        </div>

        <div className="lg:text-right">
          <p className="text-xs font-black uppercase tracking-widest text-warning">
            Amount still sitting quiet
          </p>
          <p className="mt-2 text-5xl font-black text-ink-strong tabular-nums">
            {formatCurrency(quote.estimate_amount)}
          </p>
        </div>
      </div>

      <dl className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-5">
        <IntelligenceField
          label="Amount quiet"
          value={formatCurrency(quote.estimate_amount)}
        />
        <IntelligenceField label="Days quiet" value={String(daysQuiet)} />
        <IntelligenceField
          label="Recovery Priority"
          value={`${score.score} · ${score.label}`}
        />
        <IntelligenceField
          label="Next Best Action"
          value={nba?.label ?? "Review plan"}
        />
        <IntelligenceField label="Status" value={badge.label} />
        {quote.client_email ? (
          <IntelligenceField label="Email" value={quote.client_email} />
        ) : null}
        {quote.client_phone ? (
          <IntelligenceField label="Phone" value={quote.client_phone} />
        ) : null}
        {quote.job_description ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <IntelligenceField label="Description" value={quote.job_description} />
          </div>
        ) : null}
      </dl>

      {status === "running" || status === "paused" ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle p-5 sm:p-6">
          <QuoteActions
            quoteId={quote.id}
            status={status}
            amount={quote.estimate_amount}
            allTimeRecovered={allTimeRecovered}
          />
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

function IntelligenceField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line-subtle bg-canvas/35 p-3">
      <dt className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-bold text-ink-strong">{value}</dd>
    </div>
  );
}

function RecoveryPlanSection({
  reminders,
  status,
  nextDate,
  hasPhone,
  hasReplyForQuote,
}: {
  reminders: ReminderRow[];
  status: RecoveryStatus;
  nextDate: Date | null;
  hasPhone: boolean;
  hasReplyForQuote: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Recovery Messages
          </p>
          <h2 className="mt-1 text-2xl font-black text-ink-strong">
            Recovery plan
          </h2>
        </div>
        {status === "running" && nextDate ? (
          <p className="rounded-md border border-line-subtle bg-surface-1 px-3 py-2 text-xs font-semibold text-ink-muted">
            Next follow-up sends {formatSendDate(nextDate)}
          </p>
        ) : null}
      </div>

      {(status === "running" || status === "paused") && reminders.length > 0 ? (
        <p className="max-w-3xl text-sm leading-6 text-ink-muted">
          {status === "running"
            ? "Your recovery plan is ready. Copy a message now, or connect sending automation to let Quote Reclaim handle the chasing."
            : "Recovery is paused. Future reminders won't send until you resume."}
        </p>
      ) : null}

      {reminders.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-surface-1 p-5 text-sm text-ink-muted">
          No recovery plan generated.
        </p>
      ) : (
        <ol className="grid gap-3">
          {reminders.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              recoveryStatus={status}
              hasPhone={hasPhone}
              allReminders={reminders}
              hasReplyForQuote={hasReplyForQuote}
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
  allReminders,
  hasReplyForQuote,
}: {
  reminder: ReminderRow;
  recoveryStatus: RecoveryStatus;
  hasPhone: boolean;
  allReminders: ReminderRow[];
  hasReplyForQuote: boolean;
}) {
  const sendDate = new Date(r.send_at);
  const display = computeStepDisplay(r, allReminders, hasReplyForQuote);
  // Only one reminder per quote is "due" - the soonest unsent one - so the
  // contractor sees one clear next action, never two "Due" badges stacked.
  const statusVariant: "success" | "warning" | "neutral" | "danger" | "brand" =
    display.tone === "rust"
      ? "brand"
      : display.tone === "success"
        ? "success"
        : display.tone === "warning"
          ? "warning"
          : display.tone === "danger"
            ? "danger"
            : "neutral";
  const statusLabel = display.label;

  const dayLabel =
    CADENCE_DAYS[r.followup_number as 1 | 2 | 3] ?? r.followup_number;

  const sendEarlyDisabled =
    r.sent ||
    r.paused_at !== null ||
    recoveryStatus !== "running" ||
    !hasPhone;

  return (
    <li className="rounded-lg border border-line-subtle bg-surface-1 shadow-[0_16px_46px_rgba(0,0,0,0.2)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-4 py-3">
        <div className="space-y-0.5">
          <span className="text-xs font-black uppercase tracking-widest text-brand">
            Follow-up {r.followup_number} · Day {dayLabel}
          </span>
          <p className="text-xs text-ink-muted">
            {r.framework_used ?? "Manual recovery message"}
          </p>
        </div>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      <p className="whitespace-pre-wrap px-4 pt-4 text-sm leading-7 text-ink-strong">
        {r.message_text}
      </p>

      <p className="mt-3 px-4 pb-4 text-xs italic text-ink-muted">
        <span className="font-semibold not-italic">Why this works:</span>{" "}
        {WHY_THIS_WORKS[r.followup_number as 1 | 2 | 3]}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle px-4 py-3">
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
