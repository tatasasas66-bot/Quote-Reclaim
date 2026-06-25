import type {
  MarketingCampaign,
  MarketingLead,
  VerificationStatus,
} from "./types";

const SUPPRESSION_PATTERNS = [
  /^\s*no[.!]?\s*$/i,
  /\bno thanks?\b/i,
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bnot interested\b/i,
  /\bremove me\b/i,
  /\bwrong person\b/i,
  /\bspam\b/i,
  /\bcomplaint\b/i,
  /\bbounce(?:d)?\b/i,
  /\bundeliverable\b/i,
];

export function buildMarketingAuditUrl(input: {
  campaignSlug: string;
  trade: string;
  city: string;
}): string {
  const url = new URL("https://www.quotereclaim.com/audit");
  url.searchParams.set("utm_source", "cold_email");
  url.searchParams.set("utm_campaign", input.campaignSlug);
  url.searchParams.set("utm_trade", input.trade);
  url.searchParams.set("utm_city", input.city);
  return url.toString();
}

export function classifySuppressionText(text: string): string | null {
  const match = SUPPRESSION_PATTERNS.find((pattern) => pattern.test(text.trim()));
  return match ? `reply:${match.source.replace(/\\b/g, "")}` : null;
}

export function isDuplicateIdentity(input: {
  email: string | null;
  domain: string | null;
  knownEmails: ReadonlySet<string>;
  knownDomains: ReadonlySet<string>;
}): boolean {
  return Boolean(
    (input.email && input.knownEmails.has(input.email.toLowerCase())) ||
      (input.domain && input.knownDomains.has(input.domain.toLowerCase())),
  );
}

export function verificationAllowsLiveUpload(status: VerificationStatus): boolean {
  return status === "valid";
}

export function leadIsEligibleForSmartlead(lead: MarketingLead): boolean {
  return Boolean(
    lead.email &&
      !lead.suppressed &&
      lead.verification_status === "valid" &&
      !lead.smartlead_status,
  );
}

export function applyDailyCap<T>(
  items: T[],
  dailyCap: number,
  alreadyUploadedToday: number,
): T[] {
  return items.slice(0, Math.max(0, dailyCap - alreadyUploadedToday));
}

export function campaignCanUploadLive(
  campaign: MarketingCampaign,
  setupLiveReady: boolean,
): boolean {
  const sequence = JSON.stringify(campaign.sequence_config).toLowerCase();
  const stopHandlingConfigured =
    sequence.includes("reply \\\"no\\\"") &&
    sequence.includes("stop") &&
    !sequence.includes("{{compliance_postal_address}}");
  return Boolean(
    setupLiveReady &&
      campaign.mode === "live" &&
      campaign.status === "active" &&
      campaign.smartlead_campaign_id &&
      stopHandlingConfigured,
  );
}
