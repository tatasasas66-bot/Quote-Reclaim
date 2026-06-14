import type { BillingProvider } from "./types";
import { disabledProvider } from "./disabled-provider";
import { paddleProvider, paddleClientConfigured } from "./paddle-provider";

/**
 * Returns the active billing provider for this deployment.
 *
 * When the Paddle client env vars are present (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
 * + NEXT_PUBLIC_PADDLE_PRICE_ID), Paddle is the active provider and the UI
 * opens its overlay checkout. When they are absent, we fall back to the
 * safe-disabled provider — the UI shows the honest "billing is being updated"
 * state and the support email instead of a button that opens broken checkout.
 *
 * Kept as a function (not a const) so the environment is read at call time
 * — important for tests and for deployments that toggle env vars without a
 * rebuild.
 */
export function getBillingProvider(): BillingProvider {
  if (paddleClientConfigured()) return paddleProvider;
  return disabledProvider;
}
