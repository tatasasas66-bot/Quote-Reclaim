-- 008_quiet_signal.sql
-- Quiet Signal: store email open/click engagement so the deterministic
-- rule engine can diagnose silent quotes. Additive only — no edits to
-- existing tables / columns / constraints / RLS policies / RPCs.

-- ---------------------------------------------------------------------------
-- email_webhook_events — Resend/Svix dedupe ledger
-- ---------------------------------------------------------------------------
-- One row per delivered Resend webhook attempt. svix-id is the unique
-- upstream event id, so inserting twice is a no-op and tells the handler
-- the event has already been counted. This is the atomic gate the
-- record_email_event RPC checks before incrementing counters, so
-- duplicate webhook deliveries can never double-count.

create table if not exists public.email_webhook_events (
  svix_id text primary key,
  event_type text not null,
  email_id text,
  received_at timestamptz not null default now()
);

create index if not exists idx_email_webhook_events_email
  on public.email_webhook_events(email_id, event_type);

-- Service-only writes; no contractor ever reads this table directly.
alter table public.email_webhook_events enable row level security;

-- ---------------------------------------------------------------------------
-- outbound_messages — minimal engagement counters
-- ---------------------------------------------------------------------------
-- Default 0 so existing rows pre-webhook keep working; UI treats 0/0 as
-- "no engagement data yet" and falls back to normal_silence.

alter table public.outbound_messages
  add column if not exists open_count int not null default 0,
  add column if not exists click_count int not null default 0,
  add column if not exists first_opened_at timestamptz,
  add column if not exists last_engaged_at timestamptz;

-- ---------------------------------------------------------------------------
-- record_email_event(svix_id, event_type, email_id) RPC
-- ---------------------------------------------------------------------------
-- Atomic: in one transaction, insert the svix_id dedupe row AND bump the
-- counter on outbound_messages. If the svix_id already exists, return
-- 'duplicate' and touch nothing. If no outbound_messages row matches the
-- email_id, return 'unknown_email' (still recorded in the ledger so we do
-- not re-process it).
--
-- Returning a small status string keeps the webhook handler thin and
-- avoids stateful logic in the application layer.

create or replace function public.record_email_event(
  p_svix_id text,
  p_event_type text,
  p_email_id text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_inserted_id text;
  v_match_count int;
begin
  -- Idempotency: try the insert; on conflict return 'duplicate' without
  -- touching counters.
  insert into public.email_webhook_events (svix_id, event_type, email_id)
  values (p_svix_id, p_event_type, p_email_id)
  on conflict (svix_id) do nothing
  returning svix_id into v_inserted_id;

  if v_inserted_id is null then
    return 'duplicate';
  end if;

  if p_email_id is null or length(trim(p_email_id)) = 0 then
    return 'unknown_email';
  end if;

  if p_event_type = 'email.opened' then
    update public.outbound_messages
       set open_count      = coalesce(open_count, 0) + 1,
           first_opened_at = coalesce(first_opened_at, v_now),
           last_engaged_at = v_now
     where provider_msg_id = p_email_id;
    get diagnostics v_match_count = row_count;
  elsif p_event_type = 'email.clicked' then
    update public.outbound_messages
       set click_count     = coalesce(click_count, 0) + 1,
           last_engaged_at = v_now
     where provider_msg_id = p_email_id;
    get diagnostics v_match_count = row_count;
  else
    -- Other Resend event types (delivered, bounced, complained, ...) are
    -- recorded in the dedupe ledger but do not move counters here.
    return 'ignored';
  end if;

  if v_match_count = 0 then
    return 'unknown_email';
  end if;

  return 'processed';
end;
$$;

revoke all on function public.record_email_event(text, text, text) from public;
grant execute on function public.record_email_event(text, text, text) to service_role;
