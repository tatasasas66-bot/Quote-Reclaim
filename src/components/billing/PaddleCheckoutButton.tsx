"use client";

import * as React from "react";
import { Button } from "@/components/ui";

type Props = {
  userId: string;
  userEmail: string | null | undefined;
  label: React.ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  /** Optional callback fired when the overlay reports `checkout.completed`.
   *  We never wait for this to flip entitlement — the webhook is the source
   *  of truth — but it lets us show an in-page success hint immediately. */
  onCompleted?: () => void;
};

// Paddle.js is loaded lazily from the official CDN. Both the script URL and
// the script tag id are local constants — never user-controlled.
const PADDLE_SCRIPT_ID = "paddle-js";
const PADDLE_SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

type PaddleEvent = { name: string };
type PaddleGlobal = {
  Initialize: (opts: {
    token: string;
    eventCallback?: (event: PaddleEvent) => void;
  }) => void;
  Environment?: { set: (env: "sandbox" | "production") => void };
  Checkout: {
    open: (opts: {
      items: Array<{ priceId: string; quantity: number }>;
      customer?: { email?: string };
      customData?: Record<string, unknown>;
    }) => void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

function loadPaddleScript(): Promise<PaddleGlobal> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Paddle.js cannot load outside the browser"));
      return;
    }
    if (window.Paddle) {
      resolve(window.Paddle);
      return;
    }
    const existing = document.getElementById(PADDLE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.Paddle) resolve(window.Paddle);
        else reject(new Error("Paddle.js loaded but window.Paddle is missing"));
      });
      existing.addEventListener("error", () => reject(new Error("Paddle.js failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.id = PADDLE_SCRIPT_ID;
    script.src = PADDLE_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Paddle) resolve(window.Paddle);
      else reject(new Error("Paddle.js loaded but window.Paddle is missing"));
    };
    script.onerror = () => reject(new Error("Paddle.js failed to load"));
    document.head.appendChild(script);
  });
}

/**
 * Opens the Paddle overlay checkout for the contractor.
 *
 * The user_id is pinned into the checkout custom_data so the webhook can
 * resolve who to credit. We never trust client-supplied user_id on the
 * server side; the webhook always re-validates against the `subscriptions`
 * row and the `paddle_subscription_id` index — custom_data is just the
 * link that the FIRST event uses to attach a fresh subscription to a user.
 *
 * Renders a clear "Activate Quote Reclaim Pro" CTA with the locked $79
 * price + "Cancel anytime." reassurance line. The overlay handles the
 * actual payment UI; we don't show our own form.
 */
export function PaddleCheckoutButton({
  userId,
  userEmail,
  label,
  size = "md",
  variant = "primary",
  className,
  onCompleted,
}: Props) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [completed, setCompleted] = React.useState(false);

  // Read public env once at render time. These are bundle-time public values
  // (NEXT_PUBLIC_*), so reading them here is safe and intentional.
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const priceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
  const environment =
    process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "sandbox"
      ? "sandbox"
      : "production";

  async function handleClick() {
    if (!clientToken || !priceId) {
      setError("Checkout is being set up. Try again in a moment.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const paddle = await loadPaddleScript();
      if (environment === "sandbox" && paddle.Environment?.set) {
        paddle.Environment.set("sandbox");
      }
      paddle.Initialize({
        token: clientToken,
        eventCallback: (event) => {
          if (event.name === "checkout.completed") {
            setCompleted(true);
            onCompleted?.();
          }
        },
      });
      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: userEmail ? { email: userEmail } : undefined,
        customData: { user_id: userId, app: "quote_reclaim" },
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Checkout failed to open.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={handleClick}
        disabled={loading}
        data-testid="paddle-checkout-button"
      >
        {loading ? "Opening checkout…" : label}
      </Button>
      {completed ? (
        <p
          role="status"
          data-testid="paddle-checkout-completed"
          className="text-sm text-success"
        >
          Payment received. Your Pro features unlock as soon as Paddle confirms
          — usually a few seconds.
        </p>
      ) : null}
      {error ? (
        <p role="alert" data-testid="paddle-checkout-error" className="text-sm text-warning">
          {error}
        </p>
      ) : null}
    </div>
  );
}
