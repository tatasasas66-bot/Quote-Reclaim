# 02 — Niche Decision + Lead Sourcing Blueprint

## Niche scoring matrix (1–5 per factor, higher = better for THIS product
under FULL-AUTO cold email in July, Phoenix)

| Factor | Concrete/driveway | Fence | Painter | HVAC repl. | Roofer | Remodeler | Landscaper | Plumber |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Pain intensity (silent estimates) | 5 | 4 | 4 | 5 | 5 | 5 | 3 | 2 |
| Estimates sent / month | 4 | 4 | 5 | 3 | 4 | 2 | 4 | 2 |
| Average job value | 4 | 3 | 2 | 5 | 5 | 5 | 3 | 2 |
| Likelihood of silent estimates | 5 | 4 | 4 | 4 | 5 | 5 | 4 | 2 |
| Understands Quote Reclaim in 10 sec | 5 | 5 | 5 | 4 | 4 | 3 | 4 | 3 |
| Public contact data availability | 4 | 4 | 5 | 4 | 4 | 3 | 4 | 4 |
| Owner-operated, email-reachable | 5 | 5 | 5 | 3 | 3 | 4 | 4 | 3 |
| Urgency NOW (July, Phoenix) | 4 (slow pour season → hungry) | 4 | 3 | **1** (peak slam) | 2 (monsoon chasing) | 3 | 2 (heat dormancy) | 2 |
| Low outreach noise (inverse of SaaS spam) | 4 | 5 | 4 | 2 | **1** | 3 | 4 | 3 |
| Conversion probability at $79 | 4 | 4 | 3 | 4 | 3 | 4 | 3 | 2 |
| First-customer speed | 4 | 4 | 4 | 2 | 2 | 2 | 3 | 2 |
| **Total /55** | **48** | **46** | **44** | 37 | 38 | 39 | 38 | 27 |

**Verdict — not polite:** your trade pick was right; your geography was
wrong. Concrete wins, but *five suburbs* of concrete contractors is a
~150–300 sendable-email universe — you'd exhaust it before the A/B test
reaches significance. Run the **whole Phoenix metro** as two sub-campaigns
(East/West Valley — this preserves your suburb thesis as an experiment
inside a viable universe). The old internal plan
(`BOOTSTRAP_LAUNCH_PLAN.md`) ranked roofing #1 — that ranking was for
founder-led phone/DM outreach; under full-auto cold email, roofing's inbox
saturation flips it to a reject.

- **Primary:** Concrete & driveway (incl. "concrete patio", "stamped
  concrete", "concrete pavers") — Phoenix metro
- **Backup:** Fence contractors — Phoenix metro (activate week 4 or on
  pivot trigger)
- **Experimental:** Residential painters — East Valley only, 150-lead
  batch (week 3)
- **Scheduled for September:** HVAC replacement (summer replacement quotes
  go quiet exactly when season slows — pre-build the list in August)

## Geographic clusters

**Cluster 1 — East Valley:** Mesa, Gilbert, Chandler, Tempe, Queen Creek,
Apache Junction, San Tan Valley.
Why: densest concentration of owner-operator flatwork contractors in the
metro; heavy new-build + backyard remodel demand; homeowner population
that collects 3 bids.

**Cluster 2 — West Valley:** Peoria, Surprise, Glendale, Goodyear,
Avondale, Buckeye, Litchfield Park.
Why: fastest-growing suburbs in the US (Buckeye/Surprise), huge new-slab
and driveway-extension volume, thinner contractor supply → busier
contractors with more unworked quotes.

Realistic production per cluster per week (Apify 300-place run + ROC
cross-ref + website email scrape): **60–120 new sendable leads/week**,
declining as the metro saturates (~week 6–8). Expansion order after
Phoenix: Tucson → Las Vegas → San Antonio/DFW (same climate logic, fence
niche transfers cleanly to DFW).

## Exact search queries (Apify `search_query`, one campaign row each)

Concrete East Valley (rotate one per nightly run):
- `concrete contractor Mesa AZ`
- `concrete driveway contractor Gilbert AZ`
- `stamped concrete Chandler AZ`
- `concrete patio contractor Queen Creek AZ`
- `concrete company Tempe AZ`

Concrete West Valley:
- `concrete contractor Peoria AZ`
- `concrete driveway Surprise AZ`
- `concrete contractor Goodyear AZ`
- `concrete flatwork Buckeye AZ`
- `concrete patio Glendale AZ`

Fence (reserve): `fence company Mesa AZ`, `fence installation Peoria AZ`,
`fence contractor Gilbert AZ`, `wood fence Surprise AZ`.

Painters (experiment): `house painter Mesa AZ`, `residential painting
Gilbert AZ`, `exterior painting Chandler AZ`.

Apify settings: max 300 places/run, include website + phone; skip the
paid contact-details add-on (we scrape emails ourselves); free $5 credit
≈ 1,000+ places/month — enough.

## AZ ROC posting list (the free unfair data layer)

roc.az.gov/posting-list publishes every licensed AZ contractor:
business name, license number, **classification**, city, status, and the
**qualifying party's name** (a real human first name = honest
personalization token that Apollo can't sell you).

Workflow (build prompt #2):
1. Download posting list (refresh monthly).
2. Filter classifications: concrete/flatwork classes (verify exact codes
   on the list itself — e.g. CR-9/R-9 style concrete classes), fence
   classes for the backup niche.
3. Join to `marketing_leads` on normalized business name + city:
   - match → `roc_status=active`, fill `first_name` from qualifying party
   - Apify lead with NO active license → score −15 (bottom-feeder risk)
   - ROC row with no Apify match → seed lead (find website via Places
     text search, then email scrape)
4. Never mention their license in outreach (surveillance vibe). Use it
   only for scoring + first names.

## Email finding (free, own scraper — build prompt #2)

For each lead with a website and no email:
fetch `/`, `/contact`, `/contact-us`, `/about` → regex `mailto:` +
visible emails → prefer named@domain > info@domain > gmail/hotmail
addresses printed on the site (solo concrete guys often run on Gmail —
those are FINE and often the owner's actual inbox) → dedupe → verify.
No LinkedIn scraping, no guessed permutations beyond `info@domain`
(one guess max, verifier decides).

## Lead scoring model (extends existing `scoring.ts`, tiers unchanged)

| Signal | Points |
|---|---:|
| Trade fit: concrete/driveway 30 · fence 22 · painting 18 · hvac 16 · roofing 15 (existing) | +30 max |
| Email quality: named/owner mailbox +20 · info@/office@ +10 · none 0 → rejected (existing) | +20 |
| Reviews: 10–100 +15 · 101–300 +8 · <10 +2 · >300 +3 (existing — big shops have office managers and CRMs) | +15 |
| Website exists +10 (existing) | +10 |
| "free estimate/quote" language +10 (existing) | +10 |
| Sun-belt seasonality +10 (existing) | +10 |
| Owner-operator signal (first name known) +8 (existing) | +8 |
| Ticket size: high +8 / mid +6 (existing) | +8 |
| `NEW` ROC active license +5; Apify-found but NO active ROC license −15 | ±15 |
| `NEW` Franchise/agency markers (see exclusions) | −40 |
| `NEW` Rating < 3.8 with ≥20 reviews | −10 |

Tiers: **A ≥70 → send first** · **B 50–69 → send after A-tier exhausts,
or when a copy variant needs volume** · **C <50 → never send**.

## Exclusion rules (hard, pre-verification)

- Franchise brands: anything matching e.g. `Concrete Craft`, `Ecoscape`,
  `Mr. Handyman`, `California Closets`-style national marks; domain
  contains `/locations/` or `franchise`
- Commercial-only: name/site contains `commercial`, `industrial`,
  `civil`, `paving company` (road pavers ≠ driveway guys), `ready mix`,
  `supply`, `materials`
- Lead-gen farms / agency-run: site is a single-page lead form with call
  tracking number, no license number, stock photos, domain age < 6 months,
  or the "website" is an Angi/Thumbtack/HomeAdvisor profile URL
- Aggregators & directories: yelp.com, angi.com, thumbtack.com, porch,
  houzz, facebook.com as the website field → route to website-discovery,
  not to email scrape
- No active ROC license AND no reviews → drop (unreachable/ghost)
- Out-of-state area code AND out-of-metro address → drop
- Anyone already in `suppression_list`, any existing user's domain
