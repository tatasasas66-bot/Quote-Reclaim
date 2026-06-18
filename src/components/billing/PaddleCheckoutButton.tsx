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

// Paddle.js v2 emits events as `entity.event_type`. We care about success
// and — crucially — `checkout.error`, which carries the real reason the
// overlay shows its generic "Something went wrong" message.
type PaddleEvent = { name?: string; detail?: unknown; error?: unknown };
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

// Paddle.Initialize must run exactly once per page. We register a single
// eventCallback at init and route its events through this mutable holder so
// the CURRENT button instance's setters are always used (no stale closures
// when more than one checkout button mounts across a session).
let paddleInitialized = false;
const liveHandlers: {
  onCompleted?: () => void;
  onError?: (reason: string) => void;
} = {};

/** Classify a client token by environment WITHOUT logging the token itself.
 *  Live tokens start with `live_`, sandbox tokens with `test_`. We only ever
 *  surface the class word, never any token bytes. */
function tokenEnvClass(token: string | undefined): "live" | "test" | "unknown" {
  if (!token) return "unknown";
  if (token.startsWith("live_")) return "live";
  if (token.startsWith("test_")) return "test";
  return "unknown";
}

/** Pull a human-readable reason out of a Paddle checkout.error/warning event.
 *  Paddle nests the detail differently across builds, so probe defensively. */
function readPaddleEventReason(event: PaddleEvent): string {
  if (typeof event.detail === "string" && event.detail) return event.detail;
  if (event.error && typeof event.error === "object") {
    const e = event.error as {
      detail?: unknown;
      message?: unknown;
      code?: unknown;
    };
    if (typeof e.detail === "string") return e.detail;
    if (typeof e.message === "string") return e.message;
    if (typeof e.code === "string") return e.code;
  }
  return event.name ?? "unknown checkout error";
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
    const settle = () => {
      if (window.Paddle) resolve(window.Paddle);
      else reject(new Error("Paddle.js loaded but window.Paddle is missing"));
    };
    const existing = document.getElementById(PADDLE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", settle);
      existing.addEventListener("error", () =>
        reject(new Error("Paddle.js failed to load")),
      );
      // If the tag already finished loading before we attached the listener,
      // the load event never fires again — poll briefly for window.Paddle.
      let tries = 0;
      const timer = window.setInterval(() => {
        if (window.Paddle) {
          window.clearInterval(timer);
          resolve(window.Paddle);
        } else if (++tries > 40) {
          window.clearInterval(timer);
        }
      }, 50);
      return;
    }
    const script = document.createElement("script");
    script.id = PADDLE_SCRIPT_ID;
    script.src = PADDLE_SCRIPT_URL;
    script.async = true;
    script.onload = settle;
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
 * Renders a clear "Activate Quote Reclaim Pro" CTA with the locked $49
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

    // Safe diagnostics — gated behind NEXT_PUBLIC_PADDLE_DEBUG so production
    // is quiet by default. Logs booleans, env classification, and a REDACTED
    // payload only. Never logs the token, the API key, or the webhook secret.
    if (process.env.NEXT_PUBLIC_PADDLE_DEBUG === "true") {
      const tokenEnv = tokenEnvClass(clientToken);
      const mismatch =
        tokenEnv !== "unknown" &&
        ((environment === "production" && tokenEnv === "test") ||
          (environment === "sandbox" && tokenEnv === "live"));
      console.info("[paddle] checkout preflight", {
        hasToken: Boolean(clientToken),
        tokenEnv,
        hasPriceId: Boolean(priceId),
        priceIdLooksValid: priceId.startsWith("pri_"),
        configuredEnvironment: environment,
        environmentMismatch: mismatch,
        customerEmailPresent: Boolean(userEmail),
        // user_id is redacted; quote/customer PII is never attached at all.
        customData: { user_id: "[redacted]", app: "quote_reclaim" },
        items: [{ priceId, quantity: 1 }],
      });
      if (mismatch) {
        console.warn(
          `[paddle] environment mismatch: token is "${tokenEnv}" but NEXT_PUBLIC_PADDLE_ENVIRONMENT is "${environment}". The overlay will open but checkout creation will fail.`,
        );
      }
    }

    setLoading(true);
    setError(null);

    // Route Paddle's single eventCallback to THIS instance's setters.
    liveHandlers.onCompleted = () => {
      setCompleted(true);
      onCompleted?.();
    };
    liveHandlers.onError = (reason) => setError(`Checkout error: ${reason}`);

    try {
      const paddle = await loadPaddleScript();

      // Pin sandbox before Initialize when explicitly configured; production
      // is Paddle.js's default and needs no call.
      if (environment === "sandbox" && paddle.Environment?.set) {
        paddle.Environment.set("sandbox");
      }

      if (!paddleInitialized) {
        paddle.Initialize({
          token: clientToken,
          eventCallback: (event) => {
            const name = event?.name ?? "";
            if (name === "checkout.completed") {
              liveHandlers.onCompleted?.();
            } else if (name === "checkout.error" || name === "checkout.warning") {
              const reason = readPaddleEventReason(event);
              // Surface the REAL reason Paddle hides behind its generic
              // "Something went wrong" overlay message.
              console.error(`[paddle] ${name}: ${reason}`);
              liveHandlers.onError?.(reason);
            }
          },
        });
        paddleInitialized = true;
      }

      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: userEmail ? { email: userEmail } : undefined,
        customData: { user_id: userId, app: "quote_reclaim" },
      });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Checkout failed to open.";
      console.error(`[paddle] failed to open checkout: ${message}`);
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
