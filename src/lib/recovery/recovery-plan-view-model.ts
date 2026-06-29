import { formatScheduleDateTime } from "@/lib/quotes/business-hours";
import {
  canManualSendToday,
  computeNextMove,
} from "@/lib/quotes/next-move";
import { tradeLocationLine } from "@/lib/quotes/quote-display";
import {
  recoveryScoreForDays,
  type RecoveryScore,
} from "@/lib/quotes/recovery-score";
import type { QuoteRow, ReminderRow } from "@/lib/quotes/repo";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";
import {
  getMessageFamily,
  getOneTapOptions,
  getPriorityLabel,
  getQuietSignal,
  getReplyPlaybook,
  getRecommendedMessage,
  getRecoveryWindow,
  getRecoveryWindowLabel,
  getSequenceFamily,
  getWhyThisWorks,
  getWhyThisWorksForStep,
  SEQUENCE_FAMILIES,
  type FollowupNumber,
  type MessageFamily,
  type ReplyPlaybookPath,
  type RecoveryWindow,
} from "@/lib/recovery/recovery-logic";
import { formatCurrency } from "@/lib/utils/currency";
import { titleCaseName } from "@/lib/utils/title-case";

export type RecoveryPlanStatus = "running" | "paused" | "won" | "closed";

export type RecoveryPlanQuote = QuoteRow & {
  hasReply?: boolean;
};

export type RecoveryPlanReplyPath = ReplyPlaybookPath;

export type RecoveryPlanAction = {
  reminderId: string;
  followupNumber: FollowupNumber;
  messageType: "email" | "sms";
  disabled: boolean;
  showSendToday: boolean;
};

export type RecoveryPlanSequenceCard = {
  key: string;
  anchorId: string;
  family: MessageFamily;
  statusLabel: "Current move" | "Queued after current move";
  statusTone: "brand" | "neutral";
  helperLabel: string | null;
  scheduledAt: string | null;
  scheduledLabel: string | null;
  channelLabel: "EMAIL" | "SMS" | "COPY";
  message: string;
  whyThisWorks: string;
  copyMessage: string;
  smsMessage: string;
  whatsappMessage: string;
  isCurrent: boolean;
  action: RecoveryPlanAction | null;
};

export type RecoveryPlanQuietSignal = {
  stallReason: string;
  signal: string;
  evidence: string[];
  recommendedMove: string;
  shameLine: string;
  currentMoveAnchorId: string | null;
};

export type RecoveryPlanViewModel = {
  quote: {
    id: string;
    displayName: string;
    clientFirstName: string;
    trade: string;
    projectType: string | null;
    metaLine: string;
    amount: number;
    amountLabel: string;
    daysQuiet: number;
    email: string | null;
    phone: string | null;
    description: string | null;
  };
  status: RecoveryPlanStatus;
  statusLabel: string;
  recoveryWindow: RecoveryWindow;
  recoveryWindowLabel: string;
  priorityLabel: string;
  scoreTone: RecoveryScore["tone"];
  currentMove: MessageFamily;
  currentScheduledAt: string | null;
  currentScheduledLabel: string | null;
  currentMessage: string;
  currentWhyThisWorks: string;
  currentInstruction: string | null;
  commandHeading: string;
  commandPromise: string;
  currentAction: RecoveryPlanAction | null;
  copyMessage: string;
  smsMessage: string;
  whatsappMessage: string;
  sequenceHeading: string;
  sequenceIntro: string | null;
  sequenceScheduleLabel: string | null;
  sequenceCards: RecoveryPlanSequenceCard[];
  quietSignal: RecoveryPlanQuietSignal | null;
  oneTapOptions: string[];
  replyPlaybook: RecoveryPlanReplyPath[];
};

function computeStatus(
  quote: RecoveryPlanQuote,
  reminders: ReminderRow[],
): RecoveryPlanStatus {
  if (quote.outcome === "won") return "won";
  if (quote.outcome === "closed") return "closed";
  const unsent = reminders.filter((reminder) => !reminder.sent);
  if (unsent.length === 0) return "running";
  return unsent.every((reminder) => reminder.paused_at !== null)
    ? "paused"
    : "running";
}

function statusLabel(status: RecoveryPlanStatus): string {
  switch (status) {
    case "won":
      return "Won";
    case "closed":
      return "Closed";
    case "paused":
      return "Paused";
    case "running":
      return "Running";
  }
}

function sortedPendingReminders(reminders: ReminderRow[]): ReminderRow[] {
  return reminders
    .filter((reminder) => !reminder.sent)
    .sort(
      (a, b) =>
        Date.parse(a.send_at) - Date.parse(b.send_at) ||
        a.followup_number - b.followup_number,
    );
}

function currentFirst(reminders: ReminderRow[]): ReminderRow[] {
  const current =
    reminders.find((reminder) => reminder.paused_at === null) ??
    reminders[0] ??
    null;
  if (!current) return [];
  return [current, ...reminders.filter((reminder) => reminder.id !== current.id)];
}

function messageKey(family: MessageFamily): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function familyForReminder(reminder: ReminderRow): MessageFamily {
  const stored = reminder.framework_used as MessageFamily | null;
  return stored && SEQUENCE_FAMILIES.includes(stored)
    ? stored
    : getSequenceFamily(reminder.followup_number);
}

function buildInstruction(input: {
  status: RecoveryPlanStatus;
  hasReply: boolean;
  currentMove: MessageFamily;
  currentScheduledLabel: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  move: ReturnType<typeof computeNextMove>;
}): string | null {
  if (input.hasReply) {
    return "A customer reply is waiting. Handle that before sending another follow-up.";
  }
  if (input.status === "paused") {
    return `Recovery is paused. Resume when you are ready to send ${input.currentMove}.`;
  }
  if (input.status === "won" || input.status === "closed") return null;
  if (input.hasPhone) {
    return input.currentScheduledLabel
      ? `${input.currentMove} is due ${input.currentScheduledLabel}. Open SMS when you're ready; nothing sends until you tap send.`
      : `${input.currentMove} is ready. Open SMS when you're ready; nothing sends until you tap send.`;
  }
  if (!input.hasEmail) {
    return `${input.currentMove} is ready to copy. Add a phone or email to send faster.`;
  }

  switch (input.move.kind) {
    case "email-queued":
      return input.move.canSendEarly
        ? `${input.currentMove} is scheduled for ${input.move.sendAtLabel}. Send it today if you want to move now.`
        : `${input.currentMove} is scheduled for ${input.move.sendAtLabel}. It will send on schedule.`;
    case "email-due":
      return `${input.currentMove} is ready now. Send it today, or let the scheduled email handle it.`;
    case "manual-ready":
      return `${input.currentMove} is ready to copy. Send it from your phone or WhatsApp today.`;
    case "none":
      return input.currentScheduledLabel
        ? `${input.currentMove} is scheduled for ${input.currentScheduledLabel}.`
        : null;
  }
}

function buildAction(input: {
  reminder: ReminderRow | null;
  status: RecoveryPlanStatus;
  hasReply: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  move: ReturnType<typeof computeNextMove>;
}): RecoveryPlanAction | null {
  const reminder = input.reminder;
  if (!reminder) return null;

  const messageType: "email" | "sms" =
    reminder.message_type === "email" ? "email" : "sms";
  const hasRecipient = messageType === "email" ? input.hasEmail : input.hasPhone;
  const isActionable =
    input.move.kind !== "none" && input.move.reminderId === reminder.id;
  const disabled =
    reminder.sent ||
    reminder.paused_at !== null ||
    input.status !== "running" ||
    input.hasReply ||
    !hasRecipient ||
    !isActionable;
  const showSendToday =
    !disabled && messageType === "email" && canManualSendToday(input.move);

  return {
    reminderId: reminder.id,
    followupNumber: reminder.followup_number,
    messageType,
    disabled,
    showSendToday,
  };
}

export function buildRecoveryPlanViewModel({
  quote,
  reminders,
  now,
}: {
  quote: RecoveryPlanQuote;
  reminders: ReminderRow[];
  now: Date | number;
}): RecoveryPlanViewModel {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const daysQuiet = effectiveDaysSilent(quote, nowMs);
  const recoveryWindow = getRecoveryWindow(daysQuiet);
  const status = computeStatus(quote, reminders);
  const hasReply = Boolean(quote.hasReply);
  const hasEmail = Boolean(quote.client_email);
  const hasPhone = Boolean(quote.client_phone);
  const preferredChannel: "SMS" | "EMAIL" | "COPY" = hasPhone
    ? "SMS"
    : hasEmail
      ? "EMAIL"
      : "COPY";
  const move = computeNextMove({
    status,
    reminders,
    hasEmail,
    hasReply,
    now: nowMs,
  });

  const pendingReminders = currentFirst(sortedPendingReminders(reminders));
  const currentReminder = pendingReminders[0] ?? null;
  const currentMove = currentReminder
    ? familyForReminder(currentReminder)
    : getMessageFamily(recoveryWindow);
  const currentScheduledAt = currentReminder?.send_at ?? null;
  const currentScheduledLabel = currentScheduledAt
    ? formatScheduleDateTime(currentScheduledAt)
    : null;
  const recommended = getRecommendedMessage({
    daysQuiet,
    firstName: quote.client_name,
    trade: quote.trade,
    projectType: quote.project_type,
  });
  const currentMessage = currentReminder?.message_text ?? recommended.message;
  const currentWhyThisWorks = currentReminder
    ? getWhyThisWorksForStep(currentReminder.followup_number)
    : getWhyThisWorks(recoveryWindow);
  const currentAction = buildAction({
    reminder: currentReminder,
    status,
    hasReply,
    hasEmail,
    hasPhone,
    move,
  });

  const sequenceCards = pendingReminders.map(
    (reminder, index): RecoveryPlanSequenceCard => {
      const isCurrent = index === 0;
      const family = familyForReminder(reminder);
      const message = reminder.message_text;
      const scheduledAt = reminder.send_at;
      return {
        key: `${reminder.id}-${messageKey(family)}`,
        anchorId: isCurrent
          ? "current-recovery-move"
          : `recovery-${reminder.followup_number}-${messageKey(family)}`,
        family,
        statusLabel: isCurrent ? "Current move" : "Queued after current move",
        statusTone: isCurrent ? "brand" : "neutral",
        helperLabel: isCurrent ? null : "Queued after current move",
        scheduledAt,
        scheduledLabel: scheduledAt
          ? formatScheduleDateTime(scheduledAt)
          : null,
        channelLabel: preferredChannel,
        message,
        whyThisWorks: isCurrent
          ? currentWhyThisWorks
          : getWhyThisWorksForStep(reminder.followup_number),
        copyMessage: message,
        smsMessage: message,
        whatsappMessage: message,
        isCurrent,
        action: isCurrent ? currentAction : null,
      };
    },
  );

  const centralizedQuietSignal = getQuietSignal(recoveryWindow);
  const quietSignal =
    quote.outcome === "pending" && !quote.client_opted_out
      ? {
          stallReason: centralizedQuietSignal.stallReason,
          signal: centralizedQuietSignal.signal,
          evidence: [
            daysQuiet === 1
              ? "This estimate has been quiet for 1 day."
              : `This estimate has been quiet for ${daysQuiet} days.`,
            ...centralizedQuietSignal.evidence,
          ],
          recommendedMove: centralizedQuietSignal.recommendedMove,
          shameLine: centralizedQuietSignal.shameLine,
          currentMoveAnchorId:
            sequenceCards[0]?.anchorId ?? null,
        }
      : null;

  const amountLabel = formatCurrency(quote.estimate_amount);
  const scoreTone =
    quote.outcome === "won"
      ? "success"
      : quote.outcome === "closed"
        ? "neutral"
        : recoveryScoreForDays(daysQuiet).tone;
  const displayName = titleCaseName(quote.client_name);
  const clientFirstName = displayName.split(/\s+/)[0] || "Customer";
  const sequenceIntro =
    pendingReminders.length === 0
      ? null
      : status === "paused"
        ? "Recovery is paused. Future reminders won't send until you resume."
        : hasPhone
          ? "The rest of the sequence stays here. Open SMS when each touch is due; nothing sends until you tap send."
          : hasEmail
            ? "The rest of the sequence stays behind this message and sends by email on schedule."
          : "The rest of the sequence stays here, ready to copy when each touch comes due.";
  const sequenceScheduleLabel =
    status === "running" && currentScheduledLabel && !hasReply
      ? `Next follow-up due: ${currentScheduledLabel} · ${preferredChannel === "COPY" ? "Copy" : preferredChannel}`
      : null;

  return {
    quote: {
      id: quote.id,
      displayName,
      clientFirstName,
      trade: quote.trade,
      projectType: quote.project_type ?? null,
      metaLine: tradeLocationLine(quote.trade, quote.city, quote.state),
      amount: quote.estimate_amount,
      amountLabel,
      daysQuiet,
      email: quote.client_email,
      phone: quote.client_phone,
      description: quote.job_description,
    },
    status,
    statusLabel: statusLabel(status),
    recoveryWindow,
    recoveryWindowLabel: getRecoveryWindowLabel(recoveryWindow),
    priorityLabel: getPriorityLabel(recoveryWindow),
    scoreTone,
    currentMove,
    currentScheduledAt,
    currentScheduledLabel,
    currentMessage,
    currentWhyThisWorks,
    currentInstruction: buildInstruction({
      status,
      hasReply,
      currentMove,
      currentScheduledLabel,
      hasEmail,
      hasPhone,
      move,
    }),
    commandHeading: currentReminder ? "Send this today" : `Work ${displayName}`,
    commandPromise: currentReminder
      ? "Send this today. If they answer with interest, price, timing, or no, the next reply is already ready."
      : "Work the quote from one place: money, status, next move, and reply handling.",
    currentAction,
    copyMessage: currentMessage,
    smsMessage: currentMessage,
    whatsappMessage: currentMessage,
    sequenceHeading:
      pendingReminders.length === 6
        ? "6-message recovery plan"
        : `${pendingReminders.length}-message remaining plan`,
    sequenceIntro,
    sequenceScheduleLabel,
    sequenceCards,
    quietSignal,
    oneTapOptions: getOneTapOptions(recoveryWindow),
    replyPlaybook: getReplyPlaybook(
      quote.trade,
      quote.estimate_amount,
      quote.project_type,
    ),
  };
}
