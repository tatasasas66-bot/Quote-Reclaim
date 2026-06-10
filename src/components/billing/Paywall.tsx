"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/payments/disabled-provider";
import { formatCurrency } from "@/lib/utils/currency";

type Props = {
  silentQuoteValue?: number;
};

/**
 * Paywall — shown on /quotes/new when a free user hits the 3-quote limit.
 *
 * Quote Reclaim is between merchants of record. The conversion path stays
 * visible (we are not hiding the price, we are not removing the upgrade
 * intent) but the button does NOT fetch a dead checkout route. Clicking
 * surfaces the support email so a contractor who genuinely wants to
 * upgrade can do so manually while the new provider is wired up.
 *
 * Value anchoring is preserved: when we know the contractor's actual
 * silent-quote dollars, the number is the visual hero and the CTA reframes
 * as "Import the rest — $79/month". The original "Unlock Silent Quote
 * Command — $79/month" stays as the no-silent-value fallback so existing
 * trust-copy invariants are unaffected.
 */
export function Paywall({ silentQuoteValue }: Props) {
  const [showContactHint, setShowContactHint] = React.useState(false);

  function handleUpgrade() {
    // No fetch to a dead route. Show an honest contact line + mailto so
    // the contractor still has a path to convert while billing is updated.
    setShowContactHint(true);
  }

  const hasSilent = Boolean(silentQuoteValue && silentQuoteValue > 0);
  // Ethical value anchoring: when we know the contractor's actual quiet
  // dollars, the number is the headline — not a generic SaaS pitch. CTA
  // flips to "Import the rest" so $79 reads as the answer to *their*
  // number, not a feature unlock. Honest framing only.
  const ctaLabel = hasSilent
    ? "Import the rest — $79/month"
    : "Unlock Silent Quote Command — $79/month";

  return (
    <section className="space-y-5 rounded-xl border border-brand/30 bg-surface-2 p-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          FOUNDING CONTRACTOR
        </p>
        {hasSilent ? (
          <div data-testid="paywall-money-anchor" className="space-y-1">
            <p className="text-xs font-black uppercase tracking-widest text-warning/80">
              Sitting quiet in your queue
            </p>
            <p className="text-4xl font-black leading-none tabular-nums text-money sm:text-5xl">
              {formatCurrency(silentQuoteValue)}
            </p>
          </div>
        ) : null}
        <h2 className="text-2xl font-bold text-ink-strong">
          Don&apos;t let good quotes die quiet.
        </h2>
        <p className="text-sm text-ink">
          Quote Reclaim shows which silent estimates still matter and what
          they&apos;re worth — and writes the 5-message follow-up, sent by
          email when there&apos;s an address and ready to copy when there
          isn&apos;t. At $79/month — about 1.5% of a single $5,000 job — it
          doesn&apos;t take many recovered jobs to look like a smart line
          item.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="button" onClick={handleUpgrade}>
          {ctaLabel}
        </Button>
        <Link
          href="/dashboard"
          className="text-sm text-ink-muted hover:text-ink-strong"
        >
          Not now
        </Link>
      </div>

      {showContactHint ? (
        <p
          role="status"
          data-testid="paywall-billing-hint"
          className="rounded-md border border-brand/30 bg-surface-1 p-3 text-sm text-ink"
        >
          Billing is being updated. Email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Upgrade%20to%20paid`}
            className="font-semibold text-brand hover:text-ink-strong"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          to activate your account. Your free queue stays exactly as it is.
        </p>
      ) : null}

      <p className="text-xs text-ink-muted">
        Lock in early access. Cancel anytime. Built for US home-service
        contractors. Not another CRM.
      </p>
    </section>
  );
}
