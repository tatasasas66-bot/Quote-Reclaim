# 07 — Launch Plan: First 7 Days + 30-Day Operating Plan

Hard truth stated once: a fresh domain cannot send real cold volume in
week 1. The plan front-loads everything that isn't sending, so that when
the domain is ready on day 10, nothing else is the bottleneck. "Day 1:
first sends" happens — as the seed test + warmup, which is what protects
the next 500 sends.

## Day 0 (setup day — ~3 focused hours, the biggest manual day)

- [ ] Fix $49/$79 mismatch; verify Paddle checkout end-to-end in prod
- [ ] Buy outbound domain; set 301; buy Workspace ×2
- [ ] DNS: SPF, DKIM 2048, DMARC p=none, Postmaster Tools — all green
- [ ] Smartlead Base: connect mailboxes, warmup ON (both), create 3
      campaigns (concrete-EV, concrete-WV, fence-reserve) with sequence
      v2, schedule Mon–Fri 07:30–10:30 Phoenix, daily cap 5, **paused**
- [ ] MillionVerifier: buy 10k, set env vars
- [ ] Set `COMPLIANCE_POSTAL_ADDRESS`, `MARKETING_AUTOMATION_*`,
      `REPLY_WEBHOOK_SECRET`, `ADMIN_USER_IDS` in Vercel
- [ ] GH Actions secrets set; trigger `marketing-cron.yml` manually in
      dry-run; confirm a `marketing_runs` row appears
- [ ] Suppression seed: add own emails + any known opt-outs

## Day 1

- [ ] First Apify batch: 5 East Valley concrete queries × 300 cap
- [ ] Download AZ ROC posting list; run cross-reference import
- [ ] Verify DNS again (propagation), run mail-tester with real Email 1
      body from the real mailbox: require ≥9/10

## Days 2–3

- [ ] Scoring queue review in `/admin/auto-marketing` (~30 min once):
      spot-check 30 A-tier leads — are they actually owner-operator
      concrete guys? Tune exclusion list if franchise junk got through
- [ ] Verification pass runs nightly; target ≥150 `valid` A/B-tier
- [ ] West Valley Apify batch
- [ ] Set up Gmail poller creds (read-only scope, both boxes)

## Days 4–7

- [ ] Warmup health check daily (10 sec: Smartlead dashboard) — expect
      >90% inbox by day 7–9
- [ ] Export first CSV (50 A-tier, `valid`-only) → upload to
      concrete-EV campaign, keep paused
- [ ] Day 6–7: painter + fence Apify batches (inventory for weeks 3–4)
- [ ] Dry-run the weekly report once; confirm the funnel numbers render

## Day 9 — seed test

Send Email 1 to 5–8 friendly seeds across Gmail/Outlook/Yahoo from both
mailboxes. Gate: 100% Gmail inbox (Promotions acceptable), auth passes.
Fail → `05-deliverability.md` remediation, launch slips — do NOT send
cold on a failing seed test.

## Days 10–14 — first real sends

- Unpause concrete-EV at **5/mailbox/day = 10/day** (A-tier only)
- Reply poller live: classifications land, drafts queue up
- Founder daily workload: ~5 min (approve escalated drafts)
- Expected by day 14: ~40–50 sends, 1–3 replies, 1–3 audit visits,
  first PLAYBOOK keyword reply if e3 reached anyone (it hasn't yet — the
  sequence is only at step 1–2; that's fine)

**7-day objective (measured day 10):** infra green · warmup >90% · 400+
scored leads · 150+ verified · seed test passed · first 10 real sends out.

## 30-day operating plan

| Week | Real sends/day | New leads/week | Tests | Gate to advance |
|---|---:|---:|---|---|
| 1 (d0–7) | 0 | 400–600 sourced | seed test | DNS+warmup green |
| 2 (d8–14) | 10 | 150 | — | 0 breaker trips, ≥1 reply |
| 3 (d15–21) | 20 | 150 | T1 subject A/B; painter batch (pp1) 10/day carve-out | bounce <2%, complaint 0 |
| 4 (d22–28) | 30–40 | 200 | T2 short-vs-long; East vs West (T3) read | reply ≥1.5% |
| 5+ | 50 cap | 200 | T4 niche verdict; 6-email decision; fence activation if triggered | breakers green 14 straight days |

Cumulative by day 30: **≈600–750 sends** (sequence emails included),
~350–450 leads enrolled.

### When to change what (mechanical, from 06-analytics)

- **Change subject/copy**: variant loses at ≥100 sends/arm, or global
  reply <0.5% at 200 sends with passing seed test.
- **Change niche**: 800 sends + <10 audit visits + reply <1% → fence
  becomes primary. (Painter experiment may pre-empt this with data.)
- **Change offer/page, not niche**: replies and visits fine but 0
  signups at ≥20 completions → the audit→signup step is the leak; run
  the audit-page CTA experiment (top-3 growth idea #1) before touching
  the niche.
- **Pause**: any breaker in `05-deliverability.md` — automatic.
- **Scale** (add domain #2, 2 mailboxes, +$15/mo): only when ALL of:
  breakers green 14 days · reply ≥2% · lead inventory ≥3 weeks · founder
  weekly time still <30 min. Scaling a broken machine just burns leads.

### Days 30–60 preview (so decisions today don't box us in)

Winner niche gets 70% volume; Tucson cloned for the winner (same
sequences, new c-codes); HVAC list build starts ~Aug 20 for a Sept 1
launch (`ph1`); MV credits refill (~$37); consider Smartlead Pro only
if ≥3 paying customers (then the built API push makes uploads
zero-touch).

## Success targets + realistic forecast

| Milestone | Best case | Realistic | Bad case |
|---|---|---|---|
| First audit completion | day 11–12 | day 12–16 | day 20+ |
| First reply | day 10–11 | day 11–15 | none by d18 → breaker/copy check |
| First signup | day 14–18 | day 18–30 | none by d35 → audit-page leak protocol |
| **First paid ($79)** | **day 18–25** | **day 30–50** | none by d60 → niche pivot already triggered at d~40 |
| Month-1 paid users | 2–3 | 0–1 | 0 |
| Month-2 paid users | 5–8 | 2–4 | 0–1 |

What makes failure likely (ranked): (1) skipping warmup/seed gates to
"go faster", (2) audit page converting visits but signup wall killing
momentum — watch completion→signup, (3) 5-suburb targeting shrinking the
list until tests can't conclude, (4) founder editing copy mid-test,
(5) treating Promotions-tab placement as an emergency and adding
images/links/tracking in a panic.

The market-is-responding metric: **reply rate ≥2% with ≥25% of replies
positive/curious by send #300.** If that holds, first paid is a matter of
weeks and volume. If it doesn't hold by send #500 across two copy
variants and two niches — the wedge is wrong, and the honest move is the
September HVAC cohort with the same machine (sunk cost: ~$180, one
quarter of one lead-gen month's spend for a single contractor).
