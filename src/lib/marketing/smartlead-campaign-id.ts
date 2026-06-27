export const SMARTLEAD_CAMPAIGN_MAPPING_REQUIRED =
  "Map a Smartlead campaign ID before uploading leads.";

export function normalizeSmartleadCampaignId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Smartlead campaign ID is required.");
  }

  const normalized = value.trim();
  if (!/^[1-9]\d{0,19}$/.test(normalized)) {
    throw new Error("Smartlead campaign ID must be a positive whole number.");
  }

  return normalized;
}
