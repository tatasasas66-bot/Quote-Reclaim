/**
 * Campaign email-sequence configuration.
 *
 * Stores the exact email copy for each campaign variant. The DB
 * (auto_marketing_campaigns.email_variant) holds a reference; this file holds
 * the templates. Keeping copy in version control (not the DB) makes it
 * reviewable, diffable, and testable.
 *
 * Templates use {first_name}, {company}, {city} merge fields — the same fields
 * Smartlead substitutes. The {audit_url} field is pre-built with UTM params
 * so every send is attributable.
 */
import { getCompliancePostalAddress } from "@/lib/marketing/config";

export type EmailStep = {
  step: number;
  /** Delay in days after the previous step (0 = send immediately). */
  delayDays: number;
  subject: string;
  body: string;
};

export type CampaignConfig = {
  variant: string;
  trade: string;
  defaultCity: string;
  /** Builds the trade-specific audit URL with UTMs. */
  auditUrl: (city: string) => string;
  steps: EmailStep[];
};

const CONCRETE_AUDIT_URL = (city: string) =>
  `https://www.quotereclaim.com/audit?utm_source=cold_email&utm_campaign=concrete_driveway_v1&utm_trade=concrete&utm_city=${encodeURIComponent(city)}`;

export const CONCRETE_DRIVEWAY_V1: CampaignConfig = {
  variant: "concrete_v1",
  trade: "concrete",
  defaultCity: "Phoenix",
  auditUrl: CONCRETE_AUDIT_URL,
  steps: [
    {
      step: 1,
      delayDays: 0,
      subject: "quiet concrete quotes — {company}",
      body: `Hi {first_name},

Before buying another lead, check the concrete estimates you already sent.

Some quiet quotes are not dead — the homeowner may just need an easier way to answer.

Quote Reclaim shows which quote to follow up first and what message to send today.

Free 60-second audit:
{audit_url}

No signup. No card. No customer names.

Reply "no" and I'll stop.

— Quote Reclaim`,
    },
    {
      step: 2,
      delayDays: 3,
      subject: "re: quiet concrete quotes — {company}",
      body: `Just bumping this up.

The free audit takes about 60 seconds and shows which quiet concrete quote is worth following up first:

{audit_url}

No signup, no card, no customer names.

Reply "no" and I'll stop.

— Quote Reclaim`,
    },
    {
      step: 3,
      delayDays: 5,
      subject: "re: quiet concrete quotes — {company}",
      body: `Should I close this out?

If quiet concrete quotes are not a problem for {company}, reply "no" and I'll stop.

If they are, the free audit is here:
{audit_url}

— Quote Reclaim`,
    },
  ],
};

/** All campaign configs keyed by variant. */
export const CAMPAIGNS: ReadonlyMap<string, CampaignConfig> = new Map<string, CampaignConfig>([
  ["concrete_v1", CONCRETE_DRIVEWAY_V1],
]);

/** Resolve a campaign config by its email_variant. Returns null if unknown. */
export function resolveCampaignConfig(variant: string): CampaignConfig | null {
  return CAMPAIGNS.get(variant) ?? null;
}

/**
 * Render an email step for a specific lead. Substitutes merge fields.
 * Returns { subject, body } ready for Smartlead.
 */
export function renderEmail(
  variant: string,
  stepNumber: number,
  lead: { first_name?: string | null; company: string; city?: string | null },
): { subject: string; body: string } | null {
  const config = resolveCampaignConfig(variant);
  if (!config) return null;
  const step = config.steps.find((s) => s.step === stepNumber);
  if (!step) return null;

  const firstName = lead.first_name?.trim() || "there";
  const company = lead.company;
  const city = lead.city?.trim() || config.defaultCity;
  const auditUrl = config.auditUrl(city);

  const subject = step.subject
    .replace(/\{company\}/g, company)
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{city\}/g, city);

  const renderedBody = step.body
    .replace(/\{company\}/g, company)
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{city\}/g, city)
    .replace(/\{audit_url\}/g, auditUrl);
  const compliancePostalAddress = getCompliancePostalAddress();
  const body = compliancePostalAddress
    ? `${renderedBody}\n\n${compliancePostalAddress}`
    : renderedBody;

  return { subject, body };
}
