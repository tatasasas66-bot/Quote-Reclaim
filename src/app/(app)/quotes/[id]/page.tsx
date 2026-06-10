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
  computeNextMove,
  nextMoveInstruction,
  nextMoveSummaryLabel,
  type NextMove,
} from "@/lib/quotes/next-move";
import { tradeLocationLine } from "@/lib/quotes/quote-display";
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

// Rationale shown under each step. Contractor-native, plain English, and
// careful about what it claims: it explains the move's mechanics (effort,
// clarity, choice) — it never asserts why THIS homeowner went quiet, because
// the app usually has no signal to back that up.
const WHY_THIS_WORKS: Record<FollowupStep, string> = {
  1: "Asking which part to break down is easier to answer than 'any update?' — it gives them a specific, low-effort way back into the conversation.",
  2: "A schedule question has a real answer. Keep it active or set it aside is a choice they can make in five seconds without committing to the job.",
  3: "A clear keep-it-open-or-close-it-out question makes a reply easier than more silence — and saying no is allowed, which is what makes saying anything feel safe.",
  4: "It lowers the effort to reply. Instead of asking them to approve the whole job, it lets them point at the one piece that still needs clarification.",
  5: "A respectful close-out takes the pressure off both sides. The door stays open, so replying later is easy — nothing ended badly.",
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

  // THE next actionable follow-up — single source of truth for the summary
  // grid's Next Best Action, Quiet Signal's Best next move, the recovery
  // plan's NEXT MOVE banner, the highlighted card, and the send button.
  const move = computeNextMove({
    status,
    reminders,
    hasEmail: Boolean(quote.client_email),
    hasReply: hasReplyForQuote,
  });

  // Quiet Signal: deterministic stall-reason diagnosis from existing signals.
  // No LLM, no cohort, no plan swap — see src/lib/quotes/quiet-signal.ts.
  const quietSignalRaw = computeQuietSignal({
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
  // When the engine recommends a sequence follow-up, align its Best Next
  // Move with the unified next actionable follow-up. The diagnosis (reason +
  // evidence) is the engine's; the ACTION is the shared one, so Quiet Signal
  // can never tell the contractor to jump the sequence while the plan below
  // highlights a different message. Reply-backed moves that point outside
  // the cadence (Reply Radar, hold-the-schedule) pass through untouched.
  const unifiedInstruction = nextMoveInstruction(move);
  const quietSignal =
    quietSignalRaw &&
    quietSignalRaw.recommendedFollowupNumber !== null &&
    move.kind !== "none" &&
    unifiedInstruction
      ? {
          ...quietSignalRaw,
          recommendedMove: unifiedInstruction,
          recommendedFollowupNumber:
            move.followupNumber as 1 | 2 | 3 | 4 | 5,
        }
      : quietSignalRaw;

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
        move={move}
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
        move={move}
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
  move,
}: {
  quote: QuoteRow;
  status: RecoveryStatus;
  hasReplyForQuote: boolean;
  allTimeRecovered: number;
  move: NextMove;
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
  // Plan-aware next action: the same source of truth as the NEXT MOVE banner
  // and Quiet Signal. The band-based label is only the fallback for states
  // with no actionable reminder (reply in hand, plan missing).
  const nba = nextBestAction(quote, hasReplyForQuote);
  const nextActionLabel =
    nextMoveSummaryLabel(move) ?? nba?.label ?? "Review plan";

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
            {tradeLocationLine(quote.trade, quote.city, quote.state)}
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
        <IntelligenceField label="Next Best Action" value={nextActionLabel} />
        <IntelligenceField label="Status" value={badge.label} />
        {quote.client_email ? (
          <IntelligenceField label="Email" value={quote.client_email} truncate />
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
  truncate = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  truncate?: boolean;
}) {
  // Text values (description, action labels) wrap with `break-words` so
  // nothing clips mid-word. Numeric/currency values use `whitespace-nowrap`
  // + `tabular-nums` so "$4,000" can never break across lines. Emails use
  // `truncate` — a mid-address wrap ("jessica.brown@exam / ple.com") reads
  // broken; one line with an ellipsis + full value on hover reads intended.
  const valueClass = numeric
    ? "mt-1 whitespace-nowrap tabular-nums text-sm font-bold text-ink-strong"
    : truncate
      ? "mt-1 truncate text-sm font-bold text-ink-strong"
      : "mt-1 break-words text-sm font-bold text-ink-strong";
  return (
    <div className="min-w-0 rounded-lg border border-line-subtle bg-canvas/35 p-3">
      <dt className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
        {label}
      </dt>
      <dd className={valueClass} title={truncate ? value : undefined}>
        {value}
      </dd>
    </div>
  );
}

function RecoveryPlanSection({
  reminders,
  status,
  nextDate,
  move,
  hasPhone,
  hasEmail,
  hasReplyForQuote,
}: {
  reminders: ReminderRow[];
  status: RecoveryStatus;
  nextDate: Date | null;
  move: NextMove;
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

  // The schedule chip mirrors the channel: "sends" is only true for email
  // mode; copy mode says "scheduled" because the contractor does the sending.
  // A customer reply auto-pauses the cadence, so the chip goes quiet too —
  // claiming a send date while the sequence is reply-held would be false.
  const scheduleChip =
    status === "running" && nextDate && !hasReplyForQuote
      ? hasEmail
        ? `Next follow-up sends ${formatSendDate(nextDate)}`
        : `Next follow-up scheduled ${formatSendDate(nextDate)}`
      : null;

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
        {scheduleChip ? (
          <p className="rounded-md border border-line-subtle bg-surface-1 px-3 py-2 text-xs font-semibold text-ink-muted">
            {scheduleChip}
          </p>
        ) : null}
      </div>

      {/* NEXT MOVE — the one unmistakable answer to "what happens next with
          this quote, and do I have to do it?" Same source of truth as the
          summary grid and Quiet Signal (computeNextMove), so the surfaces
          can never contradict each other. */}
      {move.kind !== "none" ? (
        <div
          data-testid="next-move-banner"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-brand/40 bg-surface-1 px-4 py-3.5"
        >
          <span className="text-[11px] font-black uppercase tracking-widest text-brand">
            Next move
          </span>
          {move.kind === "email-queued" ? (
            <p className="min-w-0 flex-1 text-sm leading-6 text-ink">
              Follow-up {move.followupNumber} is queued for{" "}
              <span className="font-bold text-ink-strong">
                {move.sendAtLabel}
              </span>
              . Nothing to send by hand — step in when they reply.
            </p>
          ) : null}
          {move.kind === "email-due" ? (
            <>
              <p className="min-w-0 flex-1 text-sm leading-6 text-ink">
                Follow-up {move.followupNumber} is due now and queued for
                email. You can let it send, or send it today if you want to
                move now.
              </p>
              <a
                href={`#followup-${move.followupNumber}`}
                className="whitespace-nowrap rounded text-sm font-bold text-brand hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Jump to the message →
              </a>
            </>
          ) : null}
          {move.kind === "manual-ready" ? (
            <>
              <p className="min-w-0 flex-1 text-sm leading-6 text-ink">
                Follow-up {move.followupNumber} is ready to copy. Send it from
                your phone or email today.
              </p>
              <a
                href={`#followup-${move.followupNumber}`}
                className="whitespace-nowrap rounded text-sm font-bold text-brand hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Jump to the message →
              </a>
            </>
          ) : null}
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
              move={move}
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
  move,
}: {
  reminder: ReminderRow;
  recoveryStatus: RecoveryStatus;
  hasPhone: boolean;
  hasEmail: boolean;
  allReminders: ReminderRow[];
  hasReplyForQuote: boolean;
  move: NextMove;
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

  // SEND SAFETY: exactly one card — the unified next actionable follow-up —
  // may carry the send button. Sent cards render "Sent"; future and
  // queued-behind cards render their schedule state with Copy only, so a
  // contractor can never fire all five follow-ups in one sitting. For an
  // email reminder the button additionally waits until the message is due:
  // a future-dated email sends itself, and "Send today" on it would be a
  // lie about who acts next.
  const isNextActionable = move.kind !== "none" && move.reminderId === r.id;
  const showSendToday =
    isNextActionable &&
    !sendEarlyDisabled &&
    (messageType === "email" ? move.kind === "email-due" : true);

  return (
    <li
      id={`followup-${r.followup_number}`}
      data-next-actionable={isNextActionable ? "true" : undefined}
      className={`scroll-mt-20 rounded-lg border bg-surface-1 shadow-[0_16px_46px_rgba(0,0,0,0.2)] ${
        isNextActionable ? "border-brand/50" : "border-line-subtle"
      }`}
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
          {showSendToday ? (
            <SendEarlyButton
              reminderId={r.id}
              followupNumber={r.followup_number}
              disabled={sendEarlyDisabled}
              messageType={messageType}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}
