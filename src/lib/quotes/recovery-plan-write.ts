import type { SupabaseClient } from "@supabase/supabase-js";
import { generateRecoveryPlan } from "@/lib/ai/generate-recovery-plan";
import { validateMessage } from "@/lib/ai/validate-message";
import { normalizeToBusinessHour } from "./business-hours";

/** Day-offset cadence for the 5-touch recovery sequence (Day 1, 3, 7, 14, 30). */
const CADENCE_DAYS: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

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

function sendAtFromBase(quoteSentAt: string, daysAfter: number): string {
  const d = new Date(quoteSentAt);
  d.setUTCDate(d.getUTCDate() + daysAfter);
  return normalizeToBusinessHour(d).toISOString();
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
  quoteSentAt: string;
  context: RecoveryWriteContext;
}): Promise<PersistRecoveryPlanResult> {
  const { serviceClient, userId, quoteId, channel, quoteSentAt, context } =
    params;

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
    send_at: sendAtFromBase(quoteSentAt, CADENCE_DAYS[m.followup_number]),
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
