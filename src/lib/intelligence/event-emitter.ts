import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type RecoveryEventType =
  | "estimate_created"
  | "followup_generated"
  | "message_sent"
  | "message_delivered"
  | "reply_received"
  | "win_recorded"
  | "sequence_closed"
  | "opt_out";

export type RecoveryEventInput = {
  userId: string;
  sequenceId: string;
  quoteId: string | null;
  eventType: RecoveryEventType;
  trade?: string | null;
  city?: string | null;
  state?: string | null;
  estimateAmount?: number | null;
  daysSinceEstimate?: number | null;
  followupNumber?: number | null;
  messageType?: string | null;
  frameworkUsed?: string | null;
  ctaType?: string | null;
  channel?: string | null;
  sourceEventId?: string | null;
  isWinningEvent?: boolean;
};

/**
 * Maps an estimate dollar amount to a coarse value band used by the Recovery
 * Graph. Bands are intentionally broad — fine-grained dollar amounts get
 * benchmarked together so we can compare across trades and regions without
 * leaking individual quote values.
 */
function valueBandFor(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  if (amount < 1_000) return "under_1k";
  if (amount < 5_000) return "1k_5k";
  if (amount < 15_000) return "5k_15k";
  if (amount < 50_000) return "15k_50k";
  return "over_50k";
}

/**
 * Append-only Recovery Graph event emitter.
 *
 * Telemetry must never break the parent flow: any failure is swallowed and
 * logged. The (source_event_id, event_type) unique index handles duplicates
 * raised by webhook retries.
 */
export async function emitRecoveryEvent(
  input: RecoveryEventInput,
): Promise<void> {
  try {
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from("recovery_events").insert({
      user_id: input.userId,
      sequence_id: input.sequenceId,
      quote_id: input.quoteId,
      event_type: input.eventType,
      trade: input.trade ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      estimate_amount: input.estimateAmount ?? null,
      value_band: valueBandFor(input.estimateAmount),
      days_since_estimate: input.daysSinceEstimate ?? null,
      followup_number: input.followupNumber ?? null,
      message_type: input.messageType ?? null,
      framework_used: input.frameworkUsed ?? null,
      cta_type: input.ctaType ?? null,
      channel: input.channel ?? null,
      source_event_id: input.sourceEventId ?? null,
      is_winning_event: input.isWinningEvent ?? false,
    });
    if (error && error.code !== "23505") {
      console.error(
        `[recovery_events] insert failed (${input.eventType}): ${error.message}`,
      );
    }
  } catch (err) {
    console.error(
      `[recovery_events] unexpected error (${input.eventType})`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
