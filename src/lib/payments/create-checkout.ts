import {
  type LemonEnv,
  readLemonEnv,
  resolveCheckoutMode,
} from "./lemonsqueezy";

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number };

/**
 * Build a Lemon Squeezy checkout URL for the authenticated user.
 *
 * Two modes:
 *  - API: calls Lemon's /v1/checkouts endpoint with user_id pinned in
 *    checkout_data.custom. Returns the one-time URL Lemon hands back.
 *  - public-URL: appends checkout[custom][user_id]= to the store's checkout
 *    link. Lower-trust because the param sits in the URL, but Lemon will
 *    still echo it back to us via the webhook custom_data field.
 *
 * Either path requires the caller to have already authenticated the user.
 */
export async function createLemonCheckoutForUser(params: {
  userId: string;
  userEmail?: string | null;
  env?: LemonEnv;
}): Promise<CheckoutResult> {
  const env = params.env ?? readLemonEnv();
  const mode = resolveCheckoutMode(env);

  if (mode === "unavailable") {
    return {
      ok: false,
      status: 503,
      error:
        "Checkout is not configured. Configure LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, and LEMONSQUEEZY_VARIANT_ID, or set NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL.",
    };
  }

  if (mode === "public-url") {
    const base = env.publicCheckoutUrl ?? "";
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      return { ok: false, status: 503, error: "Checkout URL is malformed." };
    }
    if (url.protocol !== "https:") {
      return { ok: false, status: 503, error: "Checkout URL must be HTTPS." };
    }
    url.searchParams.set("checkout[custom][user_id]", params.userId);
    if (params.userEmail) {
      url.searchParams.set("checkout[email]", params.userEmail);
    }
    return { ok: true, url: url.toString() };
  }

  // API mode
  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          custom: { user_id: params.userId },
          email: params.userEmail ?? undefined,
        },
      },
      relationships: {
        store: { data: { type: "stores", id: env.storeId } },
        variant: { data: { type: "variants", id: env.variantId } },
      },
    },
  };

  let response: Response;
  try {
    response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return {
      ok: false,
      status: 502,
      error: `Checkout provider unreachable: ${message}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      error: `Checkout creation failed (${response.status})`,
    };
  }

  let json: { data?: { attributes?: { url?: string } } };
  try {
    json = await response.json();
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Checkout response was not valid JSON.",
    };
  }

  const url = json?.data?.attributes?.url;
  if (!url || typeof url !== "string") {
    return {
      ok: false,
      status: 502,
      error: "Checkout response missing URL.",
    };
  }

  return { ok: true, url };
}
