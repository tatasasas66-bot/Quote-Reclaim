import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Button, Logo } from "@/components/ui";
import {
  CopyButton,
  OneTapReplyCard,
  QuietSignalCard,
  QuoteActions,
  ReplyRadarCard,
  SendEarlyButton,
  type RecoveryStatus,
  type ReplyRadarData,
} from "@/components/quotes";
import { computeQuietSignal, valueBandFor } from "@/lib/quotes/quiet-signal";
import {
  getLatestOneTapReply,
  listActiveReplyOptions,
} from "@/lib/quotes/one-tap-reply-server";
import { isReplyIntent } from "@/lib/ai/classify-reply";
import { suggestResponse } from "@/lib/ai/suggest-response";
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
import { formatScheduleDateTime } from "@/lib/quotes/business-hours";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { formatCurrency } from "@/lib/utils/currency";
import { titleCaseName } from "@/lib/utils/title-case";

export const metadata: Metadata = { title: "Quote - Quote Reclaim" };
export const dynamic = "force-dynamic";

type Params = { id: string };

type FollowupStep = 1 | 2 | 3 | 4 | 5;

const CADENCE_DAYS: Record<FollowupStep, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

// Research rationale shown under each step. Contractor-native — names the
// move and the outcome, no academic psychology terms. Replaces an earlier
// version that used "scarcity", "loss aversion", and "reactance".
const WHY_THIS_WORKS: Record<FollowupStep, string> = {
  1: "Asking what didn't land flips you from chaser to helper — and surfaces the real objection instead of begging for a reply.",
  2: "Showing that your schedule has to be managed makes the homeowner choose instead of leaving you hanging.",
  3: "Giving permission to say no feels safer than being pushed — so they rarely take it. Asking 'should I close it' lets the homeowner act instead of staying silent.",
  4: "Most quiet quotes stall on price, not interest. Offering a phased path removes the real barrier without ever dropping your number.",
  5: "Pulling back often gets the reply that pushing could not. Saying you'll close the estimate lets the homeowner re-engage on their own terms.",
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

// Header / badge / footer all render scheduled times through the SAME shared
// formatter (America/Chicago). formatScheduleDateTime lives in business-hours
// alongside the 09:00 send-hour anchor so display and generation can never
// drift onto different timezones — the badge no longer shows UTC "2 PM" next
// to a CT "9:00 AM" footer.
function formatSendDate(date: Date): string {
  return formatScheduleDateTime(date);
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
  // We also pull the open/click counters in the same query so Quiet Signal
  // can compute a stall reason without a second round-trip.
  // Reads via service client to bypass RLS on outbound_messages.
  const serviceClient = createServiceSupabaseClient();
  const { data: outboundRows } = await serviceClient
    .from("outbound_messages")
    .select("id, status, open_count, click_count")
    .eq("quote_id", quote.id);
  const outbound = outboundRows ?? [];
  const hasReplyForQuote = outbound.some((r) => r.status === "replied");
  const totalOpenCount = outbound.reduce(
    (sum, r) => sum + (r.open_count ?? 0),
    0,
  );
  const totalClickCount = outbound.reduce(
    (sum, r) => sum + (r.click_count ?? 0),
    0,
  );

  // Reply Radar: the most recent classified inbound reply for this quote.
  // recovery_events is append-only, so reply_intent was written at capture
  // time by the inbound webhook. Reads via the service client (RLS-bypassing)
  // exactly like the replied-status probe above.
  const { data: replyEventRows } = await serviceClient
    .from("recovery_events")
    .select("reply_text, reply_intent, channel, created_at")
    .eq("quote_id", quote.id)
    .eq("user_id", user.id)
    .eq("event_type", "reply_received")
    .order("created_at", { ascending: false })
    .limit(1);
  const replyEvent = (replyEventRows ?? [])[0];
  const replyRadar: ReplyRadarData | null =
    replyEvent && isReplyIntent(replyEvent.reply_intent)
      ? {
          clientName: titleCaseName(quote.client_name),
          replyText: String(replyEvent.reply_text ?? ""),
          channel:
            replyEvent.channel === "sms" || replyEvent.channel === "email"
              ? replyEvent.channel
              : undefined,
          suggestion: suggestResponse({
            intent: replyEvent.reply_intent,
            trade: quote.trade,
            estimateAmount: quote.estimate_amount,
            clientName: quote.client_name,
          }),
        }
      : null;

  // Quiet Signal: deterministic stall-reason diagnosis from existing signals.
  // No LLM, no cohort, no plan swap — see src/lib/quotes/quiet-signal.ts.
  const quietSignal = computeQuietSignal({
    outcome: (quote.outcome ?? "pending") as "pending" | "won" | "closed",
    optedOut: Boolean(quote.client_opted_out),
    trade: quote.trade,
    estimateAmount: quote.estimate_amount,
    valueBand: valueBandFor(quote.estimate_amount),
    // Use the live elapsed days (same value that drives the At Risk / Critical
    // band) so Quiet Signal can never read "calm" while the header shows a
    // long-quiet, at-risk quote.
    daysSilent: effectiveDaysSilent(quote),
    followupsSent: reminders.filter((r) => r.sent).length,
    hasReply: hasReplyForQuote,
    replyIntent: isReplyIntent(replyEvent?.reply_intent)
      ? replyEvent.reply_intent
      : null,
    openCount: totalOpenCount,
    clickCount: totalClickCount,
  });

  // One-Tap Reply state for this quote.
  const [latestOneTapReply, oneTapOptions] = await Promise.all([
    getLatestOneTapReply(serviceClient, String(quote.id)),
    listActiveReplyOptions(serviceClient, String(quote.id)),
  ]);
  const clientFirstName = titleCaseName(quote.client_name).split(/\s+/)[0] || "Customer";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 bg-canvas px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between border-b border-line-subtle/80 pb-5">
        <Link
          href="/dashboard"
          aria-label="Quote Reclaim home"
          className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Logo showWordmark />
        </Link>
        <Link
          href="/dashboard"
          className="rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Dashboard
        </Link>
      </header>

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          Silent Quote Command
        </p>
        <p className="mt-2 max-w-2xl text-base leading-7 text-ink">
          This estimate went quiet. Here&apos;s what it&apos;s worth, how much is
          at risk, and the next move that makes the most sense right now.
        </p>
      </div>

      <QuoteSummary
        quote={quote}
        status={status}
        hasReplyForQuote={hasReplyForQuote}
        allTimeRecovered={allTimeRecovered}
      />

      <QuietSignalCard signal={quietSignal} />
      <OneTapReplyCard
        quoteId={String(quote.id)}
        clientFirstName={clientFirstName}
        latestReply={latestOneTapReply}
        options={oneTapOptions}
      />
      <ReplyRadarCard reply={replyRadar} />

      <RecoveryPlanSection
        reminders={reminders}
        status={status}
        nextDate={next}
        hasPhone={Boolean(quote.client_phone)}
        hasEmail={Boolean(quote.client_email)}
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
          numeric
        />
        <IntelligenceField label="Days quiet" value={String(daysQuiet)} numeric />
        <IntelligenceField label="Recovery Priority" value={score.label} />
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

function IntelligenceField({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  // Text values (email, description, action labels) wrap with `break-words`
  // so nothing clips mid-word. Numeric/currency values use `whitespace-nowrap`
  // + `tabular-nums` so "$4,000" can never break across lines into "$4,00" /
  // "0" — every digit stays on one line.
  const valueClass = numeric
    ? "mt-1 whitespace-nowrap tabular-nums text-sm font-bold text-ink-strong"
    : "mt-1 break-words text-sm font-bold text-ink-strong";
  return (
    <div className="min-w-0 rounded-lg border border-line-subtle bg-canvas/35 p-3">
      <dt className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
        {label}
      </dt>
      <dd className={valueClass}>{value}</dd>
    </div>
  );
}

function RecoveryPlanSection({
  reminders,
  status,
  nextDate,
  hasPhone,
  hasEmail,
  hasReplyForQuote,
}: {
  reminders: ReminderRow[];
  status: RecoveryStatus;
  nextDate: Date | null;
  hasPhone: boolean;
  hasEmail: boolean;
  hasReplyForQuote: boolean;
}) {
  // Email channel = automated via Resend on the cron schedule, only when
  // there's an address on file. No email = copy mode (contractor sends
  // manually from their phone). The intro picks the truthful sentence.
  const runningIntro = hasEmail
    ? "Quote Reclaim sends these follow-ups by email on schedule. Step in when they reply or the job comes back."
    : "Your recovery plan is ready. Copy each message and send it from your phone — Quote Reclaim tracks the timing for you.";

  // NEXT MOVE — the one unmistakable answer to "what happens next with this
  // quote, and do I have to do it?" Derived from the soonest unsent, unpaused
  // reminder; copy mode tells the contractor it's their send, email mode says
  // the system has it. Renders only while recovery is running.
  const nextReminder = reminders
    .filter((r) => !r.sent && !r.paused_at)
    .sort((a, b) => Date.parse(a.send_at) - Date.parse(b.send_at))[0];

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

      {status === "running" && nextReminder ? (
        <div
          data-testid="next-move-banner"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-brand/40 bg-surface-1 px-4 py-3.5"
        >
          <span className="text-[11px] font-black uppercase tracking-widest text-brand">
            Next move
          </span>
          {nextReminder.message_type === "email" && hasEmail ? (
            <p className="min-w-0 flex-1 text-sm leading-6 text-ink">
              Follow-up {nextReminder.followup_number} sends by email{" "}
              <span className="font-bold text-ink-strong">
                {formatSendDate(new Date(nextReminder.send_at))}
              </span>
              . Nothing to send by hand — step in when they reply.
            </p>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-sm leading-6 text-ink">
                Follow-up {nextReminder.followup_number} is yours to send —
                scheduled{" "}
                <span className="font-bold text-ink-strong">
                  {formatSendDate(new Date(nextReminder.send_at))}
                </span>
                . Copy it and send from your phone.
              </p>
              <a
                href={`#followup-${nextReminder.followup_number}`}
                className="whitespace-nowrap rounded text-sm font-bold text-brand hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Jump to the message →
              </a>
            </>
          )}
        </div>
      ) : null}

      {(status === "running" || status === "paused") && reminders.length > 0 ? (
        <p className="max-w-3xl text-sm leading-6 text-ink-muted">
          {status === "running"
            ? runningIntro
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
              hasEmail={hasEmail}
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
  hasEmail,
  allReminders,
  hasReplyForQuote,
}: {
  reminder: ReminderRow;
  recoveryStatus: RecoveryStatus;
  hasPhone: boolean;
  hasEmail: boolean;
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
    CADENCE_DAYS[r.followup_number as FollowupStep] ?? r.followup_number;

  const messageType: "email" | "sms" = r.message_type === "email" ? "email" : "sms";
  const hasRecipientForChannel = messageType === "email" ? hasEmail : hasPhone;

  const sendEarlyDisabled =
    r.sent ||
    r.paused_at !== null ||
    recoveryStatus !== "running" ||
    !hasRecipientForChannel;

  // Copy-only mode (no email, no phone): hide Send early entirely so Copy is
  // the only obvious action.
  const showSendEarly = hasEmail || hasPhone;

  return (
    <li
      id={`followup-${r.followup_number}`}
      className="scroll-mt-20 rounded-lg border border-line-subtle bg-surface-1 shadow-[0_16px_46px_rgba(0,0,0,0.2)]"
    >
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
        {WHY_THIS_WORKS[r.followup_number as FollowupStep]}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle px-4 py-3">
        <p className="text-xs text-ink-muted">
          Scheduled {formatSendDate(sendDate)} · {r.message_type.toUpperCase()}
        </p>
        <div className="flex items-center gap-1">
          <CopyButton text={r.message_text} />
          {showSendEarly ? (
            <SendEarlyButton
              reminderId={r.id}
              disabled={sendEarlyDisabled}
              messageType={messageType}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}
