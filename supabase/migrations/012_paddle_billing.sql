-- 012_paddle_billing.sql
-- Wire Paddle as the active merchant of record.
--
-- WHY this migration exists (single source of truth for the audit log):
--
--   * Quote Reclaim's runtime entitlement check stays on `profiles.is_paid`.
--     The webhook just flips that flag — no code outside billing has to learn
--     about Paddle. Migration 011 already restricts is_paid mutation to the
--     service role, which is exactly what the webhook uses, so the lockdown
--     keeps working unchanged.
--
--   * To handle the FULL subscription lifecycle (active / past_due / canceled
--     / paused), the webhook needs durable storage of the Paddle subscription
--     identifier and the latest status. Without it, a "past_due → active"
--     event would have nothing to attach to, and we'd have no way to revoke
--     entitlement when a subscription cancels later.
--
--     The existing `subscriptions` table already has `status`,
--     `current_period_start`, `current_period_end` — those are reused as-is.
--     We add two new nullable columns to it: `paddle_subscription_id` and
--     `paddle_customer_id`. They sit beside the legacy `ls_*` columns rather
--     than replacing them, so any historical data is preserved.
--
--   * Paddle delivers webhooks at-least-once. To stay idempotent under
--     retries (Paddle re-delivers on 5xx and on dropped TCP), we need to
--     remember which `event_id` values we've already processed. A small
--     `paddle_events` ledger with `event_id` as the primary key turns the
--     dedupe into a single UPSERT / INSERT ON CONFLICT.
--
-- Additive only: no columns dropped, no policies changed, no existing data
-- touched. Apply with `npx supabase db push` or paste into the SQL editor.

-- ---------------------------------------------------------------------------
-- subscriptions: add Paddle identifiers
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column if not exists paddle_subscription_id text,
  add column if not exists paddle_customer_id text;

-- A user has at most one Paddle subscription at a time, so the subscription
-- id is unique when present. NULL is allowed (free users, legacy rows).
create unique index if not exists idx_subscriptions_paddle_sub
  on public.subscriptions(paddle_subscription_id)
  where paddle_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- paddle_events: per-event idempotency ledger
-- ---------------------------------------------------------------------------

create table if not exists public.paddle_events (
  event_id text primary key,
  event_type text not null,
  subscription_id text,
  received_at timestamptz default now()
);

alter table public.paddle_events enable row level security;
-- No policies. Service role only.
