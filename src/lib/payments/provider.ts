import type { BillingProvider } from "./types";
import { disabledProvider } from "./disabled-provider";

/**
 * Returns the active billing provider for this deployment.
 *
 * Quote Reclaim is currently between merchants of record, so the only
 * provider is the safe-disabled one — UI shows an honest "billing being
 * updated" message and any checkout attempt returns 503. When a future
 * MoR adapter lands, swap the return here; nothing else downstream needs
 * to change.
 *
 * Kept as a function (not a const) so future selectors can read env flags
 * without forcing every importer to learn the wiring.
 */
export function getBillingProvider(): BillingProvider {
  return disabledProvider;
}
