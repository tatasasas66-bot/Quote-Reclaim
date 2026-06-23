import type { ReminderRow } from "@/lib/quotes/repo";
import {
  formatScheduleDateTime,
  formatScheduleTime,
} from "@/lib/quotes/business-hours";
import { getSequenceFamily } from "@/lib/recovery/recovery-logic";

export type StepStatus =
  | "scheduled"
  | "due"
  | "sent"
  | "replied"
  | "paused"
  | "failed";

export interface StepDisplay {
  status: StepStatus;
  label: string;
  helperLabel?: string;
  tone: "neutral" | "rust" | "success" | "warning" | "danger";
}

/**
 * Computes per-step display status for a sequence.
 *
 * RULE: only the SOONEST unsent, unpaused, due reminder gets "due".
 * All other not-yet-sent reminders past their send_at appear "scheduled"
 * (they will be picked up by the next cron run). Prevents the
 * "two Due badges" bug.
 */
export function computeStepDisplay(
  reminder: ReminderRow,
  allRemindersForQuote: ReminderRow[],
  hasReplyForQuote: boolean,
): StepDisplay {
  if (reminder.paused_at) {
    return { status: "paused", label: "Paused", tone: "warning" };
  }
  if (hasReplyForQuote && !reminder.sent) {
    return {
      status: "replied",
      label: "Paused · customer replied",
      tone: "success",
    };
  }
  if (reminder.sent) {
    return {
      status: "sent",
      label: `Sent ${formatScheduleTime(reminder.sent_at)}`,
      tone: "success",
    };
  }
  const nextUp = [...allRemindersForQuote]
    .filter((r) => !r.sent && !r.paused_at)
    .sort((a, b) => +new Date(a.send_at) - +new Date(b.send_at))[0];
  const queuedBehind =
    nextUp && nextUp.id !== reminder.id
      ? `Queued after ${getSequenceFamily(nextUp.followup_number as 1 | 2 | 3 | 4 | 5)}`
      : nextUp && nextUp.id === reminder.id
        ? "Current move"
        : undefined;
  const scheduledLabel = `Scheduled ${formatScheduleDateTime(reminder.send_at)}`;
  const now = Date.now();
  const due = new Date(reminder.send_at).getTime() <= now;
  if (!due) {
    return {
      status: "scheduled",
      label: scheduledLabel,
      helperLabel: queuedBehind,
      tone: "neutral",
    };
  }
  // Past send_at, unsent. Only the nearest one in this quote gets "due".
  if (nextUp && nextUp.id === reminder.id) {
    return { status: "due", label: "Due now", tone: "rust" };
  }
  // Overdue but NOT next in line: it cannot send (cron and manual send both
  // advance one message at a time). Keep the scheduled date as the primary
  // label for contractor clarity; name the blocker as secondary context.
  if (nextUp) {
    return {
      status: "scheduled",
      label: scheduledLabel,
      helperLabel: queuedBehind,
      tone: "neutral",
    };
  }
  return {
    status: "scheduled",
    label: scheduledLabel,
    tone: "neutral",
  };
}
