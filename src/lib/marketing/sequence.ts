export const CONCRETE_PHOENIX_SEQUENCE = {
  sender: "hello@quotereclaim.com",
  complianceRule: "Every email includes a plain-language stop instruction.",
  steps: [
    {
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
      delayDays: 8,
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
