# Launch gate — production checklist

This is the production cutover checklist for Quote Reclaim. Run through it
before flipping DNS or wiring a future billing provider against real money.

## Pricing

| Item | Value |
|------|-------|
| Monthly price | **$49/month** |
| Free quotes | **3** |
| Discounts / founder pricing | **None** |

Public price is $49/month — a single public price. There is no second
tier, no separate founding offer, no coupon-driven discount. The free
trial is enforced as a 3-quote usage limit, not a price reduction.

## Billing (currently disabled)

Quote Reclaim is between merchants of record. There is no active billing
provider in the codebase: the upgrade UI and the Paywall both show an
honest "billing is being updated — email support@quotereclaim.com" state
instead of routing to a dead checkout URL. Activating a paid account
during this window is done manually:

1. Verify the user out of band.
2. Set `profiles.is_paid = true` for that user (via the same admin
   workflow used during the original lockdown of the column —
   Migration `011_billing_column_lockdown.sql`).
3. Optionally insert a row into `public.subscriptions` for record-keeping.

When a future provider (Paddle, Stripe-via-MoR, etc.) is wired up:

- Add its env vars to `.env.example` and `docs/ENV_VARS.md`.
- Replace `disabledProvider` in `src/lib/payments/provider.ts` with the
  new adapter; it must implement the `BillingProvider` interface from
  `src/lib/payments/types.ts`.
- The Paywall and UpgradeButton UI does NOT need to change — both flip to
  the active checkout path the moment `availability()` returns
  `{ status: "available" }`.
- The webhook URL convention is `/api/webhooks/<provider>` so the
  existing `/api/webhooks/email-inbound`,
  `/api/webhooks/resend-email-events`, and `/api/webhooks/twilio/*`
  patterns translate cleanly.

## Entitlement model (provider-agnostic)

- `profiles.is_paid` is the single source of truth.
- `public.subscriptions` records provider lifecycle status.
- `Migration 011` keeps `is_paid`, `usage_count`, `jobs_won`, and
  `recovered_amount` writable only via service-role mutations.
- `check_and_increment_usage` enforces the 3-quote free limit per row.

## Production test checklist (without billing)

1. Sign in with a fresh account.
2. Create 3 quotes — the third one should still succeed.
3. Attempt a 4th quote — the Paywall renders. Confirm:
   - the headline anchors to the user's silent-quote dollars when known;
   - the CTA reads "Import the rest — $49/month" (or the no-silent
     fallback);
   - clicking the CTA surfaces the support email inline — there is no
     fetch to a 404 route, no fake "checkout coming soon" banner.
4. From an admin context, set `profiles.is_paid = true` for the test
   user and reload `/quotes/new`. The form should render.
5. Set `profiles.is_paid = false` and reload — the Paywall returns.
