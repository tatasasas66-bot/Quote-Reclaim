import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Button, Logo } from "@/components/ui";
import {
  CopyButton,
  ManualMessageActions,
  OneTapReplyCard,
  QuietSignalCard,
  ReplyPlaybook,
  QuoteActions,
  ReplyRadarCard,
  SendEarlyButton,
  type ReplyRadarData,
} from "@/components/quotes";
import { isReplyIntent } from "@/lib/ai/classify-reply";
import { suggestResponse } from "@/lib/ai/suggest-response";
import { requireUser } from "@/lib/auth/require-user";
import { MONTHLY_PRICE_USD } from "@/lib/payments/entitlement";
import {
  getLatestOneTapReply,
} from "@/lib/quotes/one-tap-reply-server";
import {
  getProfileStats,
  getQuoteById,
  listRemindersForQuote,
} from "@/lib/quotes/repo";
import {
  buildRecoveryPlanViewModel,
  type RecoveryPlanSequenceCard,
  type RecoveryPlanViewModel,
} from "@/lib/recovery/recovery-plan-view-model";
import { getProjectNoun } from "@/lib/recovery/recovery-logic";
import { SundayResetTracker } from "@/components/quotes/SundayResetTracker";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { titleCaseName } from "@/lib/utils/title-case";
import { recordAuditEvent } from "@/lib/audit-events";

export const metadata: Metadata = { title: "Quote - Quote Reclaim" };
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: { source?: string };
}) {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) redirect("/sign-in");

  const [quote, reminders, profile] = await Promise.all([
    getQuoteById(supabase, user.id, params.id),
    listRemindersForQuote(supabase, user.id, params.id),
    getProfileStats(supabase, user.id),
  ]);
  if (!quote) notFound();
  await recordAuditEvent(supabase, {
    userId: user.id,
    quoteId: quote.id,
    type: "price_check_viewed",
  });
  if (searchParams?.source === "sunday-reset") {
    await recordAuditEvent(supabase, {
      userId: user.id,
      quoteId: quote.id,
      type: "sunday_reset_opened",
    });
  }

  const serviceClient = createServiceSupabaseClient();
  const { data: outboundRows } = await serviceClient
    .from("outbound_messages")
    .select("status")
    .eq("quote_id", quote.id)
    .eq("user_id", user.id);
  const hasReplyForQuote = (outboundRows ?? []).some(
    (row) => row.status === "replied",
  );

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
            projectType: quote.project_type ?? null,
            estimateAmount: quote.estimate_amount,
            clientName: quote.client_name,
          }),
        }
      : null;

  const latestOneTapReply = await getLatestOneTapReply(
    serviceClient,
    String(quote.id),
  );

  const viewModel = buildRecoveryPlanViewModel({
    quote: { ...quote, hasReply: hasReplyForQuote },
    reminders,
    now: Date.now(),
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      {searchParams?.source === "sunday-reset" ? (
        <SundayResetTracker quoteId={quote.id} />
      ) : null}
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

      <QuietSignalCard signal={viewModel.quietSignal} />
      <CommandActionPanel viewModel={viewModel} />
      <ReplyRadarCard reply={replyRadar} />
      <OneTapReplyCard
        quoteId={viewModel.quote.id}
        clientFirstName={viewModel.quote.clientFirstName}
        trade={quote.trade}
        projectType={quote.project_type ?? null}
        latestReply={latestOneTapReply}
      />
      <QuoteSummary
        viewModel={viewModel}
        allTimeRecovered={profile?.recovered_amount ?? 0}
      />
      <RecoveryPlanSection viewModel={viewModel} />
    </main>
  );
}

function CommandActionPanel({
  viewModel,
}: {
  viewModel: RecoveryPlanViewModel;
}) {
  const action = viewModel.currentAction;

  return (
    <section
      id="quote-command-panel"
      data-testid="quote-command-panel"
      aria-labelledby="quote-command-heading"
      className="overflow-hidden rounded-2xl border border-brand/25 bg-white shadow-premium"
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
            {viewModel.commandHeading}
          </h1>
          <p className="mt-2 break-words text-sm text-ink-muted">
            {viewModel.quote.displayName} · {viewModel.quote.metaLine}
          </p>
          <p
            data-testid="quote-command-promise"
            className="mt-3 max-w-2xl text-base font-semibold leading-7 text-ink-strong"
          >
            {viewModel.commandPromise}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
          <Metric label="Amount quiet" value={viewModel.quote.amountLabel} />
          <Metric
            label="Days quiet"
            value={String(viewModel.quote.daysQuiet)}
          />
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <CommandChip
            accent
            label={`Recovery window: ${viewModel.recoveryWindowLabel}`}
          />
          <CommandChip label={`Priority: ${viewModel.priorityLabel}`} />
          <CommandChip label={`Status: ${viewModel.statusLabel}`} />
          <CommandChip accent label={`Next move: ${viewModel.currentMove}`} />
        </div>

        <div className="mt-4 rounded-xl border border-line-subtle bg-surface-2 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Message to send
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Chosen for this estimate&apos;s recovery window and the next decision
            the customer can answer quickly.
          </p>
          {viewModel.currentInstruction ? (
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              {viewModel.currentInstruction}
            </p>
          ) : null}
          <p
            data-testid="quote-command-message"
            className="mt-3 whitespace-pre-wrap text-base font-semibold leading-7 text-ink-strong"
          >
            {viewModel.currentMessage}
          </p>
          {viewModel.quote.phone ? (
            <ManualMessageActions
              message={viewModel.smsMessage}
              phone={viewModel.quote.phone}
              source="quote_command"
              tracking={messageTracking(viewModel, viewModel.currentMove)}
              className="mt-4"
            />
          ) : null}
          <div
            data-testid="quote-command-actions"
            className="mt-4 flex flex-wrap gap-2"
          >
            {action?.showSendToday ? (
              <SendEarlyButton
                reminderId={action.reminderId}
                followupNumber={action.followupNumber}
                disabled={action.disabled}
                messageType={action.messageType}
                variant="primary"
                size="lg"
                fullWidth
              />
            ) : null}
            <CopyButton
              text={viewModel.copyMessage}
              label="Copy"
              source="quote_command"
              tracking={messageTracking(viewModel, viewModel.currentMove)}
            />
          </div>
          {!viewModel.quote.phone && !viewModel.quote.email ? (
            <p className="mt-3 text-xs font-semibold text-ink-muted">
              Add a phone or email to send faster.
            </p>
          ) : null}
          <p
            data-testid="quote-command-reason"
            className="mt-3 text-sm leading-6 text-ink-muted"
          >
            <span className="font-semibold text-ink">Why this works:</span>{" "}
            {viewModel.currentWhyThisWorks}
          </p>
          <ReplyPlaybook
            paths={viewModel.replyPlaybook}
            trade={viewModel.quote.trade}
            projectType={viewModel.quote.projectType}
            phone={viewModel.quote.phone}
            quoteId={viewModel.quote.id}
          />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line-subtle bg-canvas/35 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className="mt-1 whitespace-nowrap text-2xl font-black tabular-nums text-ink-strong">
        {value}
      </p>
    </div>
  );
}

function CommandChip({
  label,
  accent = false,
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <span
      className={
        accent
          ? "rounded-full border border-brand/35 bg-brand/10 px-3 py-1 text-xs font-bold text-brand"
          : "rounded-full border border-line-subtle bg-canvas/35 px-3 py-1 text-xs font-bold text-ink"
      }
    >
      {label}
    </span>
  );
}

function QuoteSummary({
  viewModel,
  allTimeRecovered,
}: {
  viewModel: RecoveryPlanViewModel;
  allTimeRecovered: number;
}) {
  const statusVariant =
    viewModel.status === "won"
      ? "success"
      : viewModel.status === "paused"
        ? "warning"
        : viewModel.status === "closed"
          ? "neutral"
          : "brand";
  const scoreVariant =
    viewModel.scoreTone === "success"
      ? "success"
      : viewModel.scoreTone === "warning"
        ? "warning"
        : viewModel.scoreTone === "danger"
          ? "danger"
          : "neutral";
  const projectNoun = getProjectNoun(
    viewModel.quote.trade,
    viewModel.quote.projectType,
  );
  const opportunityMultiple = Math.floor(
    viewModel.quote.amount / MONTHLY_PRICE_USD,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-line-subtle bg-white shadow-premium">
      <div className="grid gap-5 border-b border-line-subtle p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={scoreVariant}>
              {viewModel.recoveryWindowLabel}
            </Badge>
            <Badge variant={statusVariant}>{viewModel.statusLabel}</Badge>
          </div>
          <h1 className="mt-3 truncate text-4xl font-black text-ink-strong">
            {viewModel.quote.displayName}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {viewModel.quote.metaLine}
          </p>
        </div>

        <div className="lg:text-right">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Amount still sitting quiet
          </p>
          <p className="mt-2 text-5xl font-bold text-ink-strong tabular-nums">
            {viewModel.quote.amountLabel}
          </p>
        </div>
      </div>

      <dl className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-5">
        <IntelligenceField
          label="Amount quiet"
          value={viewModel.quote.amountLabel}
          numeric
        />
        <IntelligenceField
          label="Days quiet"
          value={String(viewModel.quote.daysQuiet)}
          numeric
        />
        <IntelligenceField
          label="Recovery window"
          value={viewModel.recoveryWindowLabel}
        />
        <IntelligenceField label="Priority" value={viewModel.priorityLabel} />
        <IntelligenceField label="Next move" value={viewModel.currentMove} />
        <IntelligenceField label="Status" value={viewModel.statusLabel} />
        {viewModel.quote.projectType ? (
          <IntelligenceField
            label="Project type"
            value={viewModel.quote.projectType}
          />
        ) : null}
        {viewModel.quote.email ? (
          <IntelligenceField
            label="Email"
            value={viewModel.quote.email}
            truncate
          />
        ) : null}
        {viewModel.quote.phone ? (
          <IntelligenceField label="Phone" value={viewModel.quote.phone} />
        ) : null}
        {viewModel.quote.description ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <IntelligenceField
              label="Description"
              value={viewModel.quote.description}
            />
          </div>
        ) : null}
      </dl>

      {viewModel.status === "running" || viewModel.status === "paused" ? (
        <div className="border-t border-line-subtle p-5 sm:p-6">
          <p className="mb-3 max-w-3xl text-xs leading-5 text-ink-muted">
            Recovered revenue = any quiet estimate that books after you send a
            follow-up. Mark Got the Job to track it.
          </p>
          <p
            data-testid="quote-price-check"
            className="mb-4 max-w-3xl text-sm font-semibold leading-6 text-ink-strong"
          >
            If this {projectNoun} comes back, that&apos;s{" "}
            {viewModel.quote.amountLabel} / ${MONTHLY_PRICE_USD} ={" "}
            {opportunityMultiple}x a year of Quote Reclaim. No promises
            &mdash; just the size of the opportunity.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <QuoteActions
              quoteId={viewModel.quote.id}
              status={viewModel.status}
              amount={viewModel.quote.amount}
              allTimeRecovered={allTimeRecovered}
            />
            <Link href={`/quotes/${viewModel.quote.id}/edit`}>
              <Button variant="ghost" size="sm">
                Edit quote
              </Button>
            </Link>
          </div>
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
  const valueClass = numeric
    ? "mt-1 whitespace-nowrap tabular-nums text-sm font-bold text-ink-strong"
    : truncate
      ? "mt-1 truncate text-sm font-bold text-ink-strong"
      : "mt-1 break-words text-sm font-bold text-ink-strong";
  return (
    <div className="min-w-0 rounded-xl border border-line-subtle bg-surface-2 p-3">
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
  viewModel,
}: {
  viewModel: RecoveryPlanViewModel;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Recovery sequence
          </p>
          <h2 className="mt-1 text-2xl font-black text-ink-strong">
            {viewModel.sequenceHeading}
          </h2>
        </div>
        {viewModel.sequenceScheduleLabel ? (
          <p className="rounded-md border border-line-subtle bg-surface-1 px-3 py-2 text-xs font-semibold text-ink-muted">
            {viewModel.sequenceScheduleLabel}
          </p>
        ) : null}
      </div>

      {viewModel.sequenceIntro ? (
        <p className="max-w-3xl text-sm leading-6 text-ink-muted">
          {viewModel.sequenceIntro}
        </p>
      ) : null}

      {viewModel.sequenceCards.length === 0 ? (
        <p className="rounded-2xl border border-line-subtle bg-white p-6 text-sm text-ink-muted shadow-premium">
          No recovery plan generated.
        </p>
      ) : (
        <ol className="grid gap-3">
          {viewModel.sequenceCards.map((card) => (
            <ReminderCard
              key={card.key}
              card={card}
              viewModel={viewModel}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function ReminderCard({
  card,
  viewModel,
}: {
  card: RecoveryPlanSequenceCard;
  viewModel: RecoveryPlanViewModel;
}) {
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-4 py-3">
      <span className="text-xs font-black uppercase tracking-widest text-brand">
        {card.family}
      </span>
      <Badge variant={card.statusTone}>{card.statusLabel}</Badge>
    </div>
  );

  const messageBody = (
    <>
      <p className="whitespace-pre-wrap px-4 pt-4 text-sm leading-7 text-ink-strong">
        {card.message}
      </p>
      {viewModel.quote.phone ? (
        <ManualMessageActions
          message={card.smsMessage}
          phone={viewModel.quote.phone}
          source={`recovery_sequence_${card.key}`}
          tracking={messageTracking(viewModel, card.family)}
          className="mx-4 mt-4"
        />
      ) : null}

      {card.isCurrent ? (
        <p className="mx-4 mt-3 text-xs leading-5 text-ink-muted">
          <span className="font-semibold text-ink">Why this works:</span>{" "}
          {card.whyThisWorks}
        </p>
      ) : (
        <details className="mx-4 mt-3 rounded-md border border-line-subtle bg-canvas/35 px-3 py-2 text-xs text-ink-muted">
          <summary className="cursor-pointer font-semibold text-ink">
            Why this works
          </summary>
          <p className="mt-2 leading-5">{card.whyThisWorks}</p>
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle px-4 py-3">
        <div className="text-xs text-ink-muted">
          {card.scheduledLabel ? (
            <p>
              Scheduled {card.scheduledLabel} · {card.channelLabel}
            </p>
          ) : null}
          {card.helperLabel ? (
            <p className="mt-1 font-semibold text-ink-muted">
              {card.helperLabel}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <CopyButton
            text={card.copyMessage}
            source={`recovery_sequence_${card.key}`}
            tracking={messageTracking(viewModel, card.family)}
          />
          {card.isCurrent ? (
            <a
              href="#quote-command-panel"
              className="rounded px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              ↑ sent from above
            </a>
          ) : null}
        </div>
      </div>
      {!viewModel.quote.phone && !viewModel.quote.email ? (
        <p className="mx-4 mb-4 text-xs font-semibold text-ink-muted">
          Add a phone or email to send faster.
        </p>
      ) : null}
    </>
  );

  if (!card.isCurrent) {
    return (
      <li
        id={card.anchorId}
        data-followup-collapsed="true"
        className="scroll-mt-20 overflow-hidden rounded-2xl border border-line-subtle bg-white shadow-premium"
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
      id={card.anchorId}
      data-next-actionable="true"
      className="scroll-mt-20 overflow-hidden rounded-2xl border border-brand/35 bg-white shadow-premium"
    >
      {header}
      {messageBody}
    </li>
  );
}

function messageTracking(
  viewModel: RecoveryPlanViewModel,
  messageType: string,
) {
  return {
    quote_id: viewModel.quote.id,
    message_type: messageType,
    trade: viewModel.quote.trade,
    project_noun: getProjectNoun(
      viewModel.quote.trade,
      viewModel.quote.projectType,
    ),
    recovery_window: viewModel.recoveryWindow,
    quote_amount: viewModel.quote.amount,
    days_quiet: viewModel.quote.daysQuiet,
  };
}
