import type {
  BillingProvider,
  CheckoutAvailability,
  CheckoutResult,
} from "./types";
import { SUPPORT_EMAIL } from "./disabled-provider";

/**
 * Paddle billing provider.
 *
 * Checkout itself runs CLIENT-SIDE through Paddle.js — no server route
 * builds a hosted URL — so `createCheckout` is only used as a defensive
 * fallback (e.g. for code that asks the provider abstraction directly).
 * The real checkout entry point is the `PaddleCheckoutButton` component,
 * which opens the overlay with the public client token and the price id.
 *
 * `availability()` returns `available` only when ALL Paddle env vars
 * required for a real checkout are present. If any are missing, the UI
 * gracefully falls back to the safe-disabled state instead of showing a
 * button that opens an overlay with "client token invalid" — which would
 * be more confusing than the honest "billing is being updated" message.
 */
export const paddleProvider: BillingProvider = {
  name: "paddle",
  availability(): CheckoutAvailability {
    if (paddleClientConfigured()) return { status: "available" };
    return { status: "disabled", supportEmail: SUPPORT_EMAIL };
  },
  async createCheckout(): Promise<CheckoutResult> {
    // Client-side overlay flow — there's no server-issued checkout URL.
    return {
      ok: false,
      status: 501,
      error: "Paddle checkout opens client-side via Paddle.js.",
    };
  },
};

/**
 * The two env vars the checkout button needs in the browser:
 *   - NEXT_PUBLIC_PADDLE_CLIENT_TOKEN  — the public client-side token
 *   - NEXT_PUBLIC_PADDLE_PRICE_ID      — the priced subscription item id
 *
 * Both are public by design (they ship in the bundle). The webhook secret
 * and the server API key are NEVER read here.
 */
export function paddleClientConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() &&
      process.env.NEXT_PUBLIC_PADDLE_PRICE_ID?.trim(),
  );
}

/** Paddle environment ("sandbox" vs "production"). Defaults to production
 *  so a missing/typoed env var never accidentally opens sandbox checkout. */
export function paddleEnvironment(): "sandbox" | "production" {
  const raw = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT?.trim().toLowerCase();
  return raw === "sandbox" ? "sandbox" : "production";
}
