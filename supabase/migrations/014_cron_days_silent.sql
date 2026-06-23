-- 014_cron_days_silent.sql
-- Add days_silent to the claim_due_reminders RPC return type so the cron
-- can generate age-aware messages at send time.
--
-- The RPC already joins quotes to reminders; we just need to expose
-- the quote's days_silent (computed from quote.created_at) in the return.
-- This is additive — no existing columns changed, no existing logic altered.

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
         greatest(0, extract(day from now() - q.created_at)::int) as days_silent
  from claimed c
  join public.quotes q on q.id = c.quote_id;
end;
$$;

revoke all on function public.claim_due_reminders(uuid) from public;
grant execute on function public.claim_due_reminders(uuid) to service_role;
