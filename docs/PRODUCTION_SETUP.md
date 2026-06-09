# Production Setup Guide

Master guide for deploying Quote Reclaim to production. Read each linked doc
before configuring the corresponding provider.

---

## Overview

Quote Reclaim is a Next.js 14 app deployed on Vercel. It requires:

| Provider | Purpose | Required |
|----------|---------|---------|
| Supabase | Database, auth, RLS, RPCs | Yes |
| Twilio | Outbound + inbound SMS | Yes |
| Groq | AI message generation | Yes |
| Billing provider | Subscriptions + paywall | TBD (currently disabled) |
| Resend | Email (future channel) | Optional |
| Sentry | Error tracking | Optional |
| PostHog | Analytics | Optional |

---

## Step 1: Supabase

Follow `docs/SUPABASE_AUTH_SETUP.md`.

Minimum:
- Project created, region selected
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` set
- Auth redirect URLs configured for production domain
- All migrations applied
- RLS enabled on all user tables
- `profiles` trigger in place
- Custom SMTP configured

---

## Step 2: Vercel deployment

1. Connect the GitHub repo to Vercel.
2. Framework: **Next.js** (auto-detected).
3. Build command: `npm run build` (default).
4. Output directory: `.next` (default).
5. Set **all environment variables** from `docs/ENV_VARS.md` under
   **Settings → Environment Variables → Production**.
6. Do not scope sensitive server vars (service_role, auth tokens) to Preview.
7. Deploy.

**App URL:** Note your production Vercel domain, e.g. `https://quote-reclaim.vercel.app`.
Set this as `NEXT_PUBLIC_APP_URL`.

---

## Step 3: Twilio

Follow `docs/TWILIO_SETUP.md`.

Minimum:
- Account SID, Auth Token, From Number set
- Inbound webhook URL configured on the number
- A2P 10DLC registration submitted (allow 1–5 days)
- STOP test passed

---

## Step 4: Groq

1. Go to [console.groq.com](https://console.groq.com) → API Keys → Create key.
2. Set `GROQ_API_KEY` in Vercel.
3. No webhook configuration needed.

Groq is used only for message generation. If the API is unreachable, quote creation
returns an error. There is no local fallback in production.

---

## Step 4b: Resend open/click webhook (Quiet Signal)

Quiet Signal diagnoses why a quote went quiet using email open/click engagement.
That data arrives via a Resend webhook. Until it is configured, Quiet Signal still
works — it simply shows the calm fallback ("Normal silence / keep the default
schedule") on every quote. Configuring the webhook is what gives it teeth.

1. In the Resend dashboard → **Webhooks** → **Add Webhook**.
2. Endpoint URL: `https://<your-domain>/api/webhooks/resend-email-events`.
3. Subscribe to **`email.opened`** and **`email.clicked`** (others are harmless —
   they are recorded for dedupe but do not move counters).
4. Copy **this endpoint's** signing secret and set it in Vercel as
   **`RESEND_EMAIL_EVENTS_WEBHOOK_SECRET`**.

> ⚠️ **Do NOT overwrite any other secret with this value, and do not reuse another
> webhook's secret here.** Resend mints a *separate* signing secret per webhook
> endpoint. This webhook has its own dedicated var (`RESEND_EMAIL_EVENTS_WEBHOOK_SECRET`).
> The inbound/reply webhook (Reply Radar) uses a *different* secret
> (`EMAIL_INBOUND_SECRET`) and is unaffected by this step. Rotating or replacing
> one must never touch the other.

In production the route **fails closed**: if `RESEND_EMAIL_EVENTS_WEBHOOK_SECRET`
is unset, the endpoint returns `503` and no engagement is recorded (it never runs
unauthenticated). The handler is idempotent on the Svix event id, so Resend's
retries can never double-count.

---

## Step 5: Billing provider (currently disabled)

Quote Reclaim is between merchants of record. There is no active billing
provider in the codebase, no provider-specific env vars are required,
and the upgrade UI shows an honest "billing being updated
— email support@quotereclaim.com" state instead of a dead checkout. Paid
activation during this window is manual (see `docs/LAUNCH_GATE.md`).

When a future provider is wired up:

- Add its env vars to `.env.example` and the table in `docs/ENV_VARS.md`.
- Implement `BillingProvider` (`src/lib/payments/types.ts`) and swap the
  selector in `src/lib/payments/provider.ts`. The Paywall + UpgradeButton
  UI flips to the active checkout path automatically.

---

## Step 6: Cron secret

Generate a secure random secret:

```bash
openssl rand -base64 32
```

Set it as `CRON_SECRET` in Vercel.

For manual triggers (testing, backfill):
```bash
curl -X POST https://your-app.vercel.app/api/cron/send \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Step 7: Cron schedule — Vercel plan requirements

> **Vercel Hobby plan limitation:** Vercel Hobby only supports cron schedules
> with a minimum interval of once per day. The `*/15 * * * *` (every 15 minutes)
> schedule required for timely reminder delivery is a **Vercel Pro** feature.

### Current state (Hobby plan)

The `vercel.json` cron registration has been removed so the Hobby deployment
succeeds without errors. Both cron route files remain in the codebase and work
correctly when triggered manually.

**Automatic Day 1 / Day 3 / Day 7 reminder sending requires one of:**
- **Vercel Pro** — re-add the `crons` block to `vercel.json` (see below).
- **External scheduler** — call `/api/cron/send` every 15 minutes from any
  cron service (GitHub Actions, cron-job.org, Render cron, etc.) using your
  `CRON_SECRET`.

**Until then, send reminders by:**
- Using the **Send early** button on a quote detail page (manual send).
- Triggering the cron endpoint manually during testing:
  ```bash
  curl -X POST https://your-app.vercel.app/api/cron/send \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

### Upgrading to Vercel Pro

When on Vercel Pro, restore automatic scheduling by adding to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/send", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/weekly-briefing", "schedule": "0 13 * * 1" }
  ]
}
```

Then verify under **Vercel dashboard → Settings → Cron Jobs** that both jobs
appear and show a successful recent run.

---

## Step 8: Bad string audit

Before launch, confirm none of these appear in production code:

| String | File(s) to check | Why |
|--------|-----------------|-----|
| `Bid` | All `.ts`/`.tsx` | Banned word; use "Quote" or "Estimate" |
| `Send Now` | UI components | Avoid command-language CTAs |
| `just following up` | Outside banned list | Banned phrase in message body |
| `checking back` | Outside banned list | Same |
| `one final follow-up` | Outside banned list | Same |
| `on file` | Outside banned list | Same |
| `console.log(` | Prod routes (not simulator) | No silent data leakage |
| `.env.local` | `git ls-files` | Must not be committed |

Run:
```bash
# Banned word
grep -rn "\bBid\b" src/ --include="*.ts" --include="*.tsx" | grep -v ".test."

# Banned phrases in message generation code
grep -rn "Send Now" src/ --include="*.ts" --include="*.tsx" | grep -v ".test."

# console.log outside simulator
grep -rn "console\.log(" src/ --include="*.ts" --include="*.tsx" \
  | grep -v ".test." | grep -v "simulator-provider"

# .env.local committed
git ls-files | grep -i ".env.local"
```

Expected output for each: empty (or only expected matches like the banned-phrase
validation list in `validate-message.ts`).

**Note on `console.log` in `inbound/route.ts`:** One `console.log` exists in
`src/app/api/webhooks/twilio/inbound/route.ts` for the "no attribution match"
case. It uses `maskPhone()` (output: `***-***-4567`) and `messageSid` only —
no PII. This is intentional ops tracing and does not represent a data leak.

---

## Step 9: Final smoke test

After all providers are configured and the first production deploy is live:

1. Sign up with a real email. Confirm magic link works.
2. Create 3 quotes. Confirm no paywall.
3. Attempt 4th quote. Confirm paywall with correct copy.
4. Confirm the Paywall surfaces the "billing being updated" support
   email instead of routing anywhere; no dead checkout link.
5. Confirm `profiles.is_paid = true`; paywall gone.
6. On a quote with a valid phone, click Send Now. Confirm SMS arrives.
7. Reply STOP. Confirm opt-out recorded.
8. Trigger the cron manually. Confirm `sent ≥ 0`, no 503.
9. Sign out. Confirm `/dashboard` redirects to sign-in.

For the full test matrix, see `docs/REAL_E2E_TEST_PLAN.md`.

---

## Pricing enforcement reminder

| Rule | Value |
|------|-------|
| Monthly price | **$79/month** |
| Free quote limit | **3** |
| Discounts | **None** |
| Other plans | **None** |

The codebase enforces these at:
- `src/lib/payments/entitlement.ts`: `MONTHLY_PRICE_USD = 79`, `FREE_PLAN_LIMIT = 3`
- `src/components/billing/Paywall.tsx`: hardcoded copy
- `src/lib/quotes/actions.ts`: `check_and_increment_usage` RPC gating

Do not add discount codes, coupon logic, or alternative pricing. Any such change
requires an explicit product decision and full audit of billing and messaging code.
