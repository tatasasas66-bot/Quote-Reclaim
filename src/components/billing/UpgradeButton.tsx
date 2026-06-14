"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/payments/disabled-provider";
import { PaddleCheckoutButton } from "./PaddleCheckoutButton";

const PRICE_LABEL = "$79/month";

type Props = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  userId?: string | null;
  userEmail?: string | null;
  /** Whether the contractor already holds an active Pro subscription. When
   *  true, the button is replaced by a small "Pro · Active" chip so the
   *  header never asks them to re-upgrade. */
  isPaid?: boolean;
  /** When true, the button opens Paddle.js checkout. Otherwise it surfaces
   *  the safe-disabled mailto fallback. */
  paddleAvailable?: boolean;
};

/**
 * Header Upgrade CTA.
 *
 * Three rendered states:
 *   1. Paid → small "Pro · Active" chip, no upsell.
 *   2. Paddle available + user known → PaddleCheckoutButton ($79/month).
 *   3. Otherwise → safe-disabled button revealing the SUPPORT_EMAIL mailto.
 *
 * Mobile/desktop label split is preserved so the header never wraps at
 * 375px. The price label is the single source of truth for the $79/month
 * string — duplicating it here would risk drift.
 */
export function UpgradeButton({
  variant = "primary",
  size = "sm",
  className,
  userId,
  userEmail,
  isPaid,
  paddleAvailable,
}: Props) {
  const [showHint, setShowHint] = React.useState(false);

  if (isPaid) {
    return (
      <span
        data-testid="upgrade-pro-active"
        className={[
          "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-success/40 bg-surface-1 px-3 py-1 text-xs font-semibold text-success",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        Pro · Active
      </span>
    );
  }

  const canCheckout = Boolean(paddleAvailable && userId);

  if (canCheckout && userId) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        <PaddleCheckoutButton
          userId={userId}
          userEmail={userEmail ?? null}
          label={
            <>
              <span className="sm:hidden">Upgrade $79</span>
              <span className="hidden sm:inline">Upgrade — {PRICE_LABEL}</span>
            </>
          }
          variant={variant}
          size={size}
          className={["whitespace-nowrap", className].filter(Boolean).join(" ")}
        />
      </div>
    );
  }

  function handleClick() {
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
