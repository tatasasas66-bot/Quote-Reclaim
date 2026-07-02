# 05 — Deliverability Safety System

The fastest path that does not burn the domain. Anyone promising "500/day
from day 1" is selling you a dead domain. Current reality (verified July
2026): Gmail/Yahoo enforce a 0.3% spam-complaint ceiling (target ≤0.1%),
fresh domains need 2–4 weeks of warmup, and the safe steady-state for cold
sends is ~20–50/mailbox/day. We design to the conservative end because we
have exactly one shot at this niche with this brand.

## Mailbox + domain setup (Day 0)

- **Never send cold from `quotereclaim.com`.** It carries the product's
  transactional email (Resend, magic links, follow-ups). One bad month of
  cold outreach on it and your OWN CUSTOMERS' magic links go to spam.
- Buy 1 fresh `.com`: `getquotereclaim.com` / `quotereclaimhq.com` /
  `usequotereclaim.com`. No hyphens, no weird TLDs (.xyz/.top = spam
  priors). 301-redirect root → `https://www.quotereclaim.com`.
- Google Workspace Business Starter ×2: `<founder-first-name>@` and
  `hello@`. Real names, real photos in the Gmail profile, signature
  matching the email footer. Fill out the profile like a human works
  there, because one does.
- Month 2 (expansion only): add domain #2 + 2 more mailboxes. Never more
  than 2–3 sending mailboxes per domain.

## DNS checklist (must be green before warmup starts)

- [ ] MX → Google (`smtp.google.com` per current Workspace setup)
- [ ] SPF: `v=spf1 include:_spf.google.com ~all` (ONE spf record only)
- [ ] DKIM: 2048-bit, generated in Admin console, CNAME/TXT published,
      **verify signing is active** (send to a Gmail, check
      `dkim=pass` in headers)
- [ ] DMARC: start `v=DMARC1; p=none; rua=mailto:dmarc@<outbound-domain>`
      → after 30 clean days move to `p=quarantine`
- [ ] Root 301 → quotereclaim.com; no parked-page ads
- [ ] mail-tester.com score ≥ 9/10 with the actual Email 1 body
- [ ] Google Postmaster Tools added for the domain (free; watch spam rate)

## Tracking decisions (deliberate, not default)

| Signal | Decision | Why |
|---|---|---|
| Open pixel | **OFF** | Image pixel in plain-text-style email = filter fingerprint + Apple MPP makes the data fiction anyway. |
| Click tracking (rewrite) | **OFF** | Smartlead's redirect domain is shared-reputation risk; a raw quotereclaim.com URL is cleaner and more trusted by both filters and contractors. |
| Attribution | **ON via URL param** `?c=pc1e2` | Server-side: audit_events + PostHog capture the param. We measure CLICKS as audit landings — truth, not proxy. |
| Reply detection | **ON via our own inboxes** (Gmail poller) | Zero deliverability cost, catches bounces + OOO too. |

## Warmup + ramp (per mailbox; both mailboxes in parallel)

Smartlead warmup: ON from day 0, 30–40 warmup emails/day, reply rate 35%,
ramp-up enabled. **Warmup stays on forever** (drops to ~15–20/day once
real volume is steady).

| Days | Real cold sends / mailbox / day | Total/day (2 boxes) | Notes |
|---|---:|---:|---|
| 0–9 | 0 | 0 | Pure warmup. Build the list meanwhile. |
| 10–13 | 5 | 10 | A-tier leads only. Seed test first (below). |
| 14–20 | 10 | 20 | Watch bounce + warmup health daily. |
| 21–27 | 15–20 | 30–40 | A/B T1 gets enough volume now. |
| 28+ | 25 max | **50 max** | This is the ceiling per domain. Scale = more mailboxes/domains, never more per box. |

Sending window: **Mon–Fri 07:30–10:30 America/Phoenix**, randomized
intervals (Smartlead default jitter), max ~8/hour/mailbox. No weekends —
contractors do read email Saturday but complaint rates run higher.

Seed test (day 9): send Email 1 to 5–8 own/friendly addresses across
Gmail, Outlook, Yahoo. Required: 100% inbox on Gmail, no Promotions-tab
panic (Promotions is survivable; Spam is not), DKIM/SPF/DMARC pass in
headers. Fail → fix before any real send.

## Verified-email-only rule

- MillionVerifier `ok` → sendable.
- `catch_all` (= our `risky`) → only A-tier leads with a live website,
  ≤20% of any day's sends. Contractor domains are often catch-all; a
  blanket ban costs a third of the niche, a blanket allow costs the
  domain. 20% is the compromise; tighten to 0% if bounce breaker trips.
- `invalid`, `disposable`, `unknown` → never. No exceptions, including
  "but it's a perfect-fit lead".
- Re-verify anything older than 60 days before re-use.

## Automatic pause rules (circuit breakers — codified, not vibes)

| Trigger | Threshold | Automatic action |
|---|---|---|
| Bounce rate | >3% rolling last 100 sends per campaign | Pause campaign; re-verify remaining queue; founder alert. Resume manually only. |
| Bounce rate | >5% any day | Pause ALL campaigns on that domain for 48h. |
| Spam complaint (Postmaster / Smartlead flag) | ANY single complaint | Halve daily cap for 7 days. |
| Spam complaints | ≥2 in 7 days | Pause domain 7 days; audit copy + list source before resume. |
| Reply rate | <0.5% after 200 sends of a variant | Kill the variant (deliverability OR copy is broken — run seed test to tell which). |
| Warmup inbox placement (Smartlead warmup health) | <80% | Stop real sends, warmup-only until >90% for 3 consecutive days. |
| Postmaster spam rate | ≥0.1% | Halve volume. ≥0.2%: pause domain. (0.3% is Google's enforcement line — never touch it.) |
| Unsubscribe/stop rate | >2% of sends | Copy is misfiring for the audience — pause, rewrite Email 1. |

Implementation: thresholds computed nightly from `marketing_leads` +
`sends` counters in the cron cycle; "pause" = set campaign
`status='paused'` (already respected by the orchestrator) + founder
email. Build prompt #1 wires the checks.

## Unsubscribe processing

"Reply stop" → classifier → permanent suppression, same poll cycle (≤2h
worst case, legally you have 10 business days; we do 2 hours). Suppression
is enforced at export time from OUR database — never rely on Smartlead's
list as the source of truth. Weekly job re-asserts the full suppression
list against the Smartlead campaign block list (manual paste on Base
plan, 2 min, part of the Monday routine).

## Domain reputation rules

- One niche's campaign per domain at a time; don't interleave concrete +
  painter sends from the same mailbox in the same week if volume allows.
- No sudden volume jumps >50% day-over-day, ever, including after pauses
  (re-ramp at half-speed after any pause >3 days).
- The outbound domain hosts NOTHING but the redirect — no signup forms,
  no landing pages (filters check root-domain content consistency).
- If the domain dies anyway (persistent spam placement after 2 clean
  weeks of remediation): retire it, spin up replacement domain + boxes
  (~$24, 3 weeks of warmup), and treat the old lead statuses as intact —
  the DATABASE is the asset, the domain is a consumable.
