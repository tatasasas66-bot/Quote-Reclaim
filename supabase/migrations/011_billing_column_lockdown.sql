-- 011_billing_column_lockdown.sql
-- Fix LAUNCH BLOCKER: previously the `profiles_update_own` RLS policy let any
-- authenticated user UPDATE their own row, with no column-level restriction.
-- A user could PATCH /rest/v1/profiles?id=eq.SELF { "is_paid": true } and
-- instantly unlock paid features for free.
--
-- Postgres has no column-level RLS, so this trigger fills the gap: any UPDATE
-- on public.profiles that would change a billing/usage column is rejected
-- unless the caller is the service_role (used by any future billing-provider
-- webhook route under /api/webhooks/<provider>) or the function owner (used
-- by the security-definer public.check_and_increment_usage RPC). All other
-- roles — authenticated and anon — cannot mutate billing state via the REST
-- layer.
--
-- Additive only: NO schema changes, NO column changes, NO policy edits.
-- Just one function + one trigger.

create or replace function public.guard_billing_columns_on_profiles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Allow when running under service_role (webhook) or as the function owner
  -- (security-definer RPCs like check_and_increment_usage and mark_quote_won
  -- whose own bodies legitimately update these columns).
  --
  -- The two "outside" Supabase Postgres roles are `authenticated` and `anon`.
  -- Anything else (service_role, postgres, supabase_admin, the RPC owner) is
  -- a trusted backend caller.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.is_paid is distinct from old.is_paid
     or new.usage_count is distinct from old.usage_count
     or new.jobs_won is distinct from old.jobs_won
     or new.recovered_amount is distinct from old.recovered_amount then
    raise exception
      'permission denied: billing and usage columns are managed server-side only'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_billing_columns_on_profiles() from public;

drop trigger if exists trg_guard_billing_columns on public.profiles;
create trigger trg_guard_billing_columns
  before update on public.profiles
  for each row
  execute function public.guard_billing_columns_on_profiles();
