-- 015_full_auto_marketing.sql
-- Service-role-only marketing automation data. This migration is additive and
-- does not modify customer quotes, reminders, auth, billing, or email delivery.

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  trade text not null,
  city text not null,
  search_query text not null,
  apify_actor_id text,
  smartlead_campaign_id text,
  daily_cap integer not null default 10 check (daily_cap between 1 and 15),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'stopped')),
  mode text not null default 'dry_run'
    check (mode in ('dry_run', 'live')),
  sequence_config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  source text not null default 'apify',
  apify_run_id text,
  apify_dataset_id text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  leads_found integer not null default 0,
  websites_found integer not null default 0,
  emails_found integer not null default 0,
  valid_emails integer not null default 0,
  uploaded_to_smartlead integer not null default 0,
  skipped_no_email integer not null default 0,
  skipped_duplicates integer not null default 0,
  skipped_invalid integer not null default 0,
  skipped_risky integer not null default 0,
  skipped_unknown integer not null default 0,
  skipped_suppressed integer not null default 0,
  cost_estimate numeric(10, 4),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  company_name text not null,
  first_name text,
  trade text not null,
  city text not null,
  website text,
  website_domain text,
  email text,
  phone text,
  address text,
  google_maps_url text,
  source text not null default 'apify',
  source_place_id text,
  apify_run_id text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'valid', 'invalid', 'risky', 'unknown')),
  verification_detail text,
  smartlead_lead_id text,
  smartlead_status text,
  reply_status text not null default 'none'
    check (reply_status in ('none', 'replied', 'positive', 'negative', 'bounced', 'unsubscribed')),
  suppressed boolean not null default false,
  suppression_reason text,
  audit_url text not null,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  reason text not null,
  source text not null,
  created_at timestamptz not null default now(),
  check (email is not null or domain is not null)
);

create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.marketing_leads(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_campaigns_status
  on public.marketing_campaigns(status);
create index if not exists idx_marketing_runs_campaign_created
  on public.marketing_runs(campaign_id, created_at desc);
create index if not exists idx_marketing_leads_campaign
  on public.marketing_leads(campaign_id);
create index if not exists idx_marketing_leads_verification
  on public.marketing_leads(campaign_id, verification_status);
create index if not exists idx_marketing_leads_smartlead
  on public.marketing_leads(campaign_id, smartlead_status);
create unique index if not exists uq_marketing_leads_email
  on public.marketing_leads(lower(email))
  where email is not null;
create unique index if not exists uq_marketing_leads_domain
  on public.marketing_leads(lower(website_domain))
  where website_domain is not null;
create unique index if not exists uq_marketing_leads_source_place
  on public.marketing_leads(source_place_id)
  where source_place_id is not null;
create unique index if not exists uq_marketing_suppression_email
  on public.marketing_suppression_list(lower(email))
  where email is not null;
create unique index if not exists uq_marketing_suppression_domain
  on public.marketing_suppression_list(lower(domain))
  where domain is not null;
create index if not exists idx_marketing_events_campaign_created
  on public.marketing_events(campaign_id, created_at desc);

alter table public.marketing_campaigns enable row level security;
alter table public.marketing_runs enable row level security;
alter table public.marketing_leads enable row level security;
alter table public.marketing_suppression_list enable row level security;
alter table public.marketing_events enable row level security;

revoke all on table public.marketing_campaigns from anon, authenticated;
revoke all on table public.marketing_runs from anon, authenticated;
revoke all on table public.marketing_leads from anon, authenticated;
revoke all on table public.marketing_suppression_list from anon, authenticated;
revoke all on table public.marketing_events from anon, authenticated;

grant all on table public.marketing_campaigns to service_role;
grant all on table public.marketing_runs to service_role;
grant all on table public.marketing_leads to service_role;
grant all on table public.marketing_suppression_list to service_role;
grant all on table public.marketing_events to service_role;
