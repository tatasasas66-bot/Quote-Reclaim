import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getCompliancePostalAddress } from "./config";
import { buildMarketingAuditUrl, classifySuppressionText } from "./safety";
import { normalizeMarketingEmail } from "./normalize";
import { refreshOldDefaultMarketingSequenceConfig } from "./sequence";
import type {
  MarketingCampaign,
  MarketingCampaignStatus,
  MarketingLead,
  MarketingMetrics,
  MarketingMode,
  MarketingReplyStatus,
  MarketingRun,
  NormalizedApifyPlace,
  VerificationStatus,
} from "./types";

if (typeof window !== "undefined") {
  throw new Error("src/lib/marketing/repo.ts is server-only");
}

function db() {
  return createServiceSupabaseClient();
}

export async function listMarketingCampaigns(): Promise<MarketingCampaign[]> {
  const client = db();
  const { data } = await client
    .from("marketing_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  return Promise.all(
    ((data ?? []) as MarketingCampaign[]).map((campaign) =>
      refreshCampaignSequenceIfOldDefault(client, campaign),
    ),
  );
}

export async function getMarketingCampaign(
  id: string,
): Promise<MarketingCampaign | null> {
  const client = db();
  const { data } = await client
    .from("marketing_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const campaign = (data as MarketingCampaign | null) ?? null;
  return campaign
    ? refreshCampaignSequenceIfOldDefault(client, campaign)
    : null;
}

export async function getMarketingCampaignBySmartleadId(
  smartleadCampaignId: string,
): Promise<MarketingCampaign | null> {
  const client = db();
  const { data } = await client
    .from("marketing_campaigns")
    .select("*")
    .eq("smartlead_campaign_id", smartleadCampaignId)
    .maybeSingle();
  const campaign = (data as MarketingCampaign | null) ?? null;
  return campaign
    ? refreshCampaignSequenceIfOldDefault(client, campaign)
    : null;
}

async function refreshCampaignSequenceIfOldDefault(
  client: ReturnType<typeof db>,
  campaign: MarketingCampaign,
): Promise<MarketingCampaign> {
  const nextSequence = refreshOldDefaultMarketingSequenceConfig(
    campaign.sequence_config,
    getCompliancePostalAddress(),
  );
  if (nextSequence === campaign.sequence_config) return campaign;
  const { data, error } = await client
    .from("marketing_campaigns")
    .update({
      sequence_config: nextSequence,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaign.id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Campaign sequence refresh failed");
  }
  return data as MarketingCampaign;
}

export async function createMarketingCampaign(input: {
  name: string;
  slug: string;
  trade: string;
  city: string;
  searchQuery: string;
  apifyActorId?: string | null;
  smartleadCampaignId?: string | null;
  dailyCap: number;
  mode: MarketingMode;
  status: MarketingCampaignStatus;
  sequenceConfig: Record<string, unknown>;
}): Promise<MarketingCampaign> {
  const { data, error } = await db()
    .from("marketing_campaigns")
    .insert({
      name: input.name,
      slug: input.slug,
      trade: input.trade,
      city: input.city,
      search_query: input.searchQuery,
      apify_actor_id: input.apifyActorId ?? null,
      smartlead_campaign_id: input.smartleadCampaignId ?? null,
      daily_cap: input.dailyCap,
      mode: input.mode,
      status: input.status,
      sequence_config: input.sequenceConfig,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Campaign creation failed");
  return data as MarketingCampaign;
}

export async function updateMarketingCampaign(
  id: string,
  patch: Partial<{
    status: MarketingCampaignStatus;
    mode: MarketingMode;
    smartlead_campaign_id: string | null;
    daily_cap: number;
    last_run_at: string;
    sequence_config: Record<string, unknown>;
  }>,
): Promise<void> {
  const { error } = await db()
    .from("marketing_campaigns")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createMarketingRun(
  campaignId: string,
): Promise<MarketingRun> {
  const { data, error } = await db()
    .from("marketing_runs")
    .insert({
      campaign_id: campaignId,
      source: "apify",
      status: "queued",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Run creation failed");
  return data as MarketingRun;
}

export async function updateMarketingRun(
  id: string,
  patch: Partial<MarketingRun>,
): Promise<void> {
  const { id: _id, campaign_id: _campaignId, ...safePatch } = patch;
  void _id;
  void _campaignId;
  const { error } = await db()
    .from("marketing_runs")
    .update({ ...safePatch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function latestOpenMarketingRun(
  campaignId: string,
): Promise<MarketingRun | null> {
  const { data } = await db()
    .from("marketing_runs")
    .select("*")
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MarketingRun | null) ?? null;
}

export async function latestMarketingRun(
  campaignId: string,
): Promise<MarketingRun | null> {
  const { data } = await db()
    .from("marketing_runs")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MarketingRun | null) ?? null;
}

export async function listMarketingRuns(limit = 20): Promise<MarketingRun[]> {
  const { data } = await db()
    .from("marketing_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as MarketingRun[];
}

export async function listMarketingLeads(
  campaignId?: string,
  limit = 300,
): Promise<MarketingLead[]> {
  let query = db()
    .from("marketing_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data } = await query;
  return (data ?? []) as MarketingLead[];
}

export type PersistDatasetResult = {
  leadsFound: number;
  websitesFound: number;
  emailsFound: number;
  inserted: number;
  skippedNoEmail: number;
  skippedDuplicates: number;
  skippedSuppressed: number;
};

export async function persistApifyDataset(input: {
  campaign: MarketingCampaign;
  run: MarketingRun;
  places: NormalizedApifyPlace[];
}): Promise<PersistDatasetResult> {
  const client = db();
  const [{ data: existing }, { data: suppression }] = await Promise.all([
    client.from("marketing_leads").select("email, website_domain, source_place_id"),
    client.from("marketing_suppression_list").select("email, domain"),
  ]);
  const knownEmails = new Set(
    (existing ?? [])
      .map((row) => (typeof row.email === "string" ? row.email.toLowerCase() : ""))
      .filter(Boolean),
  );
  const knownDomains = new Set(
    (existing ?? [])
      .map((row) =>
        typeof row.website_domain === "string" ? row.website_domain.toLowerCase() : "",
      )
      .filter(Boolean),
  );
  const knownPlaces = new Set(
    (existing ?? [])
      .map((row) =>
        typeof row.source_place_id === "string" ? row.source_place_id : "",
      )
      .filter(Boolean),
  );
  const suppressedEmails = new Set(
    (suppression ?? [])
      .map((row) => (typeof row.email === "string" ? row.email.toLowerCase() : ""))
      .filter(Boolean),
  );
  const suppressedDomains = new Set(
    (suppression ?? [])
      .map((row) => (typeof row.domain === "string" ? row.domain.toLowerCase() : ""))
      .filter(Boolean),
  );

  const result: PersistDatasetResult = {
    leadsFound: input.places.length,
    websitesFound: 0,
    emailsFound: 0,
    inserted: 0,
    skippedNoEmail: 0,
    skippedDuplicates: 0,
    skippedSuppressed: 0,
  };

  for (const place of input.places) {
    if (place.website) result.websitesFound++;
    result.emailsFound += place.emails.length;
    const email = place.emails[0] ?? null;
    const domain = place.websiteDomain;
    const duplicate =
      (email && knownEmails.has(email)) ||
      (domain && knownDomains.has(domain)) ||
      (place.sourcePlaceId && knownPlaces.has(place.sourcePlaceId));
    if (duplicate) {
      result.skippedDuplicates++;
      continue;
    }
    const suppressed =
      (email && suppressedEmails.has(email)) ||
      (domain && suppressedDomains.has(domain));
    if (suppressed) result.skippedSuppressed++;
    if (!email) result.skippedNoEmail++;

    const { error } = await client.from("marketing_leads").insert({
      campaign_id: input.campaign.id,
      company_name: place.companyName,
      first_name: place.firstName,
      trade: input.campaign.trade,
      city: place.city,
      website: place.website,
      website_domain: domain,
      email,
      phone: place.phone,
      address: place.address,
      google_maps_url: place.googleMapsUrl,
      source: "apify",
      source_place_id: place.sourcePlaceId,
      apify_run_id: input.run.apify_run_id,
      verification_status: "unverified",
      suppressed: Boolean(suppressed),
      suppression_reason: suppressed ? "matched_suppression_list" : null,
      audit_url: buildMarketingAuditUrl({
        campaignSlug: input.campaign.slug,
        trade: input.campaign.trade,
        city: input.campaign.city,
      }),
    });
    if (!error) {
      result.inserted++;
      if (email) knownEmails.add(email);
      if (domain) knownDomains.add(domain);
      if (place.sourcePlaceId) knownPlaces.add(place.sourcePlaceId);
    } else if (error.code === "23505") {
      result.skippedDuplicates++;
    } else {
      throw new Error(error.message);
    }
  }
  return result;
}

export async function listPendingVerification(
  campaignId: string,
  limit = 50,
): Promise<MarketingLead[]> {
  const { data } = await db()
    .from("marketing_leads")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("verification_status", "unverified")
    .eq("suppressed", false)
    .not("email", "is", null)
    .limit(limit);
  return (data ?? []) as MarketingLead[];
}

export async function updateLeadVerification(
  leadId: string,
  status: VerificationStatus,
  detail: string,
): Promise<void> {
  const { error } = await db()
    .from("marketing_leads")
    .update({
      verification_status: status,
      verification_detail: detail,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
}

export async function listUploadEligibleLeads(
  campaignId: string,
  limit = 100,
): Promise<MarketingLead[]> {
  const { data } = await db()
    .from("marketing_leads")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("verification_status", "valid")
    .eq("suppressed", false)
    .is("smartlead_status", null)
    .not("email", "is", null)
    .limit(limit);
  return (data ?? []) as MarketingLead[];
}

export async function countCampaignUploadsToday(campaignId: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await db()
    .from("marketing_events")
    .select("*", { head: true, count: "exact" })
    .eq("campaign_id", campaignId)
    .eq("event_type", "smartlead_uploaded")
    .gte("created_at", since.toISOString());
  return count ?? 0;
}

export async function markLeadUploaded(input: {
  lead: MarketingLead;
  campaignId: string;
  smartleadLeadId?: string | null;
}): Promise<void> {
  const client = db();
  const now = new Date().toISOString();
  await client
    .from("marketing_leads")
    .update({
      smartlead_lead_id: input.smartleadLeadId ?? null,
      smartlead_status: "uploaded",
      last_contacted_at: now,
      updated_at: now,
    })
    .eq("id", input.lead.id);
  await client.from("marketing_events").insert({
    lead_id: input.lead.id,
    campaign_id: input.campaignId,
    event_type: "smartlead_uploaded",
    payload: { verification_status: input.lead.verification_status },
  });
}

export async function syncSmartleadLeadState(input: {
  campaignId: string;
  email: string;
  smartleadLeadId: string | null;
  smartleadStatus: string | null;
  replyStatus: MarketingReplyStatus;
  suppressionReason: string | null;
}): Promise<void> {
  const client = db();
  const email = normalizeMarketingEmail(input.email);
  if (!email) return;
  const { data: lead } = await client
    .from("marketing_leads")
    .select("id, website_domain, suppressed, suppression_reason")
    .eq("email", email)
    .maybeSingle();
  if (!lead) return;
  const shouldSuppress = Boolean(input.suppressionReason);
  await client
    .from("marketing_leads")
    .update({
      smartlead_lead_id: input.smartleadLeadId,
      smartlead_status: input.smartleadStatus,
      reply_status: input.replyStatus,
      suppressed: shouldSuppress || lead.suppressed === true,
      suppression_reason:
        input.suppressionReason ??
        (typeof lead.suppression_reason === "string"
          ? lead.suppression_reason
          : null),
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);
  if (shouldSuppress) {
    await addSuppression({
      email,
      domain:
        typeof lead.website_domain === "string" ? lead.website_domain : null,
      reason: input.suppressionReason!,
      source: "smartlead_sync",
    });
  }
  await client.from("marketing_events").insert({
    lead_id: lead.id,
    campaign_id: input.campaignId,
    event_type: `smartlead_${input.replyStatus}`,
    payload: { status: input.smartleadStatus },
  });
}

export async function addSuppression(input: {
  email?: string | null;
  domain?: string | null;
  reason: string;
  source: string;
}): Promise<void> {
  const email = input.email ? normalizeMarketingEmail(input.email) : null;
  const domain = input.domain?.trim().toLowerCase() || null;
  if (!email && !domain) return;
  const client = db();
  if (email) {
    const { data: existingEmail } = await client
      .from("marketing_suppression_list")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!existingEmail) {
      await client.from("marketing_suppression_list").insert({
        email,
        domain: null,
        reason: input.reason,
        source: input.source,
      });
    }
  }
  if (domain) {
    const { data: existingDomain } = await client
      .from("marketing_suppression_list")
      .select("id")
      .eq("domain", domain)
      .maybeSingle();
    if (!existingDomain) {
      await client.from("marketing_suppression_list").insert({
        email: null,
        domain,
        reason: input.reason,
        source: input.source,
      });
    }
  }
}

export async function suppressMarketingLead(
  leadId: string,
  reason = "admin_manual",
): Promise<boolean> {
  const client = db();
  const { data: lead } = await client
    .from("marketing_leads")
    .select("email, website_domain")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return false;
  await client
    .from("marketing_leads")
    .update({
      suppressed: true,
      suppression_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  await addSuppression({
    email: typeof lead.email === "string" ? lead.email : null,
    domain:
      typeof lead.website_domain === "string" ? lead.website_domain : null,
    reason,
    source: "admin",
  });
  return true;
}

export async function unsuppressMarketingLead(leadId: string): Promise<boolean> {
  const client = db();
  const { data: lead } = await client
    .from("marketing_leads")
    .select("email, website_domain, suppression_reason")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.suppression_reason !== "admin_manual") return false;
  await client
    .from("marketing_leads")
    .update({
      suppressed: false,
      suppression_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (typeof lead.email === "string") {
    await client
      .from("marketing_suppression_list")
      .delete()
      .eq("email", lead.email)
      .eq("source", "admin")
      .eq("reason", "admin_manual");
  }
  if (typeof lead.website_domain === "string") {
    await client
      .from("marketing_suppression_list")
      .delete()
      .eq("domain", lead.website_domain)
      .eq("source", "admin")
      .eq("reason", "admin_manual");
  }
  return true;
}

export async function suppressFromReply(input: {
  campaignId: string;
  email: string;
  replyText: string;
}): Promise<boolean> {
  const reason = classifySuppressionText(input.replyText);
  if (!reason) return false;
  const { data: lead } = await db()
    .from("marketing_leads")
    .select("id")
    .eq("email", input.email.toLowerCase())
    .maybeSingle();
  if (!lead) return false;
  return suppressMarketingLead(lead.id as string, reason);
}

export async function getMarketingMetrics(): Promise<MarketingMetrics> {
  const client = db();
  const [
    { count: leadsFound },
    { count: websitesFound },
    { count: emailsFound },
    { count: validEmails },
    { count: uploaded },
    { count: sent },
    { count: replied },
    { count: positive },
    { count: negative },
    { count: bounced },
    { count: unsubscribed },
    { data: latestRun },
  ] = await Promise.all([
    client.from("marketing_leads").select("*", { head: true, count: "exact" }),
    client
      .from("marketing_leads")
      .select("*", { head: true, count: "exact" })
      .not("website", "is", null),
    client
      .from("marketing_leads")
      .select("*", { head: true, count: "exact" })
      .not("email", "is", null),
    client
      .from("marketing_leads")
      .select("*", { head: true, count: "exact" })
      .eq("verification_status", "valid"),
    client
      .from("marketing_leads")
      .select("*", { head: true, count: "exact" })
      .not("smartlead_status", "is", null),
    client
      .from("marketing_leads")
      .select("*", { head: true, count: "exact" })
      .in("smartlead_status", ["INPROGRESS", "COMPLETED", "SENT"]),
    client
      .from("marketing_leads")
      .select("*", { head: true, count: "exact" })
      .neq("reply_status", "none"),
    client
      .from("marketing_leads")
      .select("*", { head: true, count: "exact" })
      .eq("reply_status", "positive"),
    client
      .from("marketing_leads")
      .select("*", { head: true, count: "exact" })
      .eq("reply_status", "negative"),
    client
      .from("marketing_leads")
      .select("*", { head: true, count: "exact" })
      .eq("reply_status", "bounced"),
    client
      .from("marketing_leads")
      .select("*", { head: true, count: "exact" })
      .eq("reply_status", "unsubscribed"),
    client
      .from("marketing_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const run = latestRun as MarketingRun | null;
  return {
    leadsFound: leadsFound ?? 0,
    websitesFound: websitesFound ?? 0,
    emailsFound: emailsFound ?? 0,
    validEmails: validEmails ?? 0,
    uploaded: uploaded ?? 0,
    sent: sent ?? 0,
    replied: replied ?? 0,
    positive: positive ?? 0,
    negative: negative ?? 0,
    bounced: bounced ?? 0,
    unsubscribed: unsubscribed ?? 0,
    skippedNoEmail: run?.skipped_no_email ?? 0,
    skippedDuplicates: run?.skipped_duplicates ?? 0,
    skippedInvalid: run?.skipped_invalid ?? 0,
    skippedRiskyUnknown:
      (run?.skipped_risky ?? 0) + (run?.skipped_unknown ?? 0),
    skippedSuppressed: run?.skipped_suppressed ?? 0,
    latestError: run?.error_message ?? null,
  };
}
