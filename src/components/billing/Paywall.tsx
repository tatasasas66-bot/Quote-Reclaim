"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/payments/disabled-provider";
import { PAYWALL_PRICE_LABEL } from "@/lib/payments/entitlement";
import { formatCurrency } from "@/lib/utils/currency";
import { PaddleCheckoutButton } from "./PaddleCheckoutButton";

type Props = {
  silentQuoteValue?: number;
  userId?: string | null;
  userEmail?: string | null;
  /** When set, the checkout overlay is wired through Paddle.js. When false
   *  (env vars missing in this deployment), the CTA falls back to the
   *  honest support-email mailto so the contractor still has a path. */
  paddleAvailable?: boolean;
};

/**
 * Paywall shown on /quotes/new when a free user hits the 3-quote limit.
 *
 * When Paddle is configured for this deployment the CTA opens the Paddle
 * overlay checkout for the locked $79/month price. When it is not, the CTA
 * surfaces the support email + mailto so a contractor who genuinely wants to
 * upgrade still has a path: no dead checkout button, no fake success state.
 */
export function Paywall({
  silentQuoteValue,
  userId,
  userEmail,
  paddleAvailable,
}: Props) {
  const [showContactHint, setShowContactHint] = React.useState(false);

  function handleFallbackClick() {
    // No fetch to a dead route. Show an honest contact line + mailto so
    // the contractor still has a path to convert while billing is updated.
    setShowContactHint(true);
  }

  const hasSilent = Boolean(silentQuoteValue && silentQuoteValue > 0);
  const ctaLabel = hasSilent
    ? `Import the rest - ${PAYWALL_PRICE_LABEL}`
    : `Unlock Silent Quote Command - ${PAYWALL_PRICE_LABEL}`;

  const canCheckout = Boolean(paddleAvailable && userId);

  return (
    <section className="space-y-5 rounded-xl border border-brand/30 bg-surface-2 p-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          QUOTE RECLAIM PRO
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
        <p className="text-sm leading-6 text-ink">
          {hasSilent
            ? "That number is work you already drove out, measured, and priced. "
            : ""}
          Quote Reclaim tells you which quiet estimate to reopen first and
          hands you the message to send — for every estimate in your queue,
          every week. At {PAYWALL_PRICE_LABEL}, one recovered job can cover
          years of it. No guarantee of recovered revenue — just the math on
          work you already quoted.
        </p>
        <p className="text-sm font-semibold leading-6 text-ink-strong">
          Before buying another lead, reopen the estimates you already paid
          to create.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {canCheckout && userId ? (
          <PaddleCheckoutButton
            userId={userId}
            userEmail={userEmail ?? null}
            label={ctaLabel}
            size="md"
          />
        ) : (
          <Button type="button" onClick={handleFallbackClick}>
            {ctaLabel}
          </Button>
        )}
        <Link
          href="/dashboard"
          className="text-sm text-ink-muted hover:text-ink-strong"
        >
          Not now
        </Link>
      </div>

      {!canCheckout && showContactHint ? (
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

      <p className="text-xs leading-5 text-ink-muted">
        First 3 quotes are free. Free audit first. Cancel anytime. No contract.
        Built for US home-service contractors. Not another CRM.
      </p>
    </section>
  );
}
