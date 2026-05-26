import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface ActivityEvent {
  id: string;
  event_type: string;
  trade: string | null;
  estimate_amount: number | null;
  followup_number: number | null;
  reply_intent: string | null;
  created_at: string;
  quote_id: string | null;
  client_name?: string;
}

/**
 * Recent Recovery Graph events for the signed-in contractor, newest first,
 * enriched with the client name from the originating quote. Runs under the
 * user-scoped client (RLS policy events_select_own restricts to own rows).
 */
export async function listRecentEvents(
  userId: string,
  limit = 8,
): Promise<ActivityEvent[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("recovery_events")
    .select(
      "id, event_type, trade, estimate_amount, followup_number, reply_intent, created_at, quote_id",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data) return [];

  const quoteIds = Array.from(
    new Set(data.map((e) => e.quote_id).filter(Boolean)),
  ) as string[];

  const nameMap = new Map<string, string>();
  if (quoteIds.length) {
    const { data: quotes } = await supabase
      .from("quotes")
      .select("id, client_name")
      .in("id", quoteIds);
    for (const q of quotes ?? []) {
      nameMap.set(String(q.id), String(q.client_name ?? ""));
    }
  }

  return data.map((e) => ({
    id: String(e.id),
    event_type: String(e.event_type),
    trade: e.trade ?? null,
    estimate_amount:
      e.estimate_amount == null ? null : Number(e.estimate_amount),
    followup_number: e.followup_number ?? null,
    reply_intent: e.reply_intent ?? null,
    created_at: String(e.created_at),
    quote_id: e.quote_id ?? null,
    client_name: nameMap.get(e.quote_id ?? "") || undefined,
  }));
}
