export type MarketingCampaignStatus = "draft" | "active" | "paused" | "stopped";
export type MarketingMode = "dry_run" | "live";
export type MarketingRunStatus = "queued" | "running" | "completed" | "failed";
export type VerificationStatus =
  | "unverified"
  | "valid"
  | "invalid"
  | "risky"
  | "unknown";
export type MarketingReplyStatus =
  | "none"
  | "replied"
  | "positive"
  | "negative"
  | "bounced"
  | "unsubscribed";

export type MarketingCampaign = {
  id: string;
  name: string;
  slug: string;
  trade: string;
  city: string;
  search_query: string;
  apify_actor_id: string | null;
  smartlead_campaign_id: string | null;
  daily_cap: number;
  status: MarketingCampaignStatus;
  mode: MarketingMode;
  sequence_config: Record<string, unknown>;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingRun = {
  id: string;
  campaign_id: string;
  source: string;
  apify_run_id: string | null;
  apify_dataset_id: string | null;
  status: MarketingRunStatus;
  leads_found: number;
  websites_found: number;
  emails_found: number;
  valid_emails: number;
  uploaded_to_smartlead: number;
  skipped_no_email: number;
  skipped_duplicates: number;
  skipped_invalid: number;
  skipped_risky: number;
  skipped_unknown: number;
  skipped_suppressed: number;
  cost_estimate: number | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingLead = {
  id: string;
  campaign_id: string;
  company_name: string;
  first_name: string | null;
  trade: string;
  city: string;
  website: string | null;
  website_domain: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  google_maps_url: string | null;
  source: string;
  source_place_id: string | null;
  apify_run_id: string | null;
  verification_status: VerificationStatus;
  verification_detail: string | null;
  smartlead_lead_id: string | null;
  smartlead_status: string | null;
  reply_status: MarketingReplyStatus;
  suppressed: boolean;
  suppression_reason: string | null;
  audit_url: string;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NormalizedApifyPlace = {
  companyName: string;
  firstName: string | null;
  website: string | null;
  websiteDomain: string | null;
  emails: string[];
  phone: string | null;
  address: string | null;
  city: string;
  googleMapsUrl: string | null;
  sourcePlaceId: string | null;
};

export type MarketingMetrics = {
  leadsFound: number;
  websitesFound: number;
  emailsFound: number;
  validEmails: number;
  uploaded: number;
  sent: number;
  replied: number;
  positive: number;
  negative: number;
  bounced: number;
  unsubscribed: number;
  skippedNoEmail: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  skippedRiskyUnknown: number;
  skippedSuppressed: number;
  latestError: string | null;
};

export type SetupItem = {
  key: string;
  label: string;
  configured: boolean;
  detail: string;
};

export type MarketingSetupStatus = {
  sender: string;
  items: SetupItem[];
  liveReady: boolean;
  missingForLive: string[];
  dryRunAllowed: true;
  complianceAddressConfigured: boolean;
  liveBlockReason: string | null;
};
