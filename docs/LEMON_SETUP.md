# Lemon Squeezy Setup Checklist

Step-by-step guide to configure Lemon Squeezy payments for Quote Reclaim.

**Price is $79/month. There are no discounts, no founding offers, and no other plans.**

---

## 1. Create a Lemon Squeezy account

1. Go to [app.lemonsqueezy.com](https://app.lemonsqueezy.com) and sign up.
2. Complete identity verification (required to receive payouts).
3. Note your **Store ID** from the dashboard URL: `app.lemonsqueezy.com/stores/<id>`.

---

## 2. Create the product

1. Go to **Products → New product**.
2. Name: **Quote Reclaim** (or similar).
3. Add a variant:
   - Price: **$79.00 USD**
   - Billing: **Monthly**
   - Name: e.g. "Monthly"
4. Save. Note the **Variant ID** (shown in the variant URL or via Lemon API).

**Do not create additional variants or pricing tiers.** The app enforces a single
`$79/month` price. Adding variants won't be honored by the checkout flow — only
the configured `LEMONSQUEEZY_VARIANT_ID` is used.

---

## 3. Choose a checkout mode

### Mode A — API-created checkouts (preferred)

Checkouts are created server-side via the Lemon API. The `user_id` is pinned
inside the server call, so clients cannot tamper with it.

1. Go to **Settings → API** → create an API key.
2. Set env vars:
   ```
   LEMONSQUEEZY_API_KEY=your_api_key
   LEMONSQUEEZY_STORE_ID=12345
   LEMONSQUEEZY_VARIANT_ID=67890
   ```
3. Do NOT set `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL`.

### Mode B — Direct store URL (fallback)

Use when API access is unavailable. The app appends `user_id` as a URL query
parameter. Lower security than Mode A but fully functional.

1. Open your product → **Share** → copy the checkout URL.
2. Set env var:
   ```
   NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL=https://your-store.lemonsqueezy.com/checkout/buy/xxxxxxxx
   ```
3. Do NOT set the three Mode A vars.

---

## 4. Configure the webhook endpoint

1. Go to **Settings → Webhooks → Add endpoint**.
2. URL:
   ```
   https://quote-reclaim.vercel.app/api/webhooks/lemonsqueezy
   ```
3. Subscribe to these events:
   - `subscription_created`
   - `subscription_updated`
   - `subscription_cancelled`
   - `subscription_expired`
   - `subscription_resumed`
   - `subscription_paused`
   - `subscription_unpaused`
4. Copy the **Signing Secret** shown after creation.
5. Set env var:
   ```
   LEMONSQUEEZY_WEBHOOK_SECRET=your_signing_secret
   ```

**The webhook secret is shown once.** Save it immediately.

---

## 5. Subscription status mapping

The app considers these statuses **paid** (`profiles.is_paid = true`):

| Lemon status | Paid? |
|-------------|------|
| `active` | Yes |
| `on_trial` | Yes |
| `cancelled` | No |
| `expired` | No |
| `paused` | No |
| `past_due` | No |
| anything else | No |

---

## 6. Webhook integrity rules

| Condition | Behavior |
|-----------|---------|
| `LEMONSQUEEZY_WEBHOOK_SECRET` absent, production | Route returns 503 |
| `LEMONSQUEEZY_WEBHOOK_SECRET` absent, non-production | Signature skipped (dev mode) |
| Invalid HMAC-SHA256 signature | 401 |
| Missing `meta.custom_data.user_id` | 500 — Lemon retries |
| No matching profile row | 500 — Lemon retries |
| Duplicate webhook delivery | Idempotent: upsert on `user_id` |

---

## 7. Test checkout flow

Use Lemon Squeezy test mode before going live:

1. Enable **Test mode** in Lemon (toggle in top-right of dashboard).
2. Set env vars to your test API key and test variant ID (or use the test checkout URL).
3. Sign in to Quote Reclaim with a fresh test user.
4. Create 3 quotes — paywall should appear on the 4th attempt.
5. Click **Unlock unlimited recovery — $79/month**.
6. Complete checkout with a Lemon test card.
7. Confirm webhook fires:
   - `subscriptions` row: `status = 'active'`
   - `profiles.is_paid = true`
8. Reload `/quotes/new` — form renders, not paywall.
9. Cancel the subscription in Lemon test dashboard. Wait for webhook.
10. Confirm `profiles.is_paid = false`; paywall returns.

---

## 8. Production go-live

1. Disable test mode in Lemon Squeezy.
2. Update Vercel env vars to production API key, store ID, variant ID, webhook secret.
3. Re-run the test checkout flow with a real card using the lowest possible amount
   (or a Lemon refund if your account supports it).
4. Confirm `subscriptions` and `profiles` rows updated correctly.

---

## Environment variable reference

| Variable | Mode | Required |
|----------|------|---------|
| `LEMONSQUEEZY_API_KEY` | A | Yes (Mode A) |
| `LEMONSQUEEZY_STORE_ID` | A | Yes (Mode A) |
| `LEMONSQUEEZY_VARIANT_ID` | A | Yes (Mode A) |
| `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL` | B | Yes (Mode B) |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Both | Yes (production) |
