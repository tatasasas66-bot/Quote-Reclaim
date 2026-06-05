"use client";

import * as React from "react";
import { Button } from "@/components/ui";

const PRICE_LABEL = "$79/month";

type Props = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
};

/**
 * "Upgrade — $79/month" CTA. Posts to the existing Lemon Squeezy checkout
 * route and redirects to the returned URL. If checkout isn't configured yet
 * (e.g. Lemon keys land in a later session), the route returns a non-OK
 * response — we console.warn and surface a "Checkout coming soon" hint
 * instead of crashing.
 */
export function UpgradeButton({ variant = "primary", size = "sm", className }: Props) {
  const [pending, setPending] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);

  async function startCheckout() {
    if (pending) return;
    setPending(true);
    setUnavailable(false);
    try {
      const res = await fetch("/api/lemonsqueezy/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      console.warn(
        "[upgrade] Checkout coming soon — checkout unavailable:",
        data.error ?? `HTTP ${res.status}`,
      );
      setUnavailable(true);
      setPending(false);
    } catch (err) {
      console.warn("[upgrade] Checkout coming soon — request failed:", err);
      setUnavailable(true);
      setPending(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={startCheckout}
        loading={pending}
        disabled={pending}
        title={unavailable ? "Checkout coming soon" : `Upgrade — ${PRICE_LABEL}`}
        className={["whitespace-nowrap", className].filter(Boolean).join(" ")}
      >
        {/* Compact one-line label on phones (prevents the 375px "Upgrade —" /
            "$79/month" wrap); full label from sm: up. Display only — the price
            value is unchanged. */}
        <span className="sm:hidden">Upgrade $79</span>
        <span className="hidden sm:inline">Upgrade — {PRICE_LABEL}</span>
      </Button>
      {unavailable ? (
        <span role="status" className="text-xs text-ink-muted">
          Checkout coming soon
        </span>
      ) : null}
    </div>
  );
}
