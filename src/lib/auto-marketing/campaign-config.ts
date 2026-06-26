/**
 * Campaign email-sequence configuration.
 *
 * Stores the exact email copy for each campaign variant. The DB
 * (auto_marketing_campaigns.email_variant) holds a reference; this file holds
 * the templates. Keeping copy in version control (not the DB) makes it
 * reviewable, diffable, and testable.
 *
 * Templates avoid depending on first-name or fake personalization. Smartlead
 * can still substitute fields in future variants if needed.
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
      subject: "the quote in your truck",
      body: `You already paid for the gas to drive out there. You already spent the time measuring and typing up the number.

Now it's just sitting there silent.

Easy to assume they were just getting three bids to keep their brother-in-law honest. But a big concrete job isn't an impulse buy. They usually go quiet because they're figuring out the money, not because they hate your price.

Before you buy another shared lead this week, check the estimates you already paid to create.

Plug in 3 old quote amounts and how long they've been quiet. No names, no signup, no card.
https://www.quotereclaim.com/audit

Reply "stop" and I'll close the loop.

%signature%`,
    },
    {
      step: 2,
      delayDays: 3,
      subject: "Re: the quote in your truck",
      body: `Most contractors don't follow up on old quotes because they don't know what to say without sounding desperate.

"So, you ready to do the driveway?"

It feels awkward. So the quote just dies.

That's the expensive part: buying a new lead feels like progress, but reopening an old quote feels like rejection.

Quote Reclaim tells you which silent quote is worth reopening today, and gives you the exact message to send so you don't look like you're begging.

Takes 60 seconds:
https://www.quotereclaim.com/audit

Reply "stop" and I'll close the loop.

%signature%`,
    },
    {
      step: 3,
      delayDays: 5,
      subject: "Re: the quote in your truck",
      body: `Buying another lead while old estimates sit untouched is an expensive habit.

You're paying for strangers who might not answer the phone, while ignoring homeowners who already invited you onto their property and liked you enough to get a number.

Getting outbid by a guy with a wheelbarrow sucks. Losing the job because no one sent one clean follow-up is worse.

Some old quotes are dead. Some just need a better reopen than "just checking in."

The audit is here if you want to see which one to ping first:
https://www.quotereclaim.com/audit

Reply "stop" and I'll close the loop.

%signature%`,
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
