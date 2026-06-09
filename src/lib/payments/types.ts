/**
 * Provider-agnostic billing types.
 *
 * Quote Reclaim launched without an active billing provider. This file
 * defines the narrow shape any future merchant-of-record adapter must
 * implement so the UI and entitlement layer never need to learn the
 * provider's name.
 */

export type CheckoutAvailability =
  /** Provider is fully wired and a checkout URL can be created right now. */
  | { status: "available" }
  /**
   * Provider is intentionally disabled (no credentials, or rejected store).
   * UI must show an honest "billing being updated" message with a support
   * email, NOT a dead checkout button.
   */
  | { status: "disabled"; supportEmail: string };

export type CheckoutRequest = {
  userId: string;
  userEmail?: string | null;
};

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

export interface BillingProvider {
  /** Stable name for logs / debug only — never shown to users. */
  readonly name: string;
  /** Synchronous availability probe. UI uses this to choose between the
   *  "Upgrade" CTA and the safe "billing being updated" state. */
  availability(): CheckoutAvailability;
  /** Build a hosted checkout URL for the authenticated user. Implementations
   *  MUST NOT trust caller-supplied user_id for entitlement — they should
   *  pin the user_id into the provider's checkout metadata server-side. */
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
}
