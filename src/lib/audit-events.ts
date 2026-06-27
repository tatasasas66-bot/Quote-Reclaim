import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIT_EVENT_TYPES = [
  "sms_opened",
  "reply_received",
  "no_reply_yet",
  "one_tap_reply",
  "streak_incremented",
  "streak_reset",
  "sunday_reset_sent",
  "sunday_reset_opened",
  "monday_action_taken",
  "scope_comparison_sent",
  "payment_plan_sent",
  "recovery_report_viewed",
  "price_check_viewed",
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export type AuditEventRow = {
  id: string;
  user_id: string;
  quote_id: string | null;
  event_type: AuditEventType;
  meta: Record<string, unknown>;
  created_at: string;
};

export function isAuditEventsUnavailable(error: {
  code?: string | null;
  message?: string | null;
}): boolean {
  return (
    error.code === "42P01" ||
    error.code === "42501" ||
    error.code === "PGRST205" ||
    /audit_events/i.test(error.message ?? "")
  );
}

export async function recordAuditEvent(
  supabase: SupabaseClient,
  input: {
    userId: string;
    quoteId?: string | null;
    type: AuditEventType;
    meta?: Record<string, unknown>;
  },
): Promise<boolean> {
  const { error } = await supabase.from("audit_events").insert({
    user_id: input.userId,
    quote_id: input.quoteId ?? null,
    event_type: input.type,
    meta: input.meta ?? {},
  });
  return !error;
}

export async function listAuditEvents(
  supabase: SupabaseClient,
  userId: string,
  sinceIso?: string,
): Promise<AuditEventRow[]> {
  let query = supabase
    .from("audit_events")
    .select("id,user_id,quote_id,event_type,meta,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (sinceIso) query = query.gte("created_at", sinceIso);
  const { data, error } = await query;
  if (error) {
    if (isAuditEventsUnavailable(error)) return [];
    throw new Error(`listAuditEvents failed: ${error.message}`);
  }
  return (data ?? []) as AuditEventRow[];
}
