# Production Cleanup — Optional SQL

Legacy quote rows created before the title-case + state validation work may
display with mixed casing. The application now normalizes new and edited
quotes at write time, and renders defensively, so this is **cosmetic only**.
Run the SQL below only if you want stored data to match the canonical form.

**Do not run automatically.** Review each statement, run in a transaction,
verify on a small subset first.

---

## 1. Title-case `client_name`, `trade`, `city` on pending quotes

```sql
BEGIN;

-- Preview affected rows first (read-only).
SELECT id, client_name, trade, city, state
FROM public.quotes
WHERE outcome = 'pending'
  AND (
    client_name <> initcap(lower(client_name))
    OR trade <> initcap(lower(trade))
    OR (city IS NOT NULL AND city <> initcap(lower(city)))
    OR (state IS NOT NULL AND state <> upper(trim(state)))
  )
LIMIT 50;

-- Apply.
UPDATE public.quotes
   SET client_name = initcap(lower(client_name)),
       trade       = initcap(lower(trade)),
       city        = CASE WHEN city  IS NULL THEN city  ELSE initcap(lower(city)) END,
       state       = CASE WHEN state IS NULL THEN state ELSE upper(left(trim(state), 2)) END
 WHERE outcome = 'pending';

COMMIT;
```

Notes:
- `INITCAP` capitalizes the first letter of each whitespace-separated token.
  It does NOT preserve hyphenated names like "Mary-Jane" — they become
  "Mary-jane". Inspect output and patch the small handful by hand if needed.
- Excludes `outcome = 'won'` / `closed` to avoid touching historical records.

---

## 2. Replace invalid state codes with NULL

A few legacy rows may contain free-text typos like `"taxes"` or full state
names. Set them to NULL so the dashboard renders cleanly; the contractor
can re-edit when they come back to the quote.

```sql
BEGIN;

-- Preview.
SELECT id, client_name, state
FROM public.quotes
WHERE state IS NOT NULL
  AND state NOT IN (
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL',
    'IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE',
    'NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
    'TN','TX','UT','VT','VA','WA','WV','WI','WY'
  );

-- Apply.
UPDATE public.quotes
   SET state = NULL
 WHERE state IS NOT NULL
   AND state NOT IN (
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL',
    'IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE',
    'NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
    'TN','TX','UT','VT','VA','WA','WV','WI','WY'
   );

COMMIT;
```

---

## 3. Normalize legacy trades to the locked enum

The current schema accepts only six trade values. Legacy rows with
"roofing" (lowercase) will display fine because the dashboard title-cases
on render, but stored values like "general contractor" should map to
"General Contracting" to match the dropdown.

```sql
BEGIN;

-- Preview anything outside the locked enum.
SELECT id, trade, COUNT(*) AS n
FROM public.quotes
WHERE trade NOT IN (
  'Roofing','HVAC','Plumbing','Electrical','Remodeling','General Contracting'
)
GROUP BY id, trade;

-- Map by hand based on what shows up. Example:
UPDATE public.quotes SET trade = 'General Contracting'
 WHERE lower(trade) IN ('general contractor','general contracting','gc');
UPDATE public.quotes SET trade = 'HVAC'
 WHERE lower(trade) IN ('hvac','heating','cooling','heating and cooling','ac','furnace');
UPDATE public.quotes SET trade = 'Roofing'
 WHERE lower(trade) IN ('roof','roofing');

COMMIT;
```

Anything still outside the enum after these mappings needs a product
decision — pick the closest enum value or close the quote.
