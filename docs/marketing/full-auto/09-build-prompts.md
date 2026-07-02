# 09 — Claude Build Prompts

Paste these into Claude Code sessions against this repo, one at a time,
in this order. Each prompt is scoped to be reviewable in one PR. They
reference real files/tables so the agent extends instead of reinventing.

---

## Prompt 1 — Automation system gaps (verifier ✅ done, breakers, suppression)

```
In the Quote-Reclaim repo, extend the full-auto marketing pipeline. Read
src/lib/marketing/full-auto-orchestrator.ts, safety.ts, repo.ts,
email-verifier.ts and supabase/migrations/015_full_auto_marketing.sql
first.

1. MillionVerifier provider: ALREADY IMPLEMENTED in email-verifier.ts
   (provider "millionverifier", GET https://api.millionverifier.com/api/v3/
   with api+email+timeout params; result mapping ok→valid,
   invalid/disposable→invalid, catch_all→risky, unknown/error→unknown).
   Verify tests in src/__tests__/full-auto-marketing.test.ts still pass
   and extend if mapping edge cases are uncovered.
2. Add a global suppression_list table (new migration): email_hash
   (sha256 lowercase email, unique), email_domain, reason, source,
   created_at. Backfill from marketing_leads where reply_status in
   ('unsubscribed','negative','bounced'). Enforce it in
   listUploadEligibleLeads and at CSV export
   (/api/admin/auto-marketing/export-approved): a suppressed email or
   suppressed website-domain must never export. Also auto-suppress any
   email belonging to an existing auth user.
3. Circuit breakers in the nightly cron cycle: per campaign compute
   rolling bounce rate (last 100 uploaded leads with reply_status
   'bounced') and stop-rate; if bounce >3% or stops >2% set campaign
   status='paused' and record the reason in marketing_runs.error; send
   a founder alert email via the existing Resend client.
4. Catch-all cap: risky-verification leads limited to 20% of any
   export batch, A-tier only.
Write vitest coverage for suppression enforcement, breaker math, and
the 20% cap. Do not touch customer-facing quote follow-up code paths.
```

## Prompt 2 — Lead scoring pipeline: ROC cross-reference + website email scraper

```
In the Quote-Reclaim repo, add two lead-source enrichers to the
marketing pipeline (read src/lib/marketing/normalize.ts, repo.ts, and
src/lib/auto-marketing/scoring.ts first).

1. AZ ROC posting-list importer: admin-only endpoint
   POST /api/admin/auto-marketing/roc-import accepting the CSV from
   roc.az.gov/posting-list. Parse business name, license number,
   classification, city, status, qualifying-party name. New columns on
   marketing_leads: roc_license_no, roc_class, roc_status, source
   (default 'apify'). Match to existing leads by normalized business
   name + city (strip LLC/Inc/Co, lowercase, collapse whitespace).
   On match: fill first_name from qualifying party when empty, set roc
   fields. Unmatched concrete/fence-class rows insert as source='roc'
   leads (no email yet).
2. Website email scraper: for leads with website and no email, fetch
   homepage + /contact + /contact-us + /about (5s timeout, 3 pages max,
   respect robots.txt, identify with an honest User-Agent
   "QuoteReclaimBot/1.0 (+https://www.quotereclaim.com)"). Extract
   mailto: and visible emails, prefer named@domain > info@domain,
   store to the lead, leave verification to the existing verifier
   step. Run inside the nightly cycle, capped at 50 fetches/run.
3. Scoring adjustments in scoring.ts: +5 roc_status active, -15 apify
   lead with no ROC match in a licensed trade, -40 franchise/aggregator
   markers (websites on angi/thumbtack/yelp/facebook domains route to
   website-discovery instead of scraping), -10 rating <3.8 with ≥20
   reviews. Keep the existing tier thresholds. Update the scoring tests.
```

## Prompt 3 — Smart outbound campaign wiring

```
In the Quote-Reclaim repo, wire the v2 outbound campaigns from
docs/marketing/full-auto/03-cold-email.md into code (read
src/lib/marketing/sequence.ts and campaign-config.ts first).

1. Add the v2 concrete 4-step sequence, the short first-touch variant,
   and the painter/fence/hvac variants as typed sequence constants with
   the exact copy from the doc (tokens: {{first_name}} optional-greeting
   handling, {{company_name}}, {{city}}, sender first name, postal
   address appended by buildComplianceSafeSequence).
2. Attribution: every audit URL in sequences uses ?c=<campaign><step>
   codes per the doc convention. Extend the audit page to persist the
   c param into audit_events (the attribution endpoint exists:
   /api/admin/auto-marketing/audit-attribution) and into localStorage
   so signup can attribute back to first touch.
3. Experiments table (new migration) per docs 01/06 + an assignment
   helper that splits export batches 50/50 by variant and stamps the
   variant into the exported CSV custom field so Smartlead A/B rows
   are distinguishable in replies and c-codes.
4. Seed DEFAULT_CAMPAIGN_INPUT replacements: phx-concrete-ev-v1,
   phx-concrete-wv-v1, phx-fence-v1 (paused), phx-painter-exp-v1
   (paused), each with search queries from
   docs/marketing/full-auto/02-lead-sourcing.md and daily_cap 10.
Write tests asserting sequence copy contains the stop line + postal
address and that c-codes are unique per campaign+step.
```

## Prompt 4 — Analytics dashboard + weekly report

```
In the Quote-Reclaim repo, build the growth analytics layer per
docs/marketing/full-auto/06-analytics.md (read src/lib/audit-events.ts,
the admin auth guard in src/lib/marketing/admin.ts, and the existing
/admin pages first).

1. /admin/growth page (ADMIN_USER_IDS-guarded, server-rendered):
   four blocks — weekly funnel vs last week, pipeline inventory by
   tier×verification×campaign, live experiments with counts and a
   2-proportion z verdict at 90%, circuit-breaker status
   (green/amber/red) per campaign.
2. Weekly report endpoint POST /api/cron/weekly-growth-report
   (MARKETING_AUTOMATION_SECRET bearer auth): compute the metrics,
   store a weekly_reports row (new migration: week_start, metrics
   jsonb, decisions jsonb, sent_at), render the exact markdown format
   from the doc, email via existing Resend client to
   FULL_AUTO_MARKETING_ADMIN_EMAILS. Use the existing Groq client
   (AI_FAST_MODEL) only for the two "why it happened" bullets, with
   the numbers passed in-context; on Groq failure, fall back to
   templated bullets — the report must never fail to send.
3. Add the Monday schedule for it to .github/workflows/marketing-cron.yml.
4. audit_completed PostHog event with quiet-value total and c-code
   (amounts and days only — no PII, consistent with the audit's
   no-names promise).
Vitest the funnel math against fixture rows.
```

## Prompt 5 — Reply ingestion + classification hardening

```
In the Quote-Reclaim repo, complete the reply loop for Smartlead Base
(no webhooks on this plan) per docs/marketing/full-auto/01-architecture.md
(read src/lib/auto-marketing/classify.ts and
src/app/api/admin/auto-marketing/reply-webhook/route.ts first).

1. Gmail poller: a standalone script scripts/poll-replies.mjs run by
   GitHub Actions every 2h weekdays. Auth: OAuth refresh tokens for the
   two outbound mailboxes (gmail.readonly), env-provided. Fetch messages
   newer than the last checkpoint (store checkpoint in Supabase), strip
   quoted history (reuse src/lib/messaging/strip-quoted-reply.ts logic),
   detect mailer-daemon bounces, and POST each to the reply-webhook
   endpoint with X-Webhook-Secret. Idempotent by Message-ID.
2. Groq fallback classification for low_confidence replies using
   AI_FAST_MODEL with a fixed label set matching ReplyClassification;
   AI may never override deterministic suppressions (preserve the
   existing ordering guarantee). Add a maybe_later classification
   (keywords: "later", "next month", "busy season", "circle back")
   with 45-day snooze semantics.
3. PLAYBOOK keyword: replies whose stripped body matches /\bplaybook\b/i
   get the auto-fulfillment template from
   docs/marketing/full-auto/04-reply-handling.md (safe to auto-send
   even when AUTO_SEND_SAFE_REPLIES=false, since it is an explicit
   opt-in request — but still log a drafted+sent record for audit).
4. Escalation: interested/wants_demo/angry/legal → immediate founder
   email with the drafted response; low_confidence → daily digest.
Golden-set tests: 30 fixture replies (stop variants, angry, playbook,
maybe-later, Spanish-language stop ("no me mandes más correos" must
suppress), bounce formats) asserting classification + suppression.
```

---

Also queued (from 08-growth-ideas top-3): audit-completion "email me
this plan as a PDF" capture + 4-email Resend nurture, and prefilled
audit links (`?trade=&city=`) — write these as their own prompts after
the five above are merged and the machine has sent its first 200 emails.
