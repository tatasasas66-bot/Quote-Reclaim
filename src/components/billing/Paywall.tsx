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
          FREE RECOVERIES USED
        </p>
        <h2 className="text-2xl font-bold text-ink-strong">
          Unlock unlimited recovery — $79/month
        </h2>
        <p className="text-sm text-ink">
          You&apos;ve used your 3 free recovery plans. Your silent quotes are
          still sitting there.
        </p>
        <p className="text-sm text-ink">
          One won-back job typically pays for Quote Reclaim for years.
        </p>
        {hasSilent ? (
          <p className="text-sm font-medium text-money">
            You currently have {formatCurrency(silentQuoteValue)} of silent
            quotes in your queue.
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
          Unlock unlimited recovery
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
        Cancel anytime. No setup. No contract.
      </p>
    </section>
  );
}
