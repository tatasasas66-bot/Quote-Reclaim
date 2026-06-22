-- 013_auto_marketing.sql
-- Full Auto Marketing engine — internal admin acquisition system.
-- Tracks contractor leads, campaigns, replies, suppression, and anonymous
-- /audit attribution. Additive only: no edits to existing tables.
--
-- All tables RLS-enabled. Admin access is gated in the app layer via
-- requireAdmin() (env allowlist ADMIN_USER_IDS) using the service client.
-- No public RLS policy grants access — these tables are service-role only.

-- ---------------------------------------------------------------------------
-- auto_marketing_campaigns — outreach campaign definitions
-- ---------------------------------------------------------------------------

create table if not exists public.auto_marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  trade text not null,
  city text,
  subject text not null,
  email_variant text not null,
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_amc_status on public.auto_marketing_campaigns(status);

alter table public.auto_marketing_campaigns enable row level security;
-- No policies — service-role access only. App layer enforces admin guard.

-- ---------------------------------------------------------------------------
-- auto_marketing_leads — imported contractor leads with score + status
-- ---------------------------------------------------------------------------

create table if not exists public.auto_marketing_leads (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  first_name text,
  email text,
  phone text,
  website text,
  city text,
  state text,
  trade text not null,
  niche text,
  source text,
  gbp_url text,
  review_count integer,
  review_response_rate numeric,
  public_signal text,
  last_gbp_post date,
  license_status text,
  notes text,
  score integer not null default 0,
  status text not null default 'rejected' check (status in ('approved','review','rejected','suppressed')),
  sendable boolean not null default false,
  campaign_id uuid references public.auto_marketing_campaigns(id) on delete set null,
  smartlead_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  suppressed_at timestamptz,
  suppressed_reason text
);

create index if not exists idx_aml_status on public.auto_marketing_leads(status);
create index if not exists idx_aml_score on public.auto_marketing_leads(score desc);
create index if not exists idx_aml_trade_city on public.auto_marketing_leads(trade, city);
create index if not exists idx_aml_email on public.auto_marketing_leads(email);

alter table public.auto_marketing_leads enable row level security;
-- No policies — service-role access only.

-- ---------------------------------------------------------------------------
-- auto_marketing_replies — inbound reply classification + safe drafts
-- ---------------------------------------------------------------------------

create table if not exists public.auto_marketing_replies (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.auto_marketing_leads(id) on delete cascade,
  email text,
  reply_body text,
  reply_date timestamptz not null default now(),
  classification text not null check (classification in (
    'interested','asks_price','asks_how_it_works','lead_gen_confusion',
    'existing_crm_objection','not_interested','unsubscribe','angry',
    'wrong_person','low_confidence'
  )),
  confidence numeric not null default 1.0,
  action_taken text not null default 'none',
  draft_reply text,
  draft_approved boolean not null default false,
  draft_sent boolean not null default false
);

create index if not exists idx_amr_lead on public.auto_marketing_replies(lead_id);
create index if not exists idx_amr_classification on public.auto_marketing_replies(classification);

alter table public.auto_marketing_replies enable row level security;

-- ---------------------------------------------------------------------------
-- auto_marketing_events — funnel tracking (send, audit_visit, signup, paid)
-- ---------------------------------------------------------------------------

create table if not exists public.auto_marketing_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.auto_marketing_leads(id) on delete cascade,
  campaign_id uuid references public.auto_marketing_campaigns(id) on delete set null,
  event_type text not null check (event_type in (
    'email_queued','email_sent','reply_received','audit_visit',
    'audit_completed','signup_started','checkout_started','paid_customer'
  )),
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ame_type on public.auto_marketing_events(event_type);
create index if not exists idx_ame_lead on public.auto_marketing_events(lead_id);
create index if not exists idx_ame_campaign on public.auto_marketing_events(campaign_id);

alter table public.auto_marketing_events enable row level security;

-- ---------------------------------------------------------------------------
-- auto_marketing_suppression — permanent DNC list
-- ---------------------------------------------------------------------------

create table if not exists public.auto_marketing_suppression (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.auto_marketing_leads(id) on delete cascade,
  email text not null,
  reason text not null,
  source_reply_id uuid references public.auto_marketing_replies(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ams_email on public.auto_marketing_suppression(email);

alter table public.auto_marketing_suppression enable row level security;

-- ---------------------------------------------------------------------------
-- audit_attribution_events — anonymous /audit funnel tracking (NO PII)
-- ---------------------------------------------------------------------------
-- Stores only UTM params, bucketed value, visitor hash (sha256 of IP+salt,
-- truncated). Never stores homeowner names, emails, phones, or raw amounts.

create table if not exists public.audit_attribution_events (
  id uuid primary key default gen_random_uuid(),
  utm_source text,
  utm_campaign text,
  utm_trade text,
  utm_city text,
  visitor_hash text,
  audit_started boolean not null default false,
  audit_completed boolean not null default false,
  total_quiet_value_bucket text,
  top_recovery_window text,
  cta_clicked boolean not null default false,
  signup_started boolean not null default false,
  checkout_started boolean not null default false,
  paid_customer boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_aae_campaign on public.audit_attribution_events(utm_campaign);
create index if not exists idx_aae_created on public.audit_attribution_events(created_at desc);

alter table public.audit_attribution_events enable row level security;
