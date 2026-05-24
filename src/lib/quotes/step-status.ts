import type { ReminderRow } from "@/lib/quotes/repo";

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
      label: `Sent ${formatTime(reminder.sent_at)}`,
      tone: "success",
    };
  }
  const now = Date.now();
  const due = new Date(reminder.send_at).getTime() <= now;
  if (!due) {
    return {
      status: "scheduled",
      label: `Scheduled ${formatDate(reminder.send_at)}`,
      tone: "neutral",
    };
  }
  // Past send_at, unsent. Only the nearest one in this quote gets "due".
  const nextUp = [...allRemindersForQuote]
    .filter((r) => !r.sent && !r.paused_at)
    .sort((a, b) => +new Date(a.send_at) - +new Date(b.send_at))[0];
  if (nextUp && nextUp.id === reminder.id) {
    return { status: "due", label: "Due now", tone: "rust" };
  }
  return {
    status: "scheduled",
    label: `Scheduled ${formatDate(reminder.send_at)}`,
    tone: "neutral",
  };
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
  }).format(new Date(iso));
}
