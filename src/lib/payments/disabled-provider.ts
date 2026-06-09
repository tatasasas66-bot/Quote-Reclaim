import type {
  BillingProvider,
  CheckoutAvailability,
  CheckoutResult,
} from "./types";

/**
 * The safe-disabled billing provider.
 *
 * This is the active provider while Quote Reclaim is between merchants of
 * record. It returns `disabled` from `availability()` so the UI shows the
 * honest "billing being updated — contact support@quotereclaim.com" state
 * instead of a dead checkout button, and any direct attempt to call
 * `createCheckout` returns 503 with the same message — never a 200 with a
 * fake URL.
 *
 * Once a future provider is wired up, replace this in `provider.ts`'s
 * selector — the UI does not need to change.
 */
export const SUPPORT_EMAIL = "support@quotereclaim.com";

export const BILLING_DISABLED_MESSAGE =
  `Billing is being updated. Contact ${SUPPORT_EMAIL} to activate your account.`;

export const disabledProvider: BillingProvider = {
  name: "disabled",
  availability(): CheckoutAvailability {
    return { status: "disabled", supportEmail: SUPPORT_EMAIL };
  },
  async createCheckout(): Promise<CheckoutResult> {
    return { ok: false, status: 503, error: BILLING_DISABLED_MESSAGE };
  },
};
