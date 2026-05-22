-- 003_indexes_and_views.sql
-- Cross-table views. Intentionally exposes only masked / aggregated data.

-- Public leaderboard: masked emails + aggregate recovery totals.
-- security_invoker = true forces RLS on the underlying profiles table to apply.
-- Profiles RLS only allows row owners to read their row, so a direct
-- SELECT through this view from anon would return zero rows. The leaderboard
-- read path should call a SECURITY DEFINER RPC (added in a later phase) once
-- public.profiles has an explicit opt-in policy for leaderboard inclusion.
-- The view is staged here so that opt-in policies can attach to it later.
create or replace view public.leaderboard_v1
with (security_invoker = true) as
select
  case
    when length(p.email) > 0 then
      substring(p.email from 1 for 1) || '***@' || split_part(p.email, '@', 2)
    else 'anon'
  end as masked_email,
  p.jobs_won,
  p.recovered_amount,
  p.state
from public.profiles p
where p.recovered_amount > 0
order by p.recovered_amount desc
limit 100;

grant select on public.leaderboard_v1 to authenticated, anon;
