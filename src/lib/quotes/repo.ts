import type { SupabaseClient } from "@supabase/supabase-js";

export type QuoteOutcome = "pending" | "won" | "closed";

export type QuoteRow = {
  id: string;
  user_id: string;
  trade: string;
  city: string | null;
  state: string | null;
  estimate_amount: number;
  job_description: string | null;
  days_silent: number;
  quote_sent_at: string | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_opted_out: boolean;
  outcome: QuoteOutcome;
  won_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileStats = {
  jobs_won: number;
  recovered_amount: number;
  usage_count: number;
  is_paid: boolean;
};

export async function listPendingQuotes(
  supabase: SupabaseClient,
  userId: string,
): Promise<QuoteRow[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("user_id", userId)
    .eq("outcome", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPendingQuotes failed: ${error.message}`);
  return (data ?? []) as QuoteRow[];
}

export async function getQuoteById(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<QuoteRow | null> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getQuoteById failed: ${error.message}`);
  return (data as QuoteRow | null) ?? null;
}

export type ReminderRow = {
  id: string;
  user_id: string;
  quote_id: string;
  followup_number: 1 | 2 | 3 | 4 | 5;
  message_type: string;
  message_text: string;
  framework_used: string | null;
  cta_type: string | null;
  send_at: string;
  sent: boolean;
  sent_at: string | null;
  paused_at: string | null;
  created_at: string;
};

export async function listRemindersForQuote(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
): Promise<ReminderRow[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select(
      "id,user_id,quote_id,followup_number,message_type,message_text,framework_used,cta_type,send_at,sent,sent_at,paused_at,created_at",
    )
    .eq("quote_id", quoteId)
    .eq("user_id", userId)
    .order("followup_number", { ascending: true });
  if (error) throw new Error(`listRemindersForQuote failed: ${error.message}`);
  return (data ?? []) as ReminderRow[];
}

export async function getProfileStats(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileStats | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("jobs_won, recovered_amount, usage_count, is_paid")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`getProfileStats failed: ${error.message}`);
  if (!data) return null;
  return {
    jobs_won: data.jobs_won ?? 0,
    recovered_amount: Number(data.recovered_amount ?? 0),
    usage_count: data.usage_count ?? 0,
    is_paid: Boolean(data.is_paid),
  };
}

export type WonQuoteSummary = {
  id: string;
  client_name: string;
  trade: string;
  estimate_amount: number;
  won_at: string;
  created_at: string;
};

/**
 * Lifetime won quotes with the fields needed to compute avg days to win and
 * to render the "Jobs Won Back" gallery. Used by the dashboard.
 */
export async function listWonQuotes(
  supabase: SupabaseClient,
  userId: string,
): Promise<WonQuoteSummary[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("id, client_name, trade, estimate_amount, won_at, created_at")
    .eq("user_id", userId)
    .eq("outcome", "won")
    .not("won_at", "is", null)
    .order("won_at", { ascending: false });
  if (error) throw new Error(`listWonQuotes failed: ${error.message}`);
  return (data ?? []).map((q) => ({
    id: String(q.id),
    client_name: String(q.client_name ?? ""),
    trade: String(q.trade ?? ""),
    estimate_amount: Number(q.estimate_amount ?? 0),
    won_at: String(q.won_at),
    created_at: String(q.created_at),
  }));
}
