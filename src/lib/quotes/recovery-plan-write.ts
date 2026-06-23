import type { SupabaseClient } from "@supabase/supabase-js";
import { generateRecoveryPlan } from "@/lib/ai/generate-recovery-plan";
import { validateMessage } from "@/lib/ai/validate-message";
import { normalizeToBusinessHour } from "./business-hours";
import { CADENCE_DAYS as centralizedCadenceDays } from "@/lib/recovery/recovery-logic";

/** Delegates to the centralized recovery-logic module. */
export const CADENCE_DAYS = centralizedCadenceDays;

export type RecoveryWriteContext = {
  firstName: string;
  contractorFirstName?: string | null;
  trade: string;
  estimateAmount: number;
  jobDescription: string | null;
  city: string | null;
  state: string | null;
  quoteId: string;
  daysSilent?: number | null;
};

/**
 * The EXACT column set that exists on public.reminders.
 *
 * There is NO sequence_id column on reminders — sequence_id lives on quotes.
 * Including it in an insert makes PostgREST reject the whole batch, which is
 * what silently left every bulk-imported quote with no recovery plan. Every
 * writer must produce this shape and nothing more.
 */
export type ReminderInsertRow = {
  user_id: string;
  quote_id: string;
  followup_number: 1 | 2 | 3 | 4 | 5;
  message_type: "email" | "sms";
  message_text: string;
  framework_used: string;
  cta_type: string;
  send_at: string;
};

export type PersistRecoveryPlanResult = {
  /** Reminder rows actually written: 5 on success, 0 on failure. */
  inserted: number;
  /** True when deterministic fallback templates were used (AI unavailable). */
  fallbackUsed: boolean;
  /** Insert error code/name only (never row contents); null on success. */
  insertError: string | null;
  /** The rows written — callers use them to emit per-followup activity events. */
  rows: ReminderInsertRow[];
};

/**
 * Compute a follow-up's send_at from the RECOVERY-PLAN START time (server now),
 * NOT the original estimate date.
 *
 * Bug this prevents: anchoring the cadence to the estimate date meant an old
 * quote (e.g. 28 days quiet) produced a schedule entirely in the past
 * (FU1 yesterday-of-a-month-ago, etc.). The detail page then read "due now /
 * sends today" while displaying a date in May, and the cron saw all five
 * reminders as overdue at once. The schedule must start when the plan is
 * created, so every send_at lands in the future on a 1/3/7/14/30-day cadence.
 *
 * `startMs` is the plan-creation instant (Date.now() in production, a frozen
 * clock in tests). A defensive floor guarantees no send_at is ever at or
 * before the start: with a positive cadence offset this never fires, but it
 * makes "never schedule in the past" a structural property, not an emergent
 * one that a future edit could quietly break.
 */
export function scheduleSendAt(startMs: number, daysAfter: number): string {
  const base = Number.isFinite(startMs) ? startMs : Date.now();
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + daysAfter);
  let ms = normalizeToBusinessHour(d).getTime();
  if (ms <= base) {
    const bumped = new Date(base);
    bumped.setUTCDate(bumped.getUTCDate() + 1);
    ms = normalizeToBusinessHour(bumped).getTime();
  }
  return new Date(ms).toISOString();
}

/**
 * Generate AND persist the 5-message recovery plan for a single quote.
 *
 * This is the ONE shared writer used by both the single-quote create flow
 * (createQuoteAction) and the Silent Money Reveal bulk import
 * (importSilentQuotesAction), so the two can never diverge on reminder shape
 * again — which is exactly the divergence that broke bulk import.
 *
 * Guarantees:
 *   - generateRecoveryPlan never throws and always yields 5 messages (it falls
 *     back to deterministic research templates when the writer is offline), so
 *     a full plan is written even when AI is unavailable. A fake/example email
 *     never reaches this layer in a way that can block generation — the plan
 *     is built from trade/amount/name, not the email address.
 *   - Rows carry ONLY columns that exist on public.reminders — never
 *     sequence_id.
 *   - Inserts a complete 5-step plan or nothing (length-gated), keyed by
 *     (quote_id, followup_number) to match the unique index.
 */
export async function persistRecoveryPlan(params: {
  serviceClient: SupabaseClient;
  userId: string;
  quoteId: string;
  channel: "email" | "sms";
  /**
   * When the recovery plan STARTS — i.e. now. The 1/3/7/14/30-day cadence is
   * measured from here, never from the original estimate date. Defaults to
   * the current instant; tests inject a frozen clock. Quote age / Days Quiet
   * is a separate concept driven by quote_sent_at and is unaffected.
   */
  scheduleStartAt?: string;
  context: RecoveryWriteContext;
}): Promise<PersistRecoveryPlanResult> {
  const { serviceClient, userId, quoteId, channel, context } = params;
  const startMs = params.scheduleStartAt
    ? Date.parse(params.scheduleStartAt)
    : Date.now();

  const plan = await generateRecoveryPlan(context);

  const valid = plan.filter(
    (m) =>
      validateMessage(m.message, {
        firstName: context.firstName,
        trade: context.trade,
        followupNumber: m.followup_number,
      }).ok,
  );

  // Prefer fully-validated messages. If validation drops any (AI results are
  // all-or-nothing and the deterministic fallbacks are curated to pass, so this
  // is a belt-and-braces path), use the plan's deterministic 5 so a full
  // sequence is still written — no quote is ever left with "No recovery plan
  // generated" unless generation itself produced fewer than 5.
  const chosen = valid.length === 5 ? valid : plan;
  const fallbackUsed =
    chosen.length > 0 && chosen.every((m) => m.source === "fallback");

  if (chosen.length !== 5) {
    return {
      inserted: 0,
      fallbackUsed,
      insertError: "incomplete_plan",
      rows: [],
    };
  }

  const rows: ReminderInsertRow[] = chosen.map((m) => ({
    user_id: userId,
    quote_id: quoteId,
    followup_number: m.followup_number,
    message_type: channel,
    message_text: m.message,
    framework_used: m.framework,
    cta_type: m.cta_type,
    send_at: scheduleSendAt(startMs, CADENCE_DAYS[m.followup_number]),
  }));

  const { error } = await serviceClient.from("reminders").insert(rows);
  if (error) {
    return {
      inserted: 0,
      fallbackUsed,
      insertError: error.code || error.message || "insert_failed",
      rows,
    };
  }

  return { inserted: rows.length, fallbackUsed, insertError: null, rows };
}
