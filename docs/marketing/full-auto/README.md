# Quote Reclaim — Full-Auto Acquisition Machine ($100/mo)

> Written 2026-07-02. Supersedes `docs/marketing/BOOTSTRAP_LAUNCH_PLAN.md`
> (founder-led, manual outreach — explicitly rejected constraint now).
> This plan assumes: solo founder, weak-English-OK (system sells through
> copy + templates), zero daily manual prospecting, $100/month hard cap.

## The one-line answer

**With $100/month and full automation, the highest-probability path to the
first paying contractor is: cold email to residential concrete/driveway
contractors across the full Phoenix metro (not just 5 suburbs), sourced
free from Apify Google Maps + the AZ ROC public license list, verified
through MillionVerifier, sent through Smartlead Base from 2 warmed
mailboxes on a fresh secondary domain, with every email driving one click
to `/audit` — and the already-built pipeline in this repo
(scrape → score → verify → send → classify replies → suppress) doing the
work on a GitHub Actions cron.** First real cold sends: day 10–11 (warmup
is physics, not opinion). First paid contractor: realistically day 30–50.

## Executive decision

| Decision | Choice | Why |
|---|---|---|
| **Primary niche** | Residential concrete & driveway contractors | Highest trade-fit already coded (`scoring.ts` weights concrete=30), $4k–$20k tickets make the audit's "quiet quote value" number impressive, homeowners always collect 2–3 bids so silent estimates are structural, and concrete guys get ~10× less SaaS cold email than roofers/HVAC. |
| **Primary geography** | **Full Phoenix metro** (East Valley + West Valley sub-campaigns), not only Mesa/Chandler/Surprise/Peoria/Buckeye | ⚠️ **Your wedge is challenged on geography, not trade.** Five suburbs of concrete contractors ≈ 150–300 sendable emails — you'd exhaust it in 2 weeks and starve the A/B tests. The full metro gives 400–700 listings ≈ 250–400 sendable leads. The trade is right; the radius was too small for outbound math. |
| **Backup niche** | Fence contractors, Phoenix metro | Same estimate-heavy dynamics, $4k–$9k tickets, almost zero SaaS outreach noise, easy Maps sourcing. |
| **Experimental niche** | Residential painters, East Valley (150-lead batch) | Highest estimate volume per shop (10–30/mo) = most silent quotes; instant product comprehension; weaker $/quote wow-factor. Test cheap, learn fast. |
| **Rejected** | Roofers (most cold-emailed trade in home services — inbox war zone), HVAC-in-July (Phoenix peak season; owners are slammed, zero software-evaluation bandwidth — **revisit as the September niche**, when summer replacement quotes sit quiet), remodelers (few estimates/mo, long cycle), plumbers (emergency work, low estimate volume). |
| **Channel** | Cold email → one link → `/audit` | Only channel that is simultaneously: automatable, $0/lead, legal (CAN-SPAM B2B), and matched to how owner-operators actually communicate. Ads at $100/mo ≈ 30–60 clicks/mo of untargeted traffic — rejected. |
| **Stack** | Apify (free credit) + AZ ROC posting list (free) + MillionVerifier ($37/10k one-time) + Smartlead Base ($39) + Google Workspace ×2 ($14) + GitHub Actions cron (free) + Supabase/PostHog/Groq (free tiers) | Verified pricing July 2026. See budget below. |
| **7-day objective** | Infra live, DNS green, warmup running, 400+ scored leads with 150+ verified emails, seed test passed, first 5–10 real cold emails out on day 10–11 | Not "500 sends day 1" — that burns the domain before you get data. |

## Where this plan runs

Most of the machine **already exists in this repo** and just needs to be
switched on and pointed at accounts:

- `src/lib/marketing/full-auto-orchestrator.ts` — Apify → verify → Smartlead cycle, daily caps, compliance gate
- `src/lib/auto-marketing/scoring.ts` — deterministic 0–100 lead scoring (A/B/C ≈ approved/review/rejected)
- `src/lib/auto-marketing/classify.ts` — 13-category reply classifier + safe auto-drafts, suppression-first ordering
- `src/app/api/cron/full-auto-marketing/route.ts` — the cron entrypoint (**was never scheduled** — fixed: `.github/workflows/marketing-cron.yml` now triggers it free)
- `supabase/migrations/013 + 015` — `marketing_campaigns`, `marketing_runs`, `marketing_leads` tables
- `audit_events` migration + `/api/admin/auto-marketing/audit-attribution` — funnel attribution

Gaps found and addressed in this plan (see `09-build-prompts.md`):
MillionVerifier provider (ZeroBounce is ~6× the price — adapter added in
`src/lib/marketing/email-verifier.ts`), ROC license cross-reference, weekly
report generator, growth dashboard, Groq fallback classification.

⚠️ **Pricing bug to fix before first send:** `.env.example` Paddle comments
say "$49/month" while the live UI (`page.tsx`, `AuditResultView.tsx`,
`AuditFaq.tsx`) says **$79/month**. Confirm the Paddle price ID actually
charges $79 before any traffic arrives.

## $100/month budget — line by line (Lean Start, month 1)

| Line | Tool | Cost | Notes |
|---|---|---:|---|
| Sending platform + warmup | **Smartlead Base** | **$39/mo** | 2,000 active leads, 6,000 emails/mo, **unlimited mailboxes + unlimited warmup included**. Already integrated in this repo. ⚠️ API/webhooks are Pro-only ($94) — worked around below, don't pay for Pro. |
| Inbox/domain mailboxes | **Google Workspace Business Starter ×2** | **$14/mo** | $7/user/mo (annual commitment, billed monthly). Google→Google inboxing is the best available; contractors live on Gmail. |
| Outbound domain | 1× `.com` (e.g. `getquotereclaim.com`) | **~$10/yr** | NEVER send cold from `quotereclaim.com`. 301-redirect the bare domain to the real site. |
| Email verification | **MillionVerifier** 10k credits | **$37 one-time** | Credits never expire. ZeroBounce (current hard-coded provider) is ~6× the cost — adapter for MV included in this branch. |
| Prospecting data | **Apify free plan** ($5 credit/mo) + **AZ ROC posting list** (free) + contractor-website email scrape (own script) | **$0** | Google Maps scraper ≈ $4/1k places; free credit covers ~1,000 places/mo. AZ ROC publishes a downloadable list of ALL licensed AZ contractors with classification + city + qualifying-party name: roc.az.gov/posting-list. |
| Automation/scheduler | **GitHub Actions cron** → `/api/cron/full-auto-marketing` | **$0** | Vercel Hobby caps crons; GH Actions is free and added in this branch. |
| Reply classification AI | **Groq free tier** (already the app's AI provider) | **$0** | Deterministic classifier first; Groq only for `low_confidence`. |
| Analytics | **PostHog free tier** (already integrated) + `audit_events` + Supabase free | **$0** | 1M events/mo free — years of headroom. |
| Database/hosting | Supabase free + Vercel Hobby | **$0** | Already running. |
| CAN-SPAM postal address | Founder's real address, or USPS PO Box | **$0–10/mo** | `COMPLIANCE_POSTAL_ADDRESS` — the cron **fails closed** without it (correct behavior, keep it). |
| **Month-1 cash total** | | **≈ $100** | $39 + $14 + $10 + $37 |
| **Months 2+ recurring** | | **≈ $53–69/mo** | Add domain #2 + 2 more mailboxes (+$15) only when expanding to niche #2 / metro #2. MV refill ~every 2–3 months. |

**What NOT to buy:** Smartlead Pro ($94 — CSV + inbox-polling replaces API),
Instantly ($37 plan has same API gating, and we'd lose the built
integration), Apollo/ZoomInfo (their SMB local-trade data is garbage),
Clay ($134+), any "aged domain" (fraud-adjacent, high risk), any warmup-only
SaaS (included in Smartlead), paid ads, purchased lead lists, LinkedIn
automation (owner-operator contractors aren't there).

## The full-auto loop (once running, founder ≈ 15 min/week)

```
nightly GH Action  → orchestrator: Apify scrape (city×trade rotation)
                   → normalize + dedupe + score (A/B/C)
                   → MillionVerifier (verified-only rule)
                   → export/queue to Smartlead campaign (daily cap enforced)
weekdays           → Smartlead sends 5→25/mailbox/day (ramp), plain text,
                     no open pixel, no click tracking, one raw /audit URL
every 2h GH Action → poll sending inboxes (Gmail API) → POST replies to
                     reply-webhook endpoint → classify → auto-draft or
                     escalate → suppress on stop/angry/not_interested
continuous         → /audit visits carry ?c= attribution → audit_events
                     + PostHog funnel → signups → Paddle webhook = revenue
Monday GH Action   → weekly report: funnel, winners, next-100-leads,
                     copy test, niche decision → emailed to founder
circuit breakers   → bounce >3% / any spam complaint / warmup health <80%
                     → campaign auto-paused + founder alerted
```

Minimum human steps that cannot be safely automated away (~15 min/week):
1. Upload the weekly approved-leads CSV into Smartlead (Base plan has no API; the export endpoint already exists). ~5 min.
2. Approve escalated replies (interested/angry/legal/unknown) from drafts. ~5–10 min. Auto-send stays OFF until 50 drafts reviewed (`AUTO_SEND_SAFE_REPLIES`).
3. Read the Monday report and click one of the pre-computed decisions.

## Realistic numbers (do not self-deceive)

| Scenario | Month-1 sends | Replies | Audit visits | Audit completions | Signups | **Paid** |
|---|---:|---:|---:|---:|---:|---:|
| Best case | 900 | 30 (3.3%) | 45 | 18 | 6 | **2–3** |
| Realistic | 700 | 12–20 (~2%) | 20–30 | 8–14 | 2–4 | **0–1** (first paid day 30–50) |
| Bad case | 600 | <5 (<0.8%) | <10 | <4 | 0–1 | **0** |

What makes failure likely: skipping warmup, sending to unverified emails,
tracking pixels on, copy that sells the SaaS instead of the click,
5-suburb-only targeting (list exhaustion), ignoring the Monday report.

Market-is-responding signal: **reply rate ≥2% AND audit completion ≥40% of
audit starts** by send #300. Pivot triggers are in `07-launch-plan.md`.

## File index

| File | Deliverable |
|---|---|
| `01-architecture.md` | Full-auto system architecture: data flow, tables, statuses, cron schedule, failure handling, suppression logic |
| `02-lead-sourcing.md` | Niche scoring matrix, wedge decision, exact search queries, ROC workflow, lead scoring model, exclusion rules |
| `03-cold-email.md` | Sequences (concrete primary, HVAC/painter/fence variants, 4- and 6-email), subjects, preview lines, A/B matrix, footers, link strategy |
| `04-reply-handling.md` | Classification → risk → auto-reply/escalate → suppress map with exact templates |
| `05-deliverability.md` | DNS checklist, warmup, ramp table, thresholds, automatic pause rules, tracking decisions |
| `06-analytics.md` | Events, funnel metrics, dashboard spec, weekly report format, decision rules |
| `07-launch-plan.md` | Day-by-day first 7 days, 30-day operating plan, forecasts, pivot rules |
| `08-growth-ideas.md` | 20 unconventional growth loops, rated; top 3 chosen |
| `09-build-prompts.md` | Claude build prompts for every remaining code gap |

## Do this now — the next 10 actions in order

1. **Fix the price mismatch**: confirm Paddle price ID = $79/mo (UI says $79, env comments say $49). Set `NEXT_PUBLIC_PADDLE_*` in Vercel so checkout is live before traffic arrives.
2. **Buy the outbound domain** (`getquotereclaim.com` or similar .com, ~$10) and 301-redirect its root to `https://www.quotereclaim.com`.
3. **Buy Google Workspace Business Starter ×2** on that domain (`sam@`, `alex@` — real founder identity, not fake personas: use your real name on one, a plain `hello@` on the other). Set SPF, DKIM (2048-bit), DMARC `p=none; rua=mailto:...` per `05-deliverability.md`.
4. **Subscribe Smartlead Base ($39)**, connect both mailboxes, **turn warmup ON immediately** (30–40/day, 35% reply). Set `SMARTLEAD_API_KEY` aside — not needed on Base; the CSV path is the plan.
5. **Buy MillionVerifier 10k credits ($37)**; set `EMAIL_VERIFIER_PROVIDER=millionverifier` + `EMAIL_VERIFIER_API_KEY` in Vercel (adapter ships in this branch).
6. **Set `COMPLIANCE_POSTAL_ADDRESS`** (real address or PO Box). The cron correctly refuses to run live without it.
7. **Set the GitHub Actions secrets** `MARKETING_CRON_URL` + `MARKETING_AUTOMATION_SECRET` (workflow ships in this branch), set `MARKETING_AUTOMATION_ENABLED=true`, `ADMIN_USER_IDS`, and run one **dry-run cycle** from `/admin/full-auto-marketing`.
8. **Create the three campaigns** in `/admin/auto-marketing` from `02-lead-sourcing.md` (phx-concrete-v1 East Valley, phx-concrete-v1 West Valley, phx-fence-v1 reserve) with the v2 sequence from `03-cold-email.md`, daily cap 10.
9. **Run the first Apify sourcing batch** (500 places, queries in `02-lead-sourcing.md`) + download the AZ ROC posting list; let scoring + verification fill the approved queue. Export CSV → upload to Smartlead → **leave paused** until day 10.
10. **Day 10–11: unpause at 5 sends/mailbox/day** and follow the ramp + pause rules in `05-deliverability.md`. Read the Monday report. Touch nothing else.
