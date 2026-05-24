-- Phase 1.3 — Backfill existing pending quotes with normalized values.
-- Skips won/closed quotes to avoid touching historical records.
-- Idempotent: re-running has no effect on already-normalized rows.
--
-- INITCAP capitalizes the first letter of each whitespace-separated token.
-- It does NOT preserve hyphenated names like "Mary-Jane" (becomes
-- "Mary-jane"). Edit those by hand after running if needed.

update public.quotes
   set client_name = initcap(lower(client_name)),
       trade = case
         when upper(trade) = 'HVAC' then 'HVAC'
         else initcap(lower(trade))
       end,
       city = case
         when city is null then city
         else initcap(lower(city))
       end,
       state = case
         when state is null then state
         else upper(left(trim(state), 2))
       end
 where outcome = 'pending';
