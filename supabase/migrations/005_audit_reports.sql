-- 005_audit_reports.sql
-- Silent Quote Audit growth wedge. Public reports keyed by a random token.

create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  contractor_email text not null,
  company_name text,
  quotes jsonb not null,
  total_silent numeric(12,2) not null,
  largest_quote_value numeric(10,2),
  oldest_days int,
  most_recoverable_index int,
  converted_to_signup boolean default false,
  converted_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_audits_token on public.audits(token);
create index if not exists idx_audits_email on public.audits(contractor_email);

alter table public.audits enable row level security;
-- No anon/authenticated policies.
-- The /audit/[token] page reads via the server role using the token as the
-- secret; the token URL is its own credential. Report pages render with
-- robots:noindex so the token URLs are not crawled.

-- Optional helper for verified server-side lookups by token. Use this from
-- server components so the read happens through a defined function rather
-- than ad-hoc service-role SELECTs scattered across the codebase.
create or replace function public.get_audit_by_token(p_token text)
returns public.audits
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from public.audits where token = p_token limit 1;
$$;

revoke execute on function public.get_audit_by_token(text) from public;
grant execute on function public.get_audit_by_token(text) to service_role;
