import type { ReminderRow } from "@/lib/quotes/repo";
import { formatScheduleDateTime } from "@/lib/quotes/business-hours";

/**
 * THE single source of truth for "what happens next with this quote".
 *
 * Every surface on the quote detail page that talks about the next follow-up
 * — the Next Best Action field in the summary grid, the Quiet Signal "Best
 * next move", the Recovery plan NEXT MOVE banner, the highlighted follow-up
 * card, and the per-card send button — derives from this one computation.
 * They can never disagree, because none of them computes its own answer.
 *
 * Rules:
 *   - Only the EARLIEST unsent, unpaused reminder is actionable. Ties on
 *     send_at break by followup_number, so the sequence advances strictly
 *     one message at a time even when several are overdue.
 *   - A customer reply suspends the sequence (kind: "none") — the next move
 *     is handling the reply, not firing another follow-up.
 *   - "email-queued"  → future-dated email. The system will send it on the
 *     next window; nothing is overdue. The contractor MAY still take command
 *     and send it by hand now (manual override) — canManualSendToday is true.
 *   - "email-due"     → due/overdue email. The cron will send it; the
 *     contractor MAY send it now if they want to move first.
 *   - "manual-ready"  → copy mode (no email on the reminder's channel).
 *     The contractor sends this one themself.
 */

export type NextMove =
  | { kind: "none" }
  | {
      kind: "email-queued" | "email-due" | "manual-ready";
      reminderId: string;
      followupNumber: number;
      sendAtLabel: string;
      dueNow: boolean;
    };

export function computeNextMove(args: {
  status: "running" | "paused" | "won" | "closed";
  reminders: Pick<
    ReminderRow,
    "id" | "followup_number" | "send_at" | "sent" | "paused_at" | "message_type"
  >[];
  hasEmail: boolean;
  hasReply: boolean;
  now?: number;
}): NextMove {
  if (args.status !== "running") return { kind: "none" };
  // A reply suspends the cadence (the cron auto-pauses on reply). The next
  // move is answering the customer — never claim a follow-up will send.
  if (args.hasReply) return { kind: "none" };

  const next = [...args.reminders]
    .filter((r) => !r.sent && !r.paused_at)
    .sort(
      (a, b) =>
        Date.parse(a.send_at) - Date.parse(b.send_at) ||
        a.followup_number - b.followup_number,
    )[0];
  if (!next) return { kind: "none" };

  const dueNow = Date.parse(next.send_at) <= (args.now ?? Date.now());
  const emailMode = next.message_type === "email" && args.hasEmail;

  return {
    kind: emailMode ? (dueNow ? "email-due" : "email-queued") : "manual-ready",
    reminderId: next.id,
    followupNumber: next.followup_number,
    sendAtLabel: formatScheduleDateTime(next.send_at),
    dueNow,
  };
}

/**
 * Manual "Send today" eligibility — SEPARATE from the automatic due state.
 *
 * The next actionable EMAIL reminder can always be sent by hand: whether its
 * automatic send_at is already due (email-due) or still in a future window
 * (email-queued). This is the manual override the contractor uses to take
 * command of an old quiet quote immediately. It sends ONLY that one reminder
 * and never changes the rest of the schedule.
 *
 * Crucially, true for email-queued does NOT mean the automatic schedule is
 * today — `move.dueNow` stays false and the UI keeps saying "queued for
 * {future date}". Copy-mode (manual-ready, no email) and the no-actionable
 * state (none) are not email-send-eligible; copy mode keeps its own
 * Copy/manual affordance.
 */
export function canManualSendToday(move: NextMove): boolean {
  return move.kind === "email-due" || move.kind === "email-queued";
}

/**
 * Short label for the Next Best Action cell in the quote summary grid.
 * Null when there is no actionable move (caller falls back to the
 * band-based label or "Review plan").
 */
export function nextMoveSummaryLabel(move: NextMove): string | null {
  switch (move.kind) {
    case "none":
      return null;
    case "email-queued":
      return `Follow-up ${move.followupNumber} queued — sends ${move.sendAtLabel}`;
    case "email-due":
      return `Follow-up ${move.followupNumber} due — sends by email today`;
    case "manual-ready":
      return `Copy & send follow-up ${move.followupNumber}`;
  }
}

/**
 * Full one-sentence instruction for the NEXT MOVE banner and the Quiet
 * Signal "Best next move" panel. Wording contract:
 *   - never claims the AUTOMATIC schedule is today when send_at is future
 *     (queued copy keeps the future date and frames "Send it today" as a
 *     manual choice — "Want to move now?")
 *   - never says "Due now" unless the reminder is actually due
 *   - never says "nothing to send by hand" in copy mode
 *   - never implies automatic email when no email exists
 */
export function nextMoveInstruction(move: NextMove): string | null {
  switch (move.kind) {
    case "none":
      return null;
    case "email-queued":
      return `Follow-up ${move.followupNumber} is queued for ${move.sendAtLabel}. Want to move now? Send it today.`;
    case "email-due":
      return `Follow-up ${move.followupNumber} is due now and queued for email. You can let it send, or send it today if you want to move now.`;
    case "manual-ready":
      return `Follow-up ${move.followupNumber} is ready to copy. Send it from your phone or email today.`;
  }
}
