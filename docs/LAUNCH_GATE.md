# Launch gate — production checklist

This is the production cutover checklist for Quote Reclaim. Run through it
before flipping DNS or enabling Lemon Squeezy webhooks against real money.

## Pricing

| Item | Value |
|------|-------|
| Monthly price | **$79/month** |
| Free quotes | **3** |
| Discounts / founder pricing | **None** |

Public price is $79/month. There is no $39 plan, no $49 founding offer,
no coupon-driven discount. The free trial is enforced as a 3-quote
usage limit, not a price reduction.

## Lemon Squeezy

### Required env vars

Pick exactly one checkout mode:

**Mode A (preferred, API-created checkout):**
- `LEMONSQUEEZY_API_KEY` — issue from https://app.lemonsqueezy.com/settings/api
- `LEMONSQUEEZY_STORE_ID` — numeric store ID from the dashboard URL
- `LEMONSQUEEZY_VARIANT_ID` — numeric variant ID for the $79/month plan

**Mode B (fallback, direct store URL):**
- `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL` — the public checkout link
  (must start with `https://`). The server appends
  `?checkout[custom][user_id]=<uuid>` so the webhook can attribute.

**Always required in production:**
- `LEMONSQUEEZY_WEBHOOK_SECRET` — generated when you create the webhook
  endpoint in Lemon. Used for HMAC-SHA256 verification.

### Webhook URL

Configure in Lemon's dashboard at **Settings → Webhooks → Add endpoint**:

```
https://quote-reclaim.vercel.app/api/webhooks/lemonsqueezy
```

Subscribe to these events:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_expired`
- `subscription_resumed` (if available)
- `subscription_paused` / `subscription_unpaused`

Paid statuses: `active`, `on_trial`. Every other status flips
`profiles.is_paid` to `false`.

### Production test checklist

After deploying with real Lemon env vars:

1. Sign in with a fresh account.
2. Create 3 quotes — the third one should still succeed.
3. Attempt a 4th quote — the paywall renders. Confirm copy reads
   **"Unlock unlimited recovery — $79/month"** and nothing else.
4. Click the CTA. Verify the browser lands on a real Lemon checkout
   page (not `#`, not a 503 toast).
5. Pay with a test card (Lemon test mode).
6. Confirm the webhook fired:
   - `subscriptions` row exists for the user with `status = 'active'`.
   - `profiles.is_paid = true` for the user.
7. Reload `/quotes/new` — the form should render, not the paywall.
8. In Lemon, cancel the subscription. Wait for the webhook.
9. Confirm `profiles.is_paid = false` and the paywall returns on
   `/quotes/new`.

### Webhook integrity rules

- Production without `LEMONSQUEEZY_WEBHOOK_SECRET` → route returns 503.
- Invalid signature → 401.
- Missing `meta.custom_data.user_id` → 500 (Lemon retries).
- No matching profile for the supplied user_id → 500 (Lemon retries).
- Duplicate webhooks are idempotent: `subscriptions.upsert(onConflict: user_id)`
  and `profiles.update(is_paid)` are deterministic on repeat.
