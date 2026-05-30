"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";

type Props = {
  silentQuoteValue?: number;
};

export function Paywall({ silentQuoteValue }: Props) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function startCheckout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/lemonsqueezy/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(
          data.error ?? "Checkout is unavailable. Try again shortly.",
        );
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  const hasSilent = silentQuoteValue && silentQuoteValue > 0;

  return (
    <section className="space-y-5 rounded-xl border border-brand/30 bg-surface-2 p-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          FOUNDING CONTRACTOR
        </p>
        <h2 className="text-2xl font-bold text-ink-strong">
          Don&apos;t let good quotes die quiet.
        </h2>
        <p className="text-sm text-ink">
          Quote Reclaim shows which silent estimates still matter, what
          they&apos;re worth, and follows up by email automatically. At
          $79/month — about 1.5% of a single $5,000 job — it doesn&apos;t take
          many recovered jobs to look like a smart line item.
        </p>
        {hasSilent ? (
          <p className="text-sm font-medium text-money">
            You have {formatCurrency(silentQuoteValue)} of quiet estimates
            sitting in your queue right now.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          onClick={startCheckout}
          loading={pending}
          disabled={pending}
        >
          Unlock Silent Quote Command — $79/month
        </Button>
        <Link
          href="/dashboard"
          className="text-sm text-ink-muted hover:text-ink-strong"
        >
          Not now
        </Link>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <p className="text-xs text-ink-muted">
        Lock in early access. Cancel anytime. Built for US home-service
        contractors. Not another CRM.
      </p>
    </section>
  );
}
