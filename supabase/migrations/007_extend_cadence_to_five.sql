-- 007_extend_cadence_to_five.sql
-- Extend the recovery cadence from 3 touches to 5 (Day 1, 3, 7, 14, 30).
--
-- The original CHECK on reminders.followup_number was inline-anonymous, which
-- Postgres auto-named "reminders_followup_number_check". We drop it by name
-- (if exists, so this is safe to re-run) and add an explicitly-named one that
-- accepts 1..5. No other column or index changes — the unique index
-- idx_reminders_unique_step(quote_id, followup_number) already supports any
-- distinct integer values per quote.

alter table public.reminders
  drop constraint if exists reminders_followup_number_check;

alter table public.reminders
  add constraint reminders_followup_number_check
  check (followup_number in (1, 2, 3, 4, 5));
