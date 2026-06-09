"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/payments/disabled-provider";

const PRICE_LABEL = "$79/month";

type Props = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
};

/**
 * Upgrade CTA. Quote Reclaim is between merchants of record, so the button
 * never sends users to a dead checkout route — it surfaces an honest
 * contact line and a mailto so a contractor who wants to upgrade still
 * has a path.
 *
 * The price label is preserved so the conversion intent stays visible —
 * we are not pretending the product is free, only being honest that
 * self-serve checkout is temporarily off. Replace the click handler with
 * a provider-aware checkout call once a future MoR adapter is wired up.
 */
export function UpgradeButton({
  variant = "primary",
  size = "sm",
  className,
}: Props) {
  const [showHint, setShowHint] = React.useState(false);

  function handleClick() {
    // Click reveals an inline hint with the support email + a mailto, so the
    // user gets a real way to upgrade without a fake "checkout coming soon"
    // banner that they have to interpret. No fetch, no dead route, no fake
    // success state.
    setShowHint(true);
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        title={`Upgrade — ${PRICE_LABEL}`}
        className={["whitespace-nowrap", className].filter(Boolean).join(" ")}
      >
        {/* Compact one-line label on phones (prevents the 375px "Upgrade —" /
            "$79/month" wrap); full label from sm: up. Display only — the price
            value is unchanged. */}
        <span className="sm:hidden">Upgrade $79</span>
        <span className="hidden sm:inline">Upgrade — {PRICE_LABEL}</span>
      </Button>
      {showHint ? (
        <span
          role="status"
          data-testid="upgrade-billing-hint"
          className="max-w-[16rem] text-right text-xs leading-5 text-ink-muted"
        >
          Billing is being updated. Email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Upgrade%20to%20paid`}
            className="font-semibold text-brand hover:text-ink-strong"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          to activate your account.
        </span>
      ) : null}
    </div>
  );
}
