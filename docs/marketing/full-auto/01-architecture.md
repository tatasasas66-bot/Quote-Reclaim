# 01 — Full-Auto System Architecture

Principle: **use what is already built in this repo.** The architecture
below is 80% existing code; new pieces are marked `NEW` and have build
prompts in `09-build-prompts.md`.

## Layer map

```
┌─ DATA SOURCE LAYER ──────────────────────────────────────────────┐
│ Apify compass/crawler-google-places (free $5/mo credit)          │
│ AZ ROC posting list CSV (roc.az.gov/posting-list, free)     NEW  │
│ Contractor-website email scraper (own script)               NEW  │
└──────────────────────────────────────────────────────────────────┘
        ↓ persistApifyDataset() / import endpoint
┌─ ENRICHMENT + SCORING LAYER ─────────────────────────────────────┐
│ normalize.ts (dedupe by email+domain), scoring.ts (0–100, A/B/C) │
│ ROC cross-reference: license class, status, qualifying-party     │
│ first name (real personalization token)                     NEW  │
└──────────────────────────────────────────────────────────────────┘
        ↓ listPendingVerification()
┌─ VERIFICATION LAYER ─────────────────────────────────────────────┐
│ email-verifier.ts — MillionVerifier provider (this branch)       │
│ verified-only rule: 'valid' sends; 'risky'(catch-all) capped;    │
│ 'invalid'/'unknown' never uploaded                               │
└──────────────────────────────────────────────────────────────────┘
        ↓ listUploadEligibleLeads() + applyDailyCap() + suppression
┌─ CAMPAIGN LAYER ─────────────────────────────────────────────────┐
│ Smartlead Base: mailboxes, warmup, scheduling, stop-on-reply     │
│ Base has NO API → weekly CSV export (endpoint exists:            │
│ /api/admin/auto-marketing/export-approved) + 5-min manual upload │
│ Suppression enforced at export time, never trusted to Smartlead  │
└──────────────────────────────────────────────────────────────────┘
        ↓ replies land in OUR Gmail mailboxes
┌─ REPLY LAYER ────────────────────────────────────────────────────┐
│ Gmail API poller (GH Action, every 2h weekdays)             NEW  │
│  → POST /api/admin/auto-marketing/reply-webhook                  │
│    (X-Webhook-Secret; endpoint exists)                           │
│ classify.ts: suppression-first deterministic classifier          │
│ Groq fallback for low_confidence                            NEW  │
│ draftReplyFor() safe drafts; AUTO_SEND_SAFE_REPLIES gate         │
└──────────────────────────────────────────────────────────────────┘
        ↓
┌─ ANALYTICS + LEARNING LAYER ─────────────────────────────────────┐
│ /audit?c=<code> attribution → audit_events table + PostHog       │
│ Paddle webhook → paid conversion                                 │
│ Monday weekly report generator → email via Resend           NEW  │
│ /admin/growth dashboard                                     NEW  │
└──────────────────────────────────────────────────────────────────┘
```

## Tables (existing migrations — do not reinvent)

`supabase/migrations/015_full_auto_marketing.sql`:

- **marketing_campaigns** — id, name, slug, trade, city, search_query,
  daily_cap, mode (`dry_run|live`), status (`draft|active|paused|stopped`),
  sequence_config (jsonb), smartlead_campaign_id, last_run_at
- **marketing_runs** — campaign_id, status (`queued|running|completed|failed`),
  apify_run_id, counters (ingested/verified/uploaded/skipped), error
- **marketing_leads** — campaign_id, company, first_name, email, website,
  city, trade, review_count, rating, score, score_breakdown (jsonb),
  verification_status (`unverified|valid|invalid|risky|unknown`),
  smartlead_status, reply_status (`none|replied|positive|negative|bounced|unsubscribed`),
  suppressed_at, suppression_reason

`013_auto_marketing.sql` — admin approve/review queue tables.
`20260627213340_audit_events.sql` — **audit_events** (funnel events).

`NEW` columns/tables (build prompt #2):

- `marketing_leads` + `roc_license_no text`, `roc_class text`,
  `roc_status text`, `source text default 'apify'` (`apify|roc|website`)
- **suppression_list** (email_hash unique, reason, source, created_at) —
  global, campaign-independent; checked at import AND export. Never expires.
- **weekly_reports** (week_start, metrics jsonb, decisions jsonb, sent_at)
- **experiments** (id, name, variable — subject|body|niche|city, variant_a,
  variant_b, assigned_count_a/b, replies_a/b, clicks_a/b, status, verdict)

## Statuses — one lead's life

```
NEW (apify/roc import)
 → deduped (email+website domain; loser rows dropped, source merged)
 → scored: approved (A, ≥70) | review (B, 50–69) | rejected (C, <50)
 → verification: valid | risky | invalid | unknown
 → export-eligible = approved AND valid (risky only if A-tier + live
   website, ≤20% of any batch) AND NOT in suppression_list
 → uploaded (in Smartlead campaign, sequence running)
 → reply_status: replied → classified →
     positive  → OPPORTUNITY (founder alerted, sequence stopped)
     negative  → suppressed (reason reply_not_interested)
     unsubscribed/angry → suppressed permanently + suppression_list
     bounced   → suppressed + counts toward bounce circuit breaker
 → audit_visit (attributed via ?c=) → audit_completed → signed_up → PAID
```

Suppression logic (enforced in `safety.ts` + export filter):
1. suppression_list hit → never export, never re-import as sendable
2. reply_status ∈ {unsubscribed, negative, bounced} → suppress lead + add
   email hash to suppression_list
3. Any lead that signed up → suppress from marketing (they're a user now)
4. Same **website domain** as any suppressed lead → suppress (don't email
   info@ after the owner said stop)

## Cron schedule (GitHub Actions — free; Vercel Hobby crons are already
maxed at 2 and can't run sub-daily)

`.github/workflows/marketing-cron.yml` (ships in this branch):

| Job | Schedule (UTC) | Calls | Purpose |
|---|---|---|---|
| sourcing-cycle | `0 9 * * *` (02:00 Phoenix) | `GET /api/cron/full-auto-marketing` w/ `Authorization: Bearer $MARKETING_AUTOMATION_SECRET` | Runs orchestrator for every active campaign: Apify → verify → queue. Campaign-level 24h dedupe already in `campaignDue()`. |
| reply-poll | `0 14-23/2 * * 1-5` | `NEW` poller (build prompt #5) → reply-webhook | Pull replies + bounces from both Gmail inboxes, classify, suppress, draft. |
| weekly-report | `0 13 * * 1` (06:00 Phoenix Monday) | `NEW` report endpoint (build prompt #4) | Funnel + winners + decisions → email founder. |

Failure handling:
- Orchestrator already records per-run errors in `marketing_runs.error`
  and continues other campaigns (`runAllActiveCampaigns`).
- GH Action retries: `curl --retry 4 --retry-delay 2` (exponential via
  `--retry` backoff) then exits non-zero → GitHub emails the founder. That
  failure email IS the alerting system — $0.
- Apify run stuck >30 min → orchestrator marks run `failed`; next nightly
  cycle starts clean (`latestOpenMarketingRun` guard exists).
- Verifier HTTP failure → lead stays `unverified`, retried next cycle,
  never uploaded unverified (fail-closed already implemented).
- Compliance gate: missing `COMPLIANCE_POSTAL_ADDRESS` → cron 409s, live
  mode blocked, dry-run still allowed (already implemented — keep).

## The Smartlead-Base workaround (no API, no webhooks — by design)

Paying $94/mo for Pro to get API/webhooks would consume the whole budget.
Instead:

1. **Lead upload**: nightly cycle fills the approved+verified queue →
   `/api/admin/auto-marketing/export-approved` produces the Smartlead CSV
   (already built). Founder uploads it Mondays. 5 minutes/week. Smartlead
   dedupes on email, so re-uploading the full eligible set is safe.
2. **Reply ingestion**: replies arrive in mailboxes WE own. The Gmail API
   poller (free, refresh-token auth, read-only scope) posts each new reply
   to the existing reply-webhook endpoint with `REPLY_WEBHOOK_SECRET`.
   Strictly better than Smartlead webhooks: bounces (mailer-daemon) and
   OOO messages come through the same pipe.
3. **Sequence stop on reply**: Smartlead stops follow-ups natively when a
   reply is detected (all plans). Suppression beyond that is ours.
4. **Upgrade path**: at ≥3 paying customers ($237 MRR), move to Smartlead
   Pro and flip `SMARTLEAD_API_KEY` on — the push integration
   (`smartlead/push`) is already written and becomes fully zero-touch.

## Environment switches (all exist in `.env.example`)

```
MARKETING_AUTOMATION_ENABLED=true      # master switch
MARKETING_AUTOMATION_SECRET=<random>   # GH Action bearer token
COMPLIANCE_POSTAL_ADDRESS=<real>       # fail-closed gate, keep it
APIFY_TOKEN=<free plan token>
APIFY_GOOGLE_MAPS_ACTOR_ID=compass/crawler-google-places
EMAIL_VERIFIER_PROVIDER=millionverifier
EMAIL_VERIFIER_API_KEY=<mv key>
REPLY_WEBHOOK_SECRET=<random>
AUTO_SEND_SAFE_REPLIES=false           # flip true only after 50 reviewed drafts
ADMIN_USER_IDS=<your supabase uuid>
```

## Exact flow: raw lead → sent email (steady state)

1. 02:00 Phoenix — GH Action hits cron. Orchestrator: for each active
   campaign due, start Apify run for `search_query` (place cap 300).
2. Dataset lands → `persistApifyDataset`: normalize, dedupe, score.
   No-email leads → website scraper queue (`NEW`) → found emails re-enter.
3. `listPendingVerification` → MillionVerifier → statuses written.
4. `listUploadEligibleLeads` + `applyDailyCap` + suppression filter →
   marked export-eligible.
5. Monday 07:00 — founder downloads CSV, uploads to the mapped Smartlead
   campaign (`smartlead-campaign-id.ts` mapping already exists), presses
   nothing else. Sequence + schedule + caps live in Smartlead.
6. Smartlead sends within 07:30–10:30 Phoenix window, weekdays, ramped
   per `05-deliverability.md`. Plain text, no pixels, raw `/audit?c=` URL.
7. Replies → poller → classify → suppress/draft/escalate (`04-reply-handling.md`).
8. Clicks → `/audit?c=pc1e2` → audit_events + PostHog → funnel report.
