-- Homeowner Message Engine v2
-- Adds optional project_type support to quotes.
-- This is backward-compatible because project_type is nullable.

BEGIN;

ALTER TABLE IF EXISTS public.quotes
ADD COLUMN IF NOT EXISTS project_type text;

COMMENT ON COLUMN public.quotes.project_type IS
'Optional project type/noun used for homeowner-facing messages, e.g. driveway, patio, slab, repair, roof, HVAC replacement.';

COMMIT;
