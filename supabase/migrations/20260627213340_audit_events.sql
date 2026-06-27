-- Product interaction ledger for the recovery habit loop and monthly report.
-- Additive only: no existing table, column, constraint, or policy is changed.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  event_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_user_created
  on public.audit_events(user_id, created_at desc);

create index if not exists idx_audit_events_quote_created
  on public.audit_events(quote_id, created_at desc)
  where quote_id is not null;

grant select, insert on public.audit_events to authenticated;
grant select, insert on public.audit_events to service_role;

alter table public.audit_events enable row level security;

create policy "audit_events_select_own"
  on public.audit_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "audit_events_insert_own"
  on public.audit_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);
