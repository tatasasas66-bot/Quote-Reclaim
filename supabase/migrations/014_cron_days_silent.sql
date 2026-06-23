-- 014_cron_days_silent.sql
-- Fix: return the REAL effective quiet age in claim_due_reminders, not just
-- now() - created_at (which is the app record creation time, not the original
-- estimate sent date).
--
-- The quotes table has:
--   quote_sent_at timestamptz  — when the contractor originally sent the estimate
--   days_silent int            — snapshot at insert/edit time (fallback)
--   created_at timestamptz     — when the Quote Reclaim record was created
--
-- Effective days quiet logic (matches src/lib/recovery/effective-days.ts):
--   If quote_sent_at exists: days between now() and quote_sent_at
--   If quote_sent_at is null: days_silent + days between now() and created_at
--     (the stored snapshot + elapsed time since the record was created)
--   If both are null/zero: 0

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
  client_name text,
  days_silent int
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
           select 1
           from public.outbound_messages om
           where om.quote_id = r2.quote_id
             and om.status = 'replied'
         )
       order by r2.send_at
       limit 200
       for update skip locked
     )
    returning r.id, r.quote_id, r.user_id, r.followup_number,
             r.message_type, r.message_text, r.framework_used,
             r.cta_type
  )
  select c.id as reminder_id,
         q.user_id,
         c.quote_id,
         c.followup_number,
         c.message_type,
         c.message_text,
         c.framework_used,
         c.cta_type,
         q.client_phone as recipient_phone,
         q.client_email as recipient_email,
         q.client_opted_out,
         q.trade,
         q.city,
         q.state,
         q.estimate_amount,
         q.sequence_id,
         q.client_name,
         -- Effective days quiet: matches src/lib/recovery/effective-days.ts
         -- If quote_sent_at exists: days between now and quote_sent_at
         -- If null: stored days_silent + days since app record creation
         case
           when q.quote_sent_at is not null then
             greatest(0, extract(day from now() - q.quote_sent_at)::int)
           else
             greatest(0, q.days_silent + extract(day from now() - q.created_at)::int)
         end as days_silent
  from claimed c
  join public.quotes q on q.id = c.quote_id;
end;
$$;

revoke all on function public.claim_due_reminders(uuid) from public;
grant execute on function public.claim_due_reminders(uuid) to service_role;
