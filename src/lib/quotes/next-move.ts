import type { ReminderRow } from "@/lib/quotes/repo";
import { formatScheduleDateTime } from "@/lib/quotes/business-hours";
import { getSequenceFamily } from "@/lib/recovery/recovery-logic";

/** Map follow-up number → family name from centralized recovery-logic. */
function familyName(n: number): string {
  return getSequenceFamily(n as 1 | 2 | 3 | 4 | 5);
}

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
 *     next window; nothing is overdue. The contractor may take command and
 *     send it by hand now ONLY when it is the very first recovery touch
 *     (nothing sent yet for this quote) — that is the `canSendEarly` flag.
 *     Once any recovery email has gone out, a future-queued follow-up waits
 *     for its window (no rapid-fire).
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
      /**
       * True when the next actionable EMAIL reminder may be sent by hand right
       * now. Two cases only:
       *   - it is genuinely due (dueNow), OR
       *   - it is the FIRST recovery touch with nothing sent yet for the quote
       *     (the "take command of an old quiet quote" override).
       * After any recovery email has been sent, a future-queued follow-up is
       * NOT early-sendable — it waits for its window, preventing rapid-fire
       * back-to-back sends. Always false for copy mode / no actionable move.
       */
      canSendEarly: boolean;
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
  // Has ANY recovery email already gone out for this quote? The first-touch
  // manual override is only available before that. After the first send, a
  // future-queued follow-up must wait for its window — no rapid-fire.
  const anySent = args.reminders.some((r) => r.sent);
  const canSendEarly = emailMode && (dueNow || !anySent);

  return {
    kind: emailMode ? (dueNow ? "email-due" : "email-queued") : "manual-ready",
    reminderId: next.id,
    followupNumber: next.followup_number,
    sendAtLabel: formatScheduleDateTime(next.send_at),
    dueNow,
    canSendEarly,
  };
}

/**
 * Manual "Send today" eligibility — SEPARATE from the automatic due state.
 *
 * True only when the move is the next actionable EMAIL reminder AND
 * `canSendEarly` holds: either it is genuinely due, or it is the first
 * recovery touch with nothing sent yet. After the first recovery email goes
 * out, a future-queued follow-up returns false here, so the UI shows Copy
 * only until that follow-up's send window actually arrives — this is what
 * stops rapid-fire back-to-back sends. Copy-mode (manual-ready) and the
 * no-actionable state (none) are never email-send-eligible.
 */
export function canManualSendToday(move: NextMove): boolean {
  return (
    (move.kind === "email-due" || move.kind === "email-queued") &&
    move.canSendEarly
  );
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
      return `${familyName(move.followupNumber)} queued — sends ${move.sendAtLabel}`;
    case "email-due":
      return `${familyName(move.followupNumber)} due — sends by email today`;
    case "manual-ready":
      return `Copy & send ${familyName(move.followupNumber)}`;
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
    case "email-queued": {
      const family = familyName(move.followupNumber);
      return move.canSendEarly
        ? `${family} is queued for ${move.sendAtLabel}. Want to move now? Send it today.`
        : `${family} is queued for the next send window — ${move.sendAtLabel}.`;
    }
    case "email-due": {
      const family = familyName(move.followupNumber);
      return `${family} is due now and queued for email. You can let it send, or send it today if you want to move now.`;
    }
    case "manual-ready": {
      const family = familyName(move.followupNumber);
      return `${family} is ready to copy. Send it from your phone or email today.`;
    }
  }
}
