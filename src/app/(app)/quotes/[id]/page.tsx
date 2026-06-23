import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Button, Logo } from "@/components/ui";
import {
  CopyButton,
  ManualMessageActions,
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
import { projectLabel } from "@/lib/ai/fallback-messages";
import { requireUser } from "@/lib/auth/require-user";
import { nextBestAction } from "@/lib/quotes/next-best-action";
import {
  canManualSendToday,
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
import { recoveryWindowForDays, describeRecoveryWindow } from "@/lib/audit/silent-quote-audit";
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
  1: "The estimate is still fresh, so one clear question is easier to answer than forcing a full decision.",
  2: "It gives the homeowner simple categories to answer with instead of making them explain the whole situation.",
  3: "If total cost or scope is the blocker, a smaller path gives them a way back without asking for a discount.",
  4: "It turns silence into a simple status choice: keep open, revise, or close.",
  5: "It removes the awkwardness of saying no while leaving the door open to reopen later.",
};

type ReplyRescuePath = {
  label: string;
  trigger: string;
  response: string;
};

function replyRescuePaths(quote: QuoteRow): ReplyRescuePath[] {
  const project = projectLabel(quote.trade);
  return [
    {
      label: "Interested",
      trigger: "Yes / still interested",
      response: `Great. Want me to keep ${project} as written, or adjust timing before you decide?`,
    },
    {
      label: "Price concern",
      trigger: "It feels high",
      response: `Totally fair. I can break ${project} into must-do, optional, and later so you can see what drives the total. Want that?`,
    },
    {
      label: "Timing delay",
      trigger: "Need to wait",
      response: `No problem. Should I pause ${project} and check back later, or close it out for now?`,
    },
    {
      label: "Scope question",
      trigger: "Part feels unclear",
      response: `Of course. Tell me which part feels unclear and I'll break that part down plainly.`,
    },
    {
      label: "Still comparing",
      trigger: "Comparing estimates",
      response: `That makes sense. If you're comparing estimates, I can help make sure you're comparing the same scope.`,
    },
    {
      label: "Went another way",
      trigger: "Chose someone else",
      response: `Thanks for letting me know. I'll close ${project} on my end and keep the door open if anything changes.`,
    },
    {
      label: "Close it for now",
      trigger: "Not right now",
      response: `No problem. I'll close ${project} on my side for now. If you want to reopen it later, reply here.`,
    },
  ];
}

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

function activeReminderForMove(
  reminders: ReminderRow[],
  move: NextMove,
): ReminderRow | null {
  if (move.kind === "none") return null;
  return reminders.find((r) => r.id === move.reminderId) ?? null;
}

function commandStatusLabel(status: RecoveryStatus): string {
  switch (status) {
    case "won":
      return "Won";
    case "closed":
      return "Closed";
    case "paused":
      return "Paused";
    case "running":
    default:
      return "Running";
  }
}

/** Map recovery window → contractor-friendly priority label. */
function windowPriorityLabel(window: string): string {
  switch (window) {
    case "warm": return "Send today";
    case "cooling": return "Follow up next";
    case "cold": return "High";
    case "closeout": return "Closeout touch";
    default: return "Send today";
  }
}

function commandMoveInstruction(move: NextMove): string | null {
  switch (move.kind) {
    case "none":
      return null;
    case "email-queued":
      return move.canSendEarly
        ? `Scheduled for ${move.sendAtLabel}. Send it today if you want to move now.`
        : `Scheduled for ${move.sendAtLabel}. It will send on schedule.`;
    case "email-due":
      return "Ready now. Send it today, or let the scheduled email handle it.";
    case "manual-ready":
      return `Ready to copy. Send follow-up ${move.followupNumber} from your phone or email today.`;
  }
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
  // Reads via service client to bypass RLS on outbound_messages. The quote is
  // already proven to belong to this user (getQuoteById scoped by user.id
  // above), but we still scope this read by user_id for defense in depth —
  // the recovery_events read below does the same, and a service-client query
  // should never rely on a single id being un-guessable.
  const serviceClient = createServiceSupabaseClient();
  const { data: outboundRows } = await serviceClient
    .from("outbound_messages")
    .select("id, status, open_count, click_count")
    .eq("quote_id", quote.id)
    .eq("user_id", user.id);
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
  // grid's Next move, Quiet Signal's Best next move, the recovery
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
  const activeReminder = activeReminderForMove(reminders, move);

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

      <CommandActionPanel
        quote={quote}
        status={status}
        activeReminder={activeReminder}
        move={move}
        hasEmail={Boolean(quote.client_email)}
        hasPhone={Boolean(quote.client_phone)}
        hasReplyForQuote={hasReplyForQuote}
      />

      <ReplyRadarCard reply={replyRadar} />
      <OneTapReplyCard
        quoteId={String(quote.id)}
        clientFirstName={clientFirstName}
        latestReply={latestOneTapReply}
        options={oneTapOptions}
      />

      <QuoteSummary
        quote={quote}
        status={status}
        hasReplyForQuote={hasReplyForQuote}
        allTimeRecovered={allTimeRecovered}
        move={move}
      />

      <RecoveryPlanSection
        reminders={reminders}
        status={status}
        nextDate={next}
        move={move}
        hasPhone={Boolean(quote.client_phone)}
        hasEmail={Boolean(quote.client_email)}
        hasReplyForQuote={hasReplyForQuote}
      />

      <QuietSignalCard signal={quietSignal} />
    </main>
  );
}

function CommandActionPanel({
  quote,
  status,
  activeReminder,
  move,
  hasEmail,
  hasPhone,
  hasReplyForQuote,
}: {
  quote: QuoteRow;
  status: RecoveryStatus;
  activeReminder: ReminderRow | null;
  move: NextMove;
  hasEmail: boolean;
  hasPhone: boolean;
  hasReplyForQuote: boolean;
}) {
  const displayName = titleCaseName(quote.client_name);
  const metaLine = tradeLocationLine(quote.trade, quote.city, quote.state);
  const daysQuiet = effectiveDaysSilent(quote);
  const recoveryWindow = recoveryWindowForDays(daysQuiet);
  const windowDescriptor = describeRecoveryWindow(daysQuiet);
  const instruction = commandMoveInstruction(move);
  const messageType: "email" | "sms" =
    activeReminder?.message_type === "email" ? "email" : "sms";
  const hasRecipientForChannel = messageType === "email" ? hasEmail : hasPhone;
  const sendDisabled =
    !activeReminder ||
    activeReminder.sent ||
    activeReminder.paused_at !== null ||
    status !== "running" ||
    !hasRecipientForChannel;
  const showSendToday =
    activeReminder != null &&
    move.kind !== "none" &&
    !sendDisabled &&
    (messageType === "email" ? canManualSendToday(move) : true);
  const nextMoveLabel = activeReminder
    ? `Follow-up ${activeReminder.followup_number}`
    : hasReplyForQuote
      ? "Reply first"
      : commandStatusLabel(status);
  const commandLine = activeReminder
    ? "Send this today. If they answer with interest, price, timing, or no, the next reply is already ready."
    : "Work the quote from one place: money, status, next move, and reply handling.";
  const rescuePaths = replyRescuePaths(quote);

  return (
    <section
      data-testid="quote-command-panel"
      aria-labelledby="quote-command-heading"
      className="rounded-xl border border-brand/45 bg-surface-1 shadow-[0_28px_86px_rgba(0,0,0,0.34)]"
    >
      <div className="grid gap-5 border-b border-line-subtle p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Next move
          </p>
          <h1
            id="quote-command-heading"
            className="mt-2 text-3xl font-black leading-tight text-ink-strong sm:text-4xl"
          >
            {activeReminder ? "Send this today" : `Work ${displayName}`}
          </h1>
          <p className="mt-2 break-words text-sm text-ink-muted">
            {displayName} · {metaLine}
          </p>
          <p
            data-testid="quote-command-promise"
            className="mt-3 max-w-2xl text-base font-semibold leading-7 text-ink-strong"
          >
            {commandLine}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
          <div className="rounded-lg border border-line-subtle bg-canvas/35 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
              Amount quiet
            </p>
            <p className="mt-1 whitespace-nowrap text-2xl font-black tabular-nums text-ink-strong">
              {formatCurrency(quote.estimate_amount)}
            </p>
          </div>
          <div className="rounded-lg border border-line-subtle bg-canvas/35 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
              Days quiet
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-ink-strong">
              {daysQuiet}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-brand/35 bg-brand/10 px-3 py-1 text-xs font-bold text-brand">
              Recovery window: {windowDescriptor.label}
            </span>
            <span className="rounded-full border border-line-subtle bg-canvas/35 px-3 py-1 text-xs font-bold text-ink">
              Priority: {windowPriorityLabel(recoveryWindow)}
            </span>
            <span className="rounded-full border border-line-subtle bg-canvas/35 px-3 py-1 text-xs font-bold text-ink">
              Status: {commandStatusLabel(status)}
            </span>
            <span className="rounded-full border border-brand/35 bg-brand/10 px-3 py-1 text-xs font-bold text-brand">
              Next move: {nextMoveLabel}
            </span>
          </div>

          {activeReminder ? (
            <div className="mt-4 rounded-lg border border-line-subtle bg-canvas/40 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                Message to send
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Not a canned template — chosen for this estimate&apos;s recovery
                window and the likely reason the homeowner went quiet.
              </p>
              {instruction ? (
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {instruction}
                </p>
              ) : null}
              <p
                data-testid="quote-command-message"
                className="mt-3 whitespace-pre-wrap text-base font-semibold leading-7 text-ink-strong"
              >
                {activeReminder.message_text}
              </p>
              <div
                data-testid="quote-command-actions"
                className="mt-4 flex flex-wrap gap-2"
              >
                {showSendToday ? (
                  <SendEarlyButton
                    reminderId={activeReminder.id}
                    followupNumber={activeReminder.followup_number}
                    disabled={sendDisabled}
                    messageType={messageType}
                    variant="primary"
                    size="lg"
                    fullWidth
                  />
                ) : null}
                <CopyButton text={activeReminder.message_text} label="Copy" />
              </div>
              <ManualMessageActions
                message={activeReminder.message_text}
                source="quote_command"
                className="mt-3"
              />
              <p
                data-testid="quote-command-reason"
                className="mt-3 text-sm leading-6 text-ink-muted"
              >
                <span className="font-semibold text-ink">Why this works:</span>{" "}
                {WHY_THIS_WORKS[activeReminder.followup_number as FollowupStep]}
              </p>
              <div
                data-testid="reply-rescue-paths"
                className="mt-4 rounded-lg border border-brand/25 bg-brand/5 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-widest text-brand">
                    Reply playbook
                  </p>
                  <p className="text-xs font-semibold text-ink-muted">
                    4 next replies ready
                  </p>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  Use the reply that matches what they say. No guessing, no
                  starting over.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {rescuePaths.map((path) => (
                    <div
                      key={path.label}
                      className="flex min-h-full flex-col rounded-md border border-line-subtle bg-canvas/45 p-3"
                    >
                      <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
                        {path.trigger}
                      </p>
                      <p className="mt-1 text-sm font-bold text-ink">
                        {path.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        {path.response}
                      </p>
                      <div className="mt-auto pt-3">
                        <CopyButton text={path.response} label="Copy reply" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-line-subtle bg-canvas/40 p-4 text-sm leading-6 text-ink">
              {hasReplyForQuote
                ? "A customer reply is waiting. Handle that before sending another follow-up."
                : "No follow-up is ready to send right now. Review the status below."}
            </p>
          )}
        </div>
      </div>
    </section>
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
        return { variant: "warning" as const, label: "Paused" };
      case "running":
      default:
        return { variant: "brand" as const, label: "Running" };
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
  const recoveryWindow = recoveryWindowForDays(daysQuiet);
  const windowDescriptor = describeRecoveryWindow(daysQuiet);
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
            <Badge variant={scoreBadgeVariant}>{windowDescriptor.label}</Badge>
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
        <IntelligenceField label="Recovery window" value={windowDescriptor.label} />
        <IntelligenceField label="Priority" value={windowPriorityLabel(recoveryWindow)} />
        <IntelligenceField label="Next move" value={nextActionLabel} />
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
    ? "The rest of the sequence stays behind this message and sends by email on schedule."
    : "The rest of the sequence stays here, ready to copy when each touch comes due.";

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
            Recovery sequence
          </p>
          <h2 className="mt-1 text-2xl font-black text-ink-strong">
            5-message plan
          </h2>
        </div>
        {scheduleChip ? (
          <p className="rounded-md border border-line-subtle bg-surface-1 px-3 py-2 text-xs font-semibold text-ink-muted">
            {scheduleChip}
          </p>
        ) : null}
      </div>

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
  // contractor can never fire all five follow-ups in one sitting.
  //
  // MANUAL OVERRIDE: for an email reminder the button shows for BOTH the
  // due-now case AND the future-queued case (canManualSendToday) — an old
  // quiet quote schedules its first touch in a future window, but the
  // contractor can still take command and send it by hand now. This is a
  // manual command that sends ONLY this reminder; it does not change the
  // automatic schedule, and the scheduled line below still shows the real
  // (future) send_at, so nothing claims the system already sends today.
  const isNextActionable = move.kind !== "none" && move.reminderId === r.id;
  const showSendToday =
    isNextActionable &&
    !sendEarlyDisabled &&
    (messageType === "email" ? canManualSendToday(move) : true);

  const header = (
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
  );

  const messageBody = (
    <>
      <p className="whitespace-pre-wrap px-4 pt-4 text-sm leading-7 text-ink-strong">
        {r.message_text}
      </p>

      {!isNextActionable ? (
        <details className="mx-4 mt-3 rounded-md border border-line-subtle bg-canvas/35 px-3 py-2 text-xs text-ink-muted">
          <summary className="cursor-pointer font-semibold text-ink">
            Why this works
          </summary>
          <p className="mt-2 leading-5">
            {WHY_THIS_WORKS[r.followup_number as FollowupStep]}
          </p>
        </details>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle px-4 py-3">
        <div className="text-xs text-ink-muted">
          <p>
            Scheduled {formatSendDate(sendDate)} · {r.message_type.toUpperCase()}
          </p>
          {display.helperLabel ? (
            <p className="mt-1 font-semibold text-ink-muted">
              {display.helperLabel}
            </p>
          ) : null}
        </div>
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
      <ManualMessageActions
        message={r.message_text}
        source={`recovery_sequence_followup_${r.followup_number}`}
        className="mx-4 mb-4"
      />
    </>
  );

  if (!isNextActionable) {
    return (
      <li
        id={`followup-${r.followup_number}`}
        data-followup-collapsed="true"
        className="scroll-mt-20 rounded-lg border border-line-subtle bg-surface-1 shadow-[0_10px_30px_rgba(0,0,0,0.16)]"
      >
        <details>
          <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
            {header}
          </summary>
          {messageBody}
        </details>
      </li>
    );
  }

  return (
    <li
      id={`followup-${r.followup_number}`}
      data-next-actionable={isNextActionable ? "true" : undefined}
      className={`scroll-mt-20 rounded-lg border bg-surface-1 shadow-[0_16px_46px_rgba(0,0,0,0.2)] ${
        isNextActionable ? "border-brand/50" : "border-line-subtle"
      }`}
    >
      {header}
      {messageBody}
    </li>
  );
}
