export const MONTHLY_PRICE_USD = 79;
export const PAYWALL_PRICE_LABEL = "$79/month";
export const FREE_PLAN_LIMIT = 3;

const PAID_STATUSES: ReadonlySet<string> = new Set(["active", "on_trial"]);

export function isPaidStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return PAID_STATUSES.has(status.toLowerCase());
}

export type LemonEnv = {
  apiKey?: string;
  storeId?: string;
  variantId?: string;
  publicCheckoutUrl?: string;
  webhookSecret?: string;
};

type EnvLike = Record<string, string | undefined>;

export function readLemonEnv(env: EnvLike = process.env): LemonEnv {
  return {
    apiKey: env.LEMONSQUEEZY_API_KEY || undefined,
    storeId: env.LEMONSQUEEZY_STORE_ID || undefined,
    variantId: env.LEMONSQUEEZY_VARIANT_ID || undefined,
    publicCheckoutUrl: env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL || undefined,
    webhookSecret: env.LEMONSQUEEZY_WEBHOOK_SECRET || undefined,
  };
}

export type CheckoutMode = "api" | "public-url" | "unavailable";

/**
 * Prefer the API mode when fully configured: it lets us pin user_id in
 * checkout_data without trusting client input. The public-URL fallback
 * appends ?checkout[custom][user_id]= which Lemon honors but is exposed
 * to the client. Both modes still require server-side authentication
 * before reaching this resolver.
 */
export function resolveCheckoutMode(env: LemonEnv): CheckoutMode {
  if (env.apiKey && env.storeId && env.variantId) return "api";
  if (env.publicCheckoutUrl) return "public-url";
  return "unavailable";
}
