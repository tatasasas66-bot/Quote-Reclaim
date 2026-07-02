# 06 — Analytics + Learning Loop

Truth over vanity: opens are not tracked (off for deliverability), so the
funnel is measured on **replies and audit landings** — both of which are
real. Every number below is computable from tables that already exist
(`marketing_leads`, `marketing_runs`, `audit_events`, Paddle webhook
events) plus PostHog (already integrated, free tier).

## Event schema

| Event | Source | Properties |
|---|---|---|
| `lead_ingested` | orchestrator | campaign, source (apify/roc/website), city, trade |
| `lead_scored` | scoring | score, tier, breakdown |
| `lead_verified` | verifier | status, provider |
| `lead_uploaded` | export/upload | campaign, batch_id |
| `email_sent` (per step) | Smartlead campaign stats (weekly manual pull on Base; API later) | step, variant |
| `email_bounced` | reply poller (mailer-daemon) | step |
| `reply_received` | reply-webhook | classification, confidence |
| `audit_viewed` | /audit page + `?c=` | c-code → campaign/step, PostHog session |
| `audit_started` | first field input | c-code |
| `audit_completed` | result rendered | c-code, total quiet value entered |
| `signup` | Supabase auth | attribution c-code (persisted from first touch — localStorage + audit_events join) |
| `subscription_activated` | Paddle webhook (exists) | price, c-code |
| `unsubscribe` / `complaint` | classifier / Postmaster | campaign |

## Full-funnel metrics (the Monday numbers)

leads found → websites found → emails found → **valid emails** → uploaded
→ sent (e1..e4) → bounces → replies (+/-) → **audit visits** → audit
starts → **audit completions** → signups → **paid** → unsubscribes →
complaints → domain health (Postmaster spam rate, warmup placement) →
winning subject / niche / city.

Healthy-by-send-#300 benchmarks: bounce <2% · reply ≥2% · positive ≥25%
of replies · click→audit ≥2.5% of sends · audit completion ≥40% of starts
· complaint 0.

## Dashboard — `/admin/growth` (build prompt #4)

Single page, four blocks, server-rendered from Supabase:
1. **Funnel this week vs last** (the table above, two columns, deltas)
2. **Pipeline inventory**: leads by tier × verification status × campaign
   (answers: "can we feed next week's sends?")
3. **Experiments**: live A/B arms with counts + significance-ish verdict
   (2-proportion z at 90% — directional is enough at this volume)
4. **Circuit-breaker status**: bounce %, complaint count, warmup health,
   spam rate — green/amber/red per campaign + domain

## Weekly report (auto-emailed Monday 06:00 Phoenix; markdown)

```
QUOTE RECLAIM GROWTH — WEEK <n> (<dates>)

WHAT HAPPENED
sends <n> (Δ) · replies <n> (<x>%) · positive <n> · audit visits <n>
· completions <n> · signups <n> · PAID <n> · MRR $<n>
bounces <x>% · complaints <n> · domain health <green/amber/red>

WHY IT HAPPENED
- <top variant + its numbers>
- <biggest funnel leak: stage with worst week-over-week conversion>
- <breaker events, if any, and root cause>

STOP DOING
- <lowest-performing variant/city/tier — auto-nominated: worst arm with ≥100 sends>

DOUBLE DOWN
- <best arm ≥100 sends → gets 70% of next week's volume>

NEXT 100 LEADS
- <auto-selected: highest-tier unverified/un-uploaded batch + the Apify
  queries to run to refill>

NEXT COPY TEST
- <next row of the A/B matrix in 03-cold-email.md>

NEXT NICHE/CITY TEST
- <status of painter/fence experiments + go/no-go per decision rules>

DECISIONS REQUIRED (pick one, reply with the letter)
A) <pre-computed recommended action>
B) <alternative>
C) do nothing (defensible only if all breakers green)
```

Generation: GH Action → `NEW` endpoint queries Supabase, Groq (free)
writes the two "why" bullets from the numbers, Resend (existing key)
emails it. Founder workload: read + reply one letter.

## Decision rules (mechanical — the report applies them, founder ratifies)

| Condition | Decision |
|---|---|
| Variant ≥100 sends and reply+click < half of the other arm | Kill loser, promote winner to 100% |
| Reply ≥2% AND audit completion ≥40% of starts | Market responding → follow ramp table up |
| <0.5% reply after 200 sends, seed test still inboxes | Copy problem → swap to next Email-1 variant, re-test |
| Seed test fails (spam placement) | Deliverability problem → stop sends, fix per 05, do NOT touch copy |
| 800 concrete sends, ≥20 audit visits, 0 signups | **Audit page is leaking**, not the niche — fix /audit conversion before pivoting niche |
| 800 concrete sends, <10 audit visits, reply <1% | Niche/message mismatch → activate fence campaign (backup), keep concrete at trickle |
| Painter batch ≥ concrete on completions/100 sends | Month-2 mix shifts 50/50 concrete/painter |
| Any week with 2+ breaker trips | Freeze scale; that week is remediation-only |
| First paid customer | Double lead sourcing for that exact niche+city; ask (templated email) for a testimonial + which message they'd never have sent themselves |

## PostHog specifics (already in the app)

- Autocapture stays on; add explicit `audit_completed` event with the
  entered totals (no PII — amounts + days only, consistent with the
  product's no-names promise).
- Funnel insight: `audit_viewed (c-code set)` → `audit_completed` →
  `signup` → `subscription_activated`, broken down by `c` prefix
  (pc1/pp1/pf1) = niche scoreboard, by suffix (e1..e4) = which email in
  the sequence actually sells. This single breakdown answers "winning
  niche / winning message" with zero extra tooling.
