-- 001_core_schema.sql
-- Core tables, RLS, triggers, and RPCs for Quote Reclaim.
-- Assumes a fresh Supabase project. Apply with `npx supabase db push`
-- or by pasting into the Supabase SQL editor in order (001 -> 005).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  contractor_phone text,
  trade text,
  city text,
  state char(2),
  briefing_enabled boolean default true,
  jobs_won int default 0,
  recovered_amount numeric(12,2) default 0,
  usage_count int default 0,
  is_paid boolean default false,
  onboarding_done boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Auto-create a profile when a Supabase auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------------

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sequence_id uuid not null default gen_random_uuid(),
  idempotency_key text,

  trade text not null,
  city text default '',
  state char(2) default '',
  estimate_amount numeric(10,2) not null check (estimate_amount >= 0),
  job_description text,

  days_silent int not null default 0 check (days_silent >= 0),
  quote_sent_at timestamptz,

  client_name text not null,
  client_email text,
  client_phone text,
  client_opted_out boolean default false,

  outcome text default 'pending' check (outcome in ('pending','won','closed')),
  won_at timestamptz,
  closed_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.quotes enable row level security;

drop policy if exists "quotes_select_own" on public.quotes;
create policy "quotes_select_own"
  on public.quotes for select
  using (auth.uid() = user_id);

drop policy if exists "quotes_insert_own" on public.quotes;
create policy "quotes_insert_own"
  on public.quotes for insert
  with check (auth.uid() = user_id);

drop policy if exists "quotes_update_own" on public.quotes;
create policy "quotes_update_own"
  on public.quotes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_quotes_pending
  on public.quotes(user_id, created_at desc)
  where outcome = 'pending';

create index if not exists idx_quotes_won_at
  on public.quotes(user_id, won_at desc)
  where outcome = 'won';

create unique index if not exists idx_quotes_user_idempotency
  on public.quotes(user_id, idempotency_key)
  where idempotency_key is not null;

drop trigger if exists trg_quotes_updated_at on public.quotes;
create trigger trg_quotes_updated_at
  before update on public.quotes
  for each row execute function public.touch_updated_at();

create or replace function public.prevent_status_downgrade()
returns trigger
language plpgsql
as $$
begin
  if old.outcome = 'won' and new.outcome <> 'won' then
    raise exception 'Cannot downgrade quote from won';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quotes_prevent_downgrade on public.quotes;
create trigger trg_quotes_prevent_downgrade
  before update on public.quotes
  for each row execute function public.prevent_status_downgrade();

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,

  followup_number int not null check (followup_number in (1,2,3)),
  message_type text not null,
  message_text text not null,
  framework_used text,
  cta_type text,
  send_at timestamptz not null,

  sent boolean default false,
  sent_at timestamptz,
  paused_at timestamptz,

  claimed_by text,
  claimed_at timestamptz,

  created_at timestamptz default now()
);

alter table public.reminders enable row level security;

drop policy if exists "reminders_select_own" on public.reminders;
create policy "reminders_select_own"
  on public.reminders for select
  using (auth.uid() = user_id);

drop policy if exists "reminders_update_own" on public.reminders;
create policy "reminders_update_own"
  on public.reminders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_reminders_due
  on public.reminders(send_at)
  where sent = false and claimed_by is null and paused_at is null;

create index if not exists idx_reminders_quote on public.reminders(quote_id);

create unique index if not exists idx_reminders_unique_step
  on public.reminders(quote_id, followup_number);

-- ---------------------------------------------------------------------------
-- outbound_messages
-- ---------------------------------------------------------------------------

create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  reminder_id uuid references public.reminders(id) on delete set null,

  channel text not null check (channel in ('sms','email','manual')),
  recipient text not null,
  message_text text not null,

  status text not null default 'queued'
    check (status in ('queued','sent','delivered','undelivered','failed','replied')),
  provider_msg_id text,
  failure_reason text,
  sent_at timestamptz,
  delivered_at timestamptz,

  reply_text text,
  reply_at timestamptz,
  reply_provider_msg_id text,

  idempotency_key text,
  created_at timestamptz default now()
);

alter table public.outbound_messages enable row level security;

drop policy if exists "outbound_select_own" on public.outbound_messages;
create policy "outbound_select_own"
  on public.outbound_messages for select
  using (auth.uid() = user_id);

create index if not exists idx_om_quote on public.outbound_messages(quote_id);
create index if not exists idx_om_recipient
  on public.outbound_messages(recipient, created_at desc);

create unique index if not exists idx_om_provider_msg
  on public.outbound_messages(provider_msg_id)
  where provider_msg_id is not null;

create unique index if not exists idx_om_idempotency
  on public.outbound_messages(reminder_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists idx_om_reply_provider_msg
  on public.outbound_messages(reply_provider_msg_id)
  where reply_provider_msg_id is not null;

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ls_subscription_id text,
  ls_order_id text,
  status text not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- cron_runs (service-role observability table)
-- ---------------------------------------------------------------------------

create table if not exists public.cron_runs (
  id uuid primary key,
  cron_name text not null,
  status text not null check (status in ('running','success','partial','failed')),
  reminders_sent int default 0,
  errors jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz
);

alter table public.cron_runs enable row level security;
-- No policies. Service role only.

-- ===========================================================================
-- RPCs
-- ===========================================================================

-- Free-tier usage gate. 3 quotes free; afterwards require subscription.
create or replace function public.check_and_increment_usage(
  p_user_id uuid,
  p_free_limit int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usage int;
  v_is_paid boolean;
  v_silent_value numeric;
begin
  select usage_count, is_paid
    into v_usage, v_is_paid
  from public.profiles
  where id = p_user_id;

  if v_is_paid then
    update public.profiles
      set usage_count = usage_count + 1
    where id = p_user_id;
    return jsonb_build_object('allowed', true);
  end if;

  if v_usage >= p_free_limit then
    select coalesce(sum(estimate_amount), 0)
      into v_silent_value
    from public.quotes
    where user_id = p_user_id and outcome = 'pending';
    return jsonb_build_object(
      'allowed', false,
      'silent_quote_value', v_silent_value
    );
  end if;

  update public.profiles
    set usage_count = usage_count + 1
  where id = p_user_id;
  return jsonb_build_object('allowed', true);
end;
$$;

revoke execute on function public.check_and_increment_usage(uuid, int) from public;
grant execute on function public.check_and_increment_usage(uuid, int) to service_role;

-- Batch-claim due reminders for cron dispatch.
create or replace function public.claim_due_reminders(p_cron_run_id uuid)
returns table (
  reminder_id uuid,
  user_id uuid,
  quote_id uuid,
  followup_number int,
  message_type text,
  message_text text,
  framework_used text,
  cta_type text,
  recipient_phone text,
  recipient_email text,
  client_opted_out boolean,
  trade text,
  city text,
  state char(2),
  estimate_amount numeric,
  sequence_id uuid,
  client_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimed as (
    update public.reminders r
       set claimed_by = p_cron_run_id::text,
           claimed_at = now()
     where r.id in (
       select r2.id
       from public.reminders r2
       join public.quotes q on q.id = r2.quote_id
       where r2.sent = false
         and r2.send_at <= now()
         and r2.claimed_by is null
         and r2.paused_at is null
         and q.outcome = 'pending'
         and q.client_opted_out = false
         and not exists (
           -- Auto-pause: if any prior message for this quote was replied to, halt
           select 1
           from public.outbound_messages om
           where om.quote_id = r2.quote_id
             and om.status = 'replied'
         )
       order by r2.send_at
       limit 200
       for update skip locked
     )
    returning r.*
  )
  select
    c.id,
    c.user_id,
    c.quote_id,
    c.followup_number,
    c.message_type,
    c.message_text,
    c.framework_used,
    c.cta_type,
    q.client_phone,
    q.client_email,
    q.client_opted_out,
    q.trade,
    q.city,
    q.state,
    q.estimate_amount,
    q.sequence_id,
    q.client_name
  from claimed c
  join public.quotes q on q.id = c.quote_id;
end;
$$;

revoke execute on function public.claim_due_reminders(uuid) from public;
grant execute on function public.claim_due_reminders(uuid) to service_role;

-- Claim a single reminder for an authenticated manual send.
create or replace function public.claim_reminder_manual(
  p_reminder_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  update public.reminders
     set claimed_by = 'manual:' || p_user_id::text,
         claimed_at = now()
   where id = p_reminder_id
     and user_id = p_user_id
     and sent = false
     and claimed_by is null
     and paused_at is null;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke execute on function public.claim_reminder_manual(uuid, uuid) from public;
grant execute on function public.claim_reminder_manual(uuid, uuid) to service_role;

-- Record a win, cancel remaining reminders, update profile aggregates.
create or replace function public.mark_quote_won(
  p_quote_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.quotes%rowtype;
  v_amount numeric;
  v_jobs_won int;
begin
  select * into v_quote
  from public.quotes
  where id = p_quote_id and user_id = p_user_id
  for update skip locked;

  if v_quote.id is null then
    return jsonb_build_object('error', 'Quote not found');
  end if;

  if v_quote.outcome = 'won' then
    return jsonb_build_object('error', 'Already won');
  end if;

  v_amount := v_quote.estimate_amount;

  update public.quotes
     set outcome = 'won',
         won_at = now()
   where id = p_quote_id;

  update public.reminders
     set paused_at = now()
   where quote_id = p_quote_id
     and sent = false
     and paused_at is null;

  update public.profiles
     set jobs_won = jobs_won + 1,
         recovered_amount = recovered_amount + v_amount
   where id = p_user_id
  returning jobs_won into v_jobs_won;

  return jsonb_build_object(
    'recovered_amount', v_amount,
    'jobs_won', v_jobs_won
  );
end;
$$;

revoke execute on function public.mark_quote_won(uuid, uuid) from public;
grant execute on function public.mark_quote_won(uuid, uuid) to service_role;

-- Pause / resume the remaining reminders for a quote.
create or replace function public.toggle_sequence_pause(
  p_quote_id uuid,
  p_user_id uuid,
  p_paused boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote_user uuid;
  v_count int;
begin
  select user_id into v_quote_user from public.quotes where id = p_quote_id;
  if v_quote_user is null or v_quote_user <> p_user_id then
    return jsonb_build_object('error', 'Not authorized');
  end if;

  if p_paused then
    update public.reminders
       set paused_at = now()
     where quote_id = p_quote_id
       and sent = false
       and paused_at is null;
  else
    update public.reminders
       set paused_at = null
     where quote_id = p_quote_id
       and sent = false
       and paused_at is not null;
  end if;

  get diagnostics v_count = row_count;
  return jsonb_build_object('paused_count', v_count);
end;
$$;

revoke execute on function public.toggle_sequence_pause(uuid, uuid, boolean) from public;
grant execute on function public.toggle_sequence_pause(uuid, uuid, boolean) to service_role;
