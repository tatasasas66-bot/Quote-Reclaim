/**
 * Server-only Supabase repository for the auto-marketing engine.
 *
 * All functions use the service client (RLS-bypassing) because admin
 * reads/writes span tenants. The app layer (requireAdmin) gates access
 * before any of these are called.
 */
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { scoreLeadWithFirstName } from "./scoring";
import {
  classifyReply,
  draftReplyFor,
  isSuppressing,
  suppressionReason,
} from "./classify";
import type {
  ImportedLeadRow,
  LeadStatus,
  ReplyClassification,
  ScoredLead,
} from "./types";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/auto-marketing/repo.ts must never be imported on the client.",
  );
}

export type LeadRow = {
  id: string;
  company: string;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  trade: string;
  niche: string | null;
  source: string | null;
  gbp_url: string | null;
  review_count: number | null;
  review_response_rate: number | null;
  public_signal: string | null;
  last_gbp_post: string | null;
  license_status: string | null;
  notes: string | null;
  score: number;
  status: LeadStatus;
  sendable: boolean;
  campaign_id: string | null;
  smartlead_id: string | null;
  created_at: string;
  suppressed_at: string | null;
  suppressed_reason: string | null;
};

export type CampaignRow = {
  id: string;
  name: string;
  trade: string;
  city: string | null;
  subject: string;
  email_variant: string;
  status: string;
  created_at: string;
};

export type ReplyRow = {
  id: string;
  lead_id: string;
  email: string | null;
  reply_body: string | null;
  reply_date: string;
  classification: ReplyClassification;
  confidence: number;
  action_taken: string;
  draft_reply: string | null;
  draft_approved: boolean;
  draft_sent: boolean;
};

export type OverviewStats = {
  total_leads: number;
  approved_leads: number;
  suppressed_leads: number;
  emails_queued: number;
  emails_sent: number;
  replies: number;
  positive_replies: number;
  audit_visits: number;
  audit_completions: number;
  signups: number;
  checkout_started: number;
  paid_customers: number;
  best_trade: string | null;
  best_city: string | null;
  best_subject: string | null;
  best_email_variant: string | null;
};

function svc() {
  return createServiceSupabaseClient();
}

// ---------------------------------------------------------------------------
// Lead import + scoring
// ---------------------------------------------------------------------------

export async function importLeads(
  rows: ImportedLeadRow[],
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  const supabase = svc();

  for (const row of rows) {
    if (!row.company || !row.trade) {
      skipped++;
      errors.push(`Missing company or trade: ${row.company ?? "(no company)"}`);
      continue;
    }

    // Dedupe on email (if present) or company+phone.
    if (row.email) {
      const { data: existing } = await supabase
        .from("auto_marketing_leads")
        .select("id")
        .eq("email", row.email.toLowerCase().trim())
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
    }

    const reviewCount =
      typeof row.review_count === "string"
        ? Number(row.review_count) || null
        : (row.review_count as number | null) ?? null;
    const reviewResponseRate =
      typeof row.review_response_rate === "string"
        ? Number(row.review_response_rate) || null
        : (row.review_response_rate as number | null) ?? null;

    const scored: ScoredLead = scoreLeadWithFirstName(
      {
        trade: row.trade,
        email: row.email ?? null,
        website: row.website ?? null,
        reviewCount,
        reviewResponseRate,
        publicSignal: row.public_signal ?? null,
        notes: row.notes ?? null,
        city: row.city ?? null,
        niche: row.niche ?? null,
      },
      row.first_name ?? null,
    );

    const { error } = await supabase.from("auto_marketing_leads").insert({
      company: row.company,
      first_name: row.first_name ?? null,
      email: row.email ? row.email.toLowerCase().trim() : null,
      phone: row.phone ?? null,
      website: row.website ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      trade: row.trade,
      niche: row.niche ?? null,
      source: row.source ?? null,
      gbp_url: row.gbp_url ?? null,
      review_count: reviewCount,
      review_response_rate: reviewResponseRate,
      public_signal: row.public_signal ?? null,
      last_gbp_post: row.last_gbp_post ?? null,
      license_status: row.license_status ?? null,
      notes: row.notes ?? null,
      score: scored.score,
      status: scored.status,
      sendable: scored.sendable,
    });

    if (error) {
      skipped++;
      errors.push(`${row.company}: ${error.message}`);
      continue;
    }
    imported++;
  }

  return { imported, skipped, errors };
}

/** Re-score all leads (run after editing fields or adjusting weights). */
export async function rescoreAllLeads(): Promise<{ rescored: number }> {
  const supabase = svc();
  const { data: leads, error } = await supabase
    .from("auto_marketing_leads")
    .select("*")
    .neq("status", "suppressed");

  if (error || !leads) return { rescored: 0 };

  let rescored = 0;
  for (const lead of leads) {
    const scored = scoreLeadWithFirstName(
      {
        trade: lead.trade,
        email: lead.email,
        website: lead.website,
        reviewCount: lead.review_count,
        reviewResponseRate: lead.review_response_rate,
        publicSignal: lead.public_signal,
        notes: lead.notes,
        city: lead.city,
        niche: lead.niche,
      },
      lead.first_name,
    );
    await supabase
      .from("auto_marketing_leads")
      .update({
        score: scored.score,
        status: scored.status,
        sendable: scored.sendable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
    rescored++;
  }
  return { rescored };
}

// ---------------------------------------------------------------------------
// Lead queries + export
// ---------------------------------------------------------------------------

export async function listLeads(opts?: {
  trade?: string;
  city?: string;
  status?: LeadStatus;
  minScore?: number;
  limit?: number;
}): Promise<LeadRow[]> {
  const supabase = svc();
  let q = supabase.from("auto_marketing_leads").select("*");
  if (opts?.trade) q = q.eq("trade", opts.trade);
  if (opts?.city) q = q.eq("city", opts.city);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.minScore != null) q = q.gte("score", opts.minScore);
  q = q.order("score", { ascending: false }).limit(opts?.limit ?? 500);
  const { data, error } = await q;
  if (error || !data) return [];
  return data as LeadRow[];
}

export async function listApprovedSendableLeads(): Promise<LeadRow[]> {
  const supabase = svc();
  const { data, error } = await supabase
    .from("auto_marketing_leads")
    .select("*")
    .eq("status", "approved")
    .eq("sendable", true)
    .order("score", { ascending: false });
  if (error || !data) return [];
  return data as LeadRow[];
}

export async function listSuppressedEmails(): Promise<string[]> {
  const supabase = svc();
  const { data, error } = await supabase
    .from("auto_marketing_suppression")
    .select("email");
  if (error || !data) return [];
  return data.map((r) => r.email as string);
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function listCampaigns(): Promise<CampaignRow[]> {
  const supabase = svc();
  const { data, error } = await supabase
    .from("auto_marketing_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as CampaignRow[];
}

export async function ensureDefaultCampaign(): Promise<CampaignRow | null> {
  const supabase = svc();
  const { data: existing } = await supabase
    .from("auto_marketing_campaigns")
    .select("*")
    .eq("name", "concrete_driveway_v1")
    .maybeSingle();
  if (existing) return existing as CampaignRow;

  const { data, error } = await supabase
    .from("auto_marketing_campaigns")
    .insert({
      name: "concrete_driveway_v1",
      trade: "concrete",
      city: null,
      subject: "quiet concrete quotes — {company}",
      email_variant: "concrete_v1",
      status: "draft",
    })
    .select("*")
    .single();
  if (error || !data) return null;
  return data as CampaignRow;
}

// ---------------------------------------------------------------------------
// Reply ingestion + classification + suppression
// ---------------------------------------------------------------------------

export type IngestReplyInput = {
  lead_id?: string | null;
  email: string;
  reply_body: string;
  reply_date?: string;
};

export async function ingestReply(
  input: IngestReplyInput,
): Promise<{ reply: ReplyRow | null; suppressed: boolean; classification: ReplyClassification }> {
  const supabase = svc();
  const { classification, confidence } = classifyReply(input.reply_body);
  const suppressed = isSuppressing(classification);

  // Resolve lead by email if lead_id not provided.
  let leadId = input.lead_id ?? null;
  if (!leadId && input.email) {
    const { data: lead } = await supabase
      .from("auto_marketing_leads")
      .select("id, company")
      .eq("email", input.email.toLowerCase().trim())
      .maybeSingle();
    if (lead) leadId = lead.id as string;
  }

  const draftReply = suppressed
    ? null
    : draftReplyFor(classification, await getCompanyName(leadId));

  const { data: replyRow, error } = await supabase
    .from("auto_marketing_replies")
    .insert({
      lead_id: leadId,
      email: input.email.toLowerCase().trim(),
      reply_body: input.reply_body,
      reply_date: input.reply_date ?? new Date().toISOString(),
      classification,
      confidence,
      action_taken: suppressed ? "suppressed" : "drafted",
      draft_reply: draftReply,
      draft_approved: false,
      draft_sent: false,
    })
    .select("*")
    .single();

  if (error || !replyRow) {
    return { reply: null, suppressed, classification };
  }

  // If suppressing, flip lead status + insert suppression row.
  if (suppressed && leadId) {
    const reason = suppressionReason(classification);
    await supabase
      .from("auto_marketing_leads")
      .update({
        status: "suppressed",
        sendable: false,
        suppressed_at: new Date().toISOString(),
        suppressed_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);
    await supabase.from("auto_marketing_suppression").insert({
      lead_id: leadId,
      email: input.email.toLowerCase().trim(),
      reason: reason ?? "reply_suppressed",
      source_reply_id: replyRow.id as string,
    });
    // Also record a reply_received event.
    await supabase.from("auto_marketing_events").insert({
      lead_id: leadId,
      event_type: "reply_received",
      event_data: { classification, suppressed: true },
    });
  } else if (leadId) {
    await supabase.from("auto_marketing_events").insert({
      lead_id: leadId,
      event_type: "reply_received",
      event_data: { classification, suppressed: false },
    });
  }

  return { reply: replyRow as ReplyRow, suppressed, classification };
}

async function getCompanyName(leadId: string | null): Promise<string | null> {
  if (!leadId) return null;
  const supabase = svc();
  const { data } = await supabase
    .from("auto_marketing_leads")
    .select("company")
    .eq("id", leadId)
    .maybeSingle();
  return (data?.company as string) ?? null;
}

/** Mark a reply's draft as sent (used by auto-send when AUTO_SEND_SAFE_REPLIES=true). */
export async function markReplySent(replyId: string): Promise<void> {
  const supabase = svc();
  await supabase
    .from("auto_marketing_replies")
    .update({
      draft_sent: true,
      draft_approved: true,
      action_taken: "auto_sent",
    })
    .eq("id", replyId);
}

export async function listReplies(opts?: {
  classification?: ReplyClassification;
  limit?: number;
}): Promise<ReplyRow[]> {
  const supabase = svc();
  let q = supabase.from("auto_marketing_replies").select("*");
  if (opts?.classification) q = q.eq("classification", opts.classification);
  q = q.order("reply_date", { ascending: false }).limit(opts?.limit ?? 200);
  const { data, error } = await q;
  if (error || !data) return [];
  return data as ReplyRow[];
}

// ---------------------------------------------------------------------------
// Audit attribution (anonymous, no PII)
// ---------------------------------------------------------------------------

export async function recordAuditAttribution(input: {
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_trade?: string | null;
  utm_city?: string | null;
  visitor_hash?: string | null;
  audit_started?: boolean;
  audit_completed?: boolean;
  total_quiet_value_bucket?: string | null;
  top_recovery_window?: string | null;
  cta_clicked?: boolean;
  signup_started?: boolean;
  checkout_started?: boolean;
  paid_customer?: boolean;
}): Promise<void> {
  const supabase = svc();
  await supabase.from("audit_attribution_events").insert({
    utm_source: input.utm_source ?? null,
    utm_campaign: input.utm_campaign ?? null,
    utm_trade: input.utm_trade ?? null,
    utm_city: input.utm_city ?? null,
    visitor_hash: input.visitor_hash ?? null,
    audit_started: input.audit_started ?? false,
    audit_completed: input.audit_completed ?? false,
    total_quiet_value_bucket: input.total_quiet_value_bucket ?? null,
    top_recovery_window: input.top_recovery_window ?? null,
    cta_clicked: input.cta_clicked ?? false,
    signup_started: input.signup_started ?? false,
    checkout_started: input.checkout_started ?? false,
    paid_customer: input.paid_customer ?? false,
  });
}

// ---------------------------------------------------------------------------
// Overview stats
// ---------------------------------------------------------------------------

export async function getOverviewStats(): Promise<OverviewStats> {
  const supabase = svc();

  const { count: totalLeads } = await supabase
    .from("auto_marketing_leads")
    .select("*", { count: "exact", head: true });
  const { count: approvedLeads } = await supabase
    .from("auto_marketing_leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved");
  const { count: suppressedLeads } = await supabase
    .from("auto_marketing_leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "suppressed");
  const { count: emailsQueued } = await supabase
    .from("auto_marketing_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "email_queued");
  const { count: emailsSent } = await supabase
    .from("auto_marketing_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "email_sent");
  const { count: replies } = await supabase
    .from("auto_marketing_replies")
    .select("*", { count: "exact", head: true });
  const { count: positiveReplies } = await supabase
    .from("auto_marketing_replies")
    .select("*", { count: "exact", head: true })
    .in("classification", [
      "interested",
      "asks_price",
      "asks_how_it_works",
      "lead_gen_confusion",
      "existing_crm_objection",
      "wrong_person",
    ]);
  const { count: auditVisits } = await supabase
    .from("audit_attribution_events")
    .select("*", { count: "exact", head: true })
    .eq("audit_started", true);
  const { count: auditCompletions } = await supabase
    .from("audit_attribution_events")
    .select("*", { count: "exact", head: true })
    .eq("audit_completed", true);
  const { count: signups } = await supabase
    .from("audit_attribution_events")
    .select("*", { count: "exact", head: true })
    .eq("signup_started", true);
  const { count: checkoutStarted } = await supabase
    .from("audit_attribution_events")
    .select("*", { count: "exact", head: true })
    .eq("checkout_started", true);
  const { count: paidCustomers } = await supabase
    .from("audit_attribution_events")
    .select("*", { count: "exact", head: true })
    .eq("paid_customer", true);

  // Best trade / city / subject / variant — by positive reply count.
  const { data: tradeData } = await supabase
    .from("auto_marketing_replies")
    .select("lead_id")
    .in("classification", ["interested", "asks_price", "asks_how_it_works"]);
  let bestTrade: string | null = null;
  if (tradeData && tradeData.length > 0) {
    const leadIds = Array.from(new Set(tradeData.map((r) => r.lead_id as string)));
    const { data: leads } = await supabase
      .from("auto_marketing_leads")
      .select("trade")
      .in("id", leadIds);
    if (leads) {
      const counts = new Map<string, number>();
      for (const l of leads) {
        const t = (l as { trade: string }).trade;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      bestTrade = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }
  }

  return {
    total_leads: totalLeads ?? 0,
    approved_leads: approvedLeads ?? 0,
    suppressed_leads: suppressedLeads ?? 0,
    emails_queued: emailsQueued ?? 0,
    emails_sent: emailsSent ?? 0,
    replies: replies ?? 0,
    positive_replies: positiveReplies ?? 0,
    audit_visits: auditVisits ?? 0,
    audit_completions: auditCompletions ?? 0,
    signups: signups ?? 0,
    checkout_started: checkoutStarted ?? 0,
    paid_customers: paidCustomers ?? 0,
    best_trade: bestTrade,
    best_city: null,
    best_subject: null,
    best_email_variant: null,
  };
}
