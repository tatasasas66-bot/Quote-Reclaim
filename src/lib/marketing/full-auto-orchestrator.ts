import {
  fetchApifyDataset,
  getApifyRun,
  isApifyReady,
  startGoogleMapsRun,
} from "./apify";
import {
  getCompliancePostalAddress,
  getMarketingSetupStatus,
  LIVE_COMPLIANCE_BLOCK_REASON,
  marketingModeAllowed,
} from "./config";
import { isEmailVerifierReady, verifyMarketingEmail } from "./email-verifier";
import {
  countCampaignUploadsToday,
  createMarketingRun,
  getMarketingCampaign,
  latestMarketingRun,
  latestOpenMarketingRun,
  listMarketingCampaigns,
  listPendingVerification,
  listUploadEligibleLeads,
  markLeadUploaded,
  persistApifyDataset,
  syncSmartleadLeadState,
  updateLeadVerification,
  updateMarketingCampaign,
  updateMarketingRun,
} from "./repo";
import {
  applyDailyCap,
  campaignCanUploadLive,
  leadIsEligibleForSmartlead,
} from "./safety";
import { buildComplianceSafeSequence } from "./sequence";
import {
  getSmartleadCampaignStatus,
  isSmartleadReady,
  listSmartleadCampaignLeads,
  uploadLeadsToSmartlead,
} from "./smartlead";
import type { MarketingCampaign, MarketingRun } from "./types";

export type CycleResult = {
  campaignId: string;
  mode: "dry_run" | "live";
  search: string;
  ingested: number;
  verified: number;
  uploaded: number;
  synced: number;
  skipped: number;
  setupRequired: string[];
  errors: string[];
};

function baseResult(campaign: MarketingCampaign): CycleResult {
  return {
    campaignId: campaign.id,
    mode: campaign.mode,
    search: "not_started",
    ingested: 0,
    verified: 0,
    uploaded: 0,
    synced: 0,
    skipped: 0,
    setupRequired: [],
    errors: [],
  };
}

function runIsFinished(status: string): boolean {
  return ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(
    status.toUpperCase(),
  );
}

function campaignDue(campaign: MarketingCampaign): boolean {
  if (!campaign.last_run_at) return true;
  return Date.now() - new Date(campaign.last_run_at).getTime() >= 24 * 60 * 60 * 1000;
}

export async function startCampaignLeadSearch(
  campaignId: string,
): Promise<{ run: MarketingRun; apifyStatus: string }> {
  const campaign = await requiredCampaign(campaignId);
  if (!isApifyReady()) throw new Error("Apify setup required");
  const existing = await latestOpenMarketingRun(campaign.id);
  if (existing) return { run: existing, apifyStatus: "ALREADY_RUNNING" };

  const run = await createMarketingRun(campaign.id);
  try {
    const apifyRun = await startGoogleMapsRun({
      searchQuery: campaign.search_query,
      city: campaign.city,
      maxPlaces: 30,
      actorId: campaign.apify_actor_id,
    });
    await updateMarketingRun(run.id, {
      status: "running",
      apify_run_id: apifyRun.id,
      apify_dataset_id: apifyRun.defaultDatasetId,
      started_at: apifyRun.startedAt ?? new Date().toISOString(),
      cost_estimate: apifyRun.usageTotalUsd,
    });
    await updateMarketingCampaign(campaign.id, {
      last_run_at: new Date().toISOString(),
    });
    return {
      run: {
        ...run,
        status: "running",
        apify_run_id: apifyRun.id,
        apify_dataset_id: apifyRun.defaultDatasetId,
      },
      apifyStatus: apifyRun.status,
    };
  } catch (error) {
    await updateMarketingRun(run.id, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Apify start failed",
      finished_at: new Date().toISOString(),
    });
    throw error;
  }
}

export async function ingestLatestApifyRun(campaignId: string): Promise<{
  status: string;
  inserted: number;
}> {
  const campaign = await requiredCampaign(campaignId);
  const run = await latestOpenMarketingRun(campaign.id);
  if (!run?.apify_run_id) return { status: "no_open_run", inserted: 0 };

  const apifyRun = await getApifyRun(run.apify_run_id);
  await updateMarketingRun(run.id, {
    apify_dataset_id: apifyRun.defaultDatasetId,
    cost_estimate: apifyRun.usageTotalUsd,
  });
  if (!runIsFinished(apifyRun.status)) {
    return { status: apifyRun.status, inserted: 0 };
  }
  if (apifyRun.status !== "SUCCEEDED" || !apifyRun.defaultDatasetId) {
    await updateMarketingRun(run.id, {
      status: "failed",
      error_message: `Apify run ended with ${apifyRun.status}`,
      finished_at: apifyRun.finishedAt ?? new Date().toISOString(),
    });
    return { status: apifyRun.status, inserted: 0 };
  }

  const places = await fetchApifyDataset(apifyRun.defaultDatasetId, {
    city: campaign.city,
  });
  const metrics = await persistApifyDataset({ campaign, run, places });
  await updateMarketingRun(run.id, {
    status: "completed",
    leads_found: metrics.leadsFound,
    websites_found: metrics.websitesFound,
    emails_found: metrics.emailsFound,
    skipped_no_email: metrics.skippedNoEmail,
    skipped_duplicates: metrics.skippedDuplicates,
    skipped_suppressed: metrics.skippedSuppressed,
    finished_at: apifyRun.finishedAt ?? new Date().toISOString(),
  });
  return { status: "completed", inserted: metrics.inserted };
}

export async function verifyCampaignEmails(campaignId: string): Promise<{
  verified: number;
  valid: number;
  invalid: number;
  risky: number;
  unknown: number;
  unverified: number;
}> {
  if (!isEmailVerifierReady()) {
    return { verified: 0, valid: 0, invalid: 0, risky: 0, unknown: 0, unverified: 0 };
  }
  const leads = await listPendingVerification(campaignId);
  const counts = {
    verified: 0,
    valid: 0,
    invalid: 0,
    risky: 0,
    unknown: 0,
    unverified: 0,
  };
  for (const lead of leads) {
    if (!lead.email) continue;
    const result = await verifyMarketingEmail(lead.email);
    await updateLeadVerification(lead.id, result.status, result.detail);
    counts.verified++;
    counts[result.status]++;
  }
  const run = await latestMarketingRun(campaignId);
  if (run) {
    await updateMarketingRun(run.id, {
      valid_emails: run.valid_emails + counts.valid,
      skipped_invalid: run.skipped_invalid + counts.invalid,
      skipped_risky: run.skipped_risky + counts.risky,
      skipped_unknown: run.skipped_unknown + counts.unknown,
    });
  }
  return counts;
}

export async function uploadCampaignLeads(campaignId: string): Promise<{
  uploaded: number;
  skipped: number;
  reason: string | null;
}> {
  const campaign = await requiredCampaign(campaignId);
  const setup = getMarketingSetupStatus();
  const compliancePostalAddress = getCompliancePostalAddress();
  const compliantSequence = buildComplianceSafeSequence(
    compliancePostalAddress,
  );
  const campaignForUpload = compliancePostalAddress
    ? { ...campaign, sequence_config: compliantSequence }
    : campaign;
  if (compliancePostalAddress) {
    await updateMarketingCampaign(campaign.id, {
      sequence_config: compliantSequence,
    });
  }
  if (
    !campaignCanUploadLive(
      campaignForUpload,
      setup.liveReady,
      compliancePostalAddress,
    )
  ) {
    return {
      uploaded: 0,
      skipped: 0,
      reason:
        campaign.mode === "dry_run"
          ? "dry_run"
          : !compliancePostalAddress
            ? LIVE_COMPLIANCE_BLOCK_REASON
            : `live_setup_required:${setup.missingForLive.join(",")}`,
    };
  }
  if (!isSmartleadReady() || !campaignForUpload.smartlead_campaign_id) {
    return { uploaded: 0, skipped: 0, reason: "smartlead_setup_required" };
  }
  const smartleadStatus = await getSmartleadCampaignStatus(
    campaignForUpload.smartlead_campaign_id,
  );
  if (smartleadStatus !== "ACTIVE") {
    return {
      uploaded: 0,
      skipped: 0,
      reason: `smartlead_campaign_${smartleadStatus.toLowerCase()}`,
    };
  }

  const [eligible, uploadedToday] = await Promise.all([
    listUploadEligibleLeads(campaign.id),
    countCampaignUploadsToday(campaign.id),
  ]);
  const safe = eligible.filter(leadIsEligibleForSmartlead);
  const capped = applyDailyCap(safe, campaign.daily_cap, uploadedToday);
  if (capped.length === 0) {
    return {
      uploaded: 0,
      skipped: safe.length,
      reason: safe.length > 0 ? "daily_cap_reached" : "no_eligible_leads",
    };
  }

  const upload = await uploadLeadsToSmartlead(
    campaignForUpload.smartlead_campaign_id,
    capped,
  );
  const accepted = capped.slice(0, Math.min(upload.added, capped.length));
  for (const lead of accepted) {
    const leadId = lead.email
      ? upload.leadIdsByEmail.get(lead.email.toLowerCase())
      : null;
    await markLeadUploaded({
      lead,
      campaignId: campaign.id,
      smartleadLeadId: leadId,
    });
  }
  const run = await latestMarketingRun(campaign.id);
  if (run && accepted.length > 0) {
    await updateMarketingRun(run.id, {
      uploaded_to_smartlead: run.uploaded_to_smartlead + accepted.length,
    });
  }
  return {
    uploaded: accepted.length,
    skipped: upload.skipped + safe.length - capped.length,
    reason: null,
  };
}

export async function syncCampaignSmartlead(campaignId: string): Promise<number> {
  const campaign = await requiredCampaign(campaignId);
  if (!campaign.smartlead_campaign_id || !isSmartleadReady()) return 0;
  const states = await listSmartleadCampaignLeads(campaign.smartlead_campaign_id);
  for (const state of states) {
    await syncSmartleadLeadState({
      campaignId: campaign.id,
      email: state.email,
      smartleadLeadId: state.leadId,
      smartleadStatus: state.status,
      replyStatus: state.replyStatus,
      suppressionReason: state.suppressionReason,
    });
  }
  return states.length;
}

export async function runCampaignCycle(campaignId: string): Promise<CycleResult> {
  const campaign = await requiredCampaign(campaignId);
  const result = baseResult(campaign);
  const setup = getMarketingSetupStatus();
  result.setupRequired = setup.missingForLive;

  const compliance = marketingModeAllowed(campaign.mode);
  if (!compliance.allowed) {
    result.search = "live_blocked";
    result.errors.push(compliance.reason ?? LIVE_COMPLIANCE_BLOCK_REASON);
    return result;
  }
  if (campaign.mode === "dry_run") {
    const eligible = await listUploadEligibleLeads(campaign.id);
    result.skipped = eligible.length;
    result.search = "dry_run_preview";
    return result;
  }
  if (campaign.status !== "active") {
    result.search = `campaign_${campaign.status}`;
    return result;
  }

  try {
    const openRun = await latestOpenMarketingRun(campaign.id);
    if (openRun) {
      const ingestion = await ingestLatestApifyRun(campaign.id);
      result.search = ingestion.status;
      result.ingested = ingestion.inserted;
    } else if (campaignDue(campaign)) {
      const search = await startCampaignLeadSearch(campaign.id);
      result.search = search.apifyStatus;
    } else {
      result.search = "not_due";
    }

    const verification = await verifyCampaignEmails(campaign.id);
    result.verified = verification.verified;
    const upload = await uploadCampaignLeads(campaign.id);
    result.uploaded = upload.uploaded;
    result.skipped += upload.skipped;
    result.synced = await syncCampaignSmartlead(campaign.id);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Cycle failed");
  }
  return result;
}

export async function runAllActiveCampaigns(): Promise<CycleResult[]> {
  const campaigns = await listMarketingCampaigns();
  const active = campaigns.filter((campaign) => campaign.status === "active");
  const results: CycleResult[] = [];
  for (const campaign of active) {
    results.push(await runCampaignCycle(campaign.id));
  }
  return results;
}

async function requiredCampaign(id: string): Promise<MarketingCampaign> {
  const campaign = await getMarketingCampaign(id);
  if (!campaign) throw new Error("Marketing campaign not found");
  return campaign;
}
