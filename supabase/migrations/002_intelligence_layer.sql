-- 002_intelligence_layer.sql
-- Recovery Graph telemetry: append-only events + rolling aggregates.

-- ---------------------------------------------------------------------------
-- recovery_events (append-only event log)
-- ---------------------------------------------------------------------------

create table if not exists public.recovery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sequence_id uuid not null,
  quote_id uuid,
  event_type text not null check (event_type in (
    'estimate_created',
    'followup_generated',
    'message_sent',
    'message_delivered',
    'reply_received',
    'win_recorded',
    'sequence_closed',
    'opt_out'
  )),
  trade text,
  city text,
  state char(2),
  estimate_amount numeric(10,2),
  value_band text,
  days_since_estimate int,
  followup_number int,
  message_type text,
  framework_used text,
  cta_type text,
  channel text,
  message_text text,
  reply_text text,
  reply_sentiment text,
  reply_intent text,
  source_event_id text,
  is_winning_event boolean default false,
  -- Anchor to UTC so the expression is IMMUTABLE (required for generated columns).
  -- Application code that segments by local hour/day should apply the contractor's
  -- timezone at query time.
  hour_of_day int generated always as (extract(hour from (created_at at time zone 'UTC'))::int) stored,
  day_of_week int generated always as (extract(dow from (created_at at time zone 'UTC'))::int) stored,
  created_at timestamptz default now()
);

-- Enforce append-only: silently drop UPDATE/DELETE attempts.
drop rule if exists recovery_events_no_update on public.recovery_events;
create rule recovery_events_no_update as
  on update to public.recovery_events do instead nothing;

drop rule if exists recovery_events_no_delete on public.recovery_events;
create rule recovery_events_no_delete as
  on delete to public.recovery_events do instead nothing;

create unique index if not exists idx_recovery_events_source
  on public.recovery_events(source_event_id, event_type)
  where source_event_id is not null;

create index if not exists idx_recovery_events_user_created
  on public.recovery_events(user_id, created_at desc);

create index if not exists idx_recovery_events_segment
  on public.recovery_events(trade, value_band, event_type);

alter table public.recovery_events enable row level security;

drop policy if exists "events_select_own" on public.recovery_events;
create policy "events_select_own"
  on public.recovery_events for select
  using (auth.uid() = user_id);
-- No insert/update/delete policies. Writes happen via service role only.

-- ---------------------------------------------------------------------------
-- sequence_intelligence (one row per sequence_id)
-- ---------------------------------------------------------------------------

create table if not exists public.sequence_intelligence (
  sequence_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  trade text,
  value_band text,
  total_messages_sent int default 0,
  total_replies int default 0,
  won boolean default false,
  win_amount numeric(12,2),
  first_message_at timestamptz,
  first_reply_at timestamptz,
  won_at timestamptz,
  framework_path text[],
  updated_at timestamptz default now()
);

alter table public.sequence_intelligence enable row level security;

drop policy if exists "seq_intel_select_own" on public.sequence_intelligence;
create policy "seq_intel_select_own"
  on public.sequence_intelligence for select
  using (auth.uid() = user_id);

drop trigger if exists trg_seq_intel_updated_at on public.sequence_intelligence;
create trigger trg_seq_intel_updated_at
  before update on public.sequence_intelligence
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- contractor_intelligence (one row per profile)
-- ---------------------------------------------------------------------------

create table if not exists public.contractor_intelligence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_sequences int default 0,
  total_messages_sent int default 0,
  total_replies int default 0,
  total_wins int default 0,
  total_recovered numeric(14,2) default 0,
  median_reply_lag_days numeric(5,2),
  best_framework text,
  best_hour int,
  best_day int,
  unlock_tier int default 0,
  updated_at timestamptz default now()
);

alter table public.contractor_intelligence enable row level security;

drop policy if exists "contractor_intel_select_own" on public.contractor_intelligence;
create policy "contractor_intel_select_own"
  on public.contractor_intelligence for select
  using (auth.uid() = user_id);

drop trigger if exists trg_contractor_intel_updated_at on public.contractor_intelligence;
create trigger trg_contractor_intel_updated_at
  before update on public.contractor_intelligence
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- market_benchmarks (cross-tenant, aggregated only, no PII)
-- ---------------------------------------------------------------------------

create table if not exists public.market_benchmarks (
  id uuid primary key default gen_random_uuid(),
  segment_key text unique not null,
  trade text,
  value_band text,
  region text,
  sample_size int,
  median_reply_lag_days numeric(5,2),
  reply_rate_pct numeric(5,2),
  win_rate_pct numeric(5,2),
  best_framework text,
  best_hour int,
  best_day int,
  computed_at timestamptz default now()
);

alter table public.market_benchmarks enable row level security;

drop policy if exists "benchmarks_select_authenticated" on public.market_benchmarks;
create policy "benchmarks_select_authenticated"
  on public.market_benchmarks for select
  to authenticated
  using (true);
