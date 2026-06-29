-- Allow the sixth and final Day 60 recovery reminder.
-- Production inspection confirmed this exact named constraint still allowed
-- only followup_number values 1 through 5.

begin;

alter table public.reminders
  drop constraint if exists reminders_followup_number_check;

alter table public.reminders
  add constraint reminders_followup_number_check
  check (followup_number in (1, 2, 3, 4, 5, 6));

commit;
