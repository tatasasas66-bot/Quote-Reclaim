export const CONCRETE_PHOENIX_SEQUENCE = {
  sender: "hello@quotereclaim.com",
  complianceRule: "Every email includes a plain-language stop instruction.",
  steps: [
    {
      delayDays: 0,
      subject: "quiet concrete quotes - {{company_name}}",
      body: `Hi {{first_name}},

Before buying another lead, check the concrete estimates you already sent.

Driveway and patio quotes go quiet after the visit - not always because the homeowner said no, but because answering feels like work.

Quote Reclaim shows which estimate to follow up first and what message to send today.

Free 60-second audit, no signup, no card, no customer names:
{{audit_url}}

Reply "no" and I'll stop.`,
    },
    {
      delayDays: 3,
      subject: "quiet quote follow-up",
      body: `Hi {{first_name}},

A quiet quote is not always a lost quote. Sometimes the homeowner is stuck on timing, price, or one part of the scope.

The free audit shows which estimate is most worth reopening first and the low-pressure message to send today:
{{audit_url}}

No signup, no card, no customer names.

Reply "no" and I'll stop.`,
    },
    {
      delayDays: 8,
      subject: "should I close this out?",
      body: `Hi {{first_name}},

Last note from me. If quiet concrete estimates are not a problem for you, reply "no" and I'll close this out.

If you do have a few old quotes sitting silent, this shows which one to reopen first:
{{audit_url}}

No pressure either way.`,
    },
  ],
} as const;

export function buildComplianceSafeSequence(
  compliancePostalAddress?: string | null,
): Record<string, unknown> {
  const address = compliancePostalAddress?.trim() || null;
  return {
    ...CONCRETE_PHOENIX_SEQUENCE,
    steps: CONCRETE_PHOENIX_SEQUENCE.steps.map((step) => ({
      ...step,
      body: address ? `${step.body}\n\n${address}` : step.body,
    })),
  };
}

export const DEFAULT_CAMPAIGN_INPUT = {
  name: "Concrete Phoenix v1",
  slug: "concrete-phoenix-v1",
  trade: "concrete",
  city: "Phoenix",
  searchQuery: "concrete driveway contractors Phoenix AZ",
  dailyCap: 10,
  mode: "dry_run",
  status: "draft",
  sequenceConfig: buildComplianceSafeSequence(),
} as const;
