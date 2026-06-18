/**
 * Provider-agnostic entitlement constants + helpers.
 *
 * Holds the truly provider-agnostic surface — the price, the free-plan
 * size, and a status-string check a webhook adapter can call when mapping
 * a provider lifecycle event to entitled / not entitled.
 *
 * A future MoR adapter must import these constants from here (not invent
 * its own price), and must implement the `BillingProvider` interface in
 * `./types`.
 */

export const MONTHLY_PRICE_USD = 49;
export const PAYWALL_PRICE_LABEL = "$49/month";
export const FREE_PLAN_LIMIT = 3;

const PAID_STATUSES: ReadonlySet<string> = new Set(["active", "on_trial"]);

/**
 * True when a subscription lifecycle status (e.g. from a future provider's
 * subscription_created / subscription_updated webhook) maps to entitled.
 * Returns false for any unknown / cancelled / past_due / null status.
 */
export function isPaidStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return PAID_STATUSES.has(status.toLowerCase());
}
