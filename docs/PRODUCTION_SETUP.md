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
| Lemon Squeezy | Subscriptions + paywall | Yes |
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

## Step 5: Lemon Squeezy

Follow `docs/LEMON_SETUP.md`.

Minimum:
- $79/month product and variant created
- Checkout mode chosen (Mode A preferred)
- Env vars set
- Webhook endpoint added with all subscription events
- Webhook secret set
- Test checkout flow passed (test mode)

---

## Step 6: Cron secret

Generate a secure random secret:

```bash
openssl rand -base64 32
```

Set it as `CRON_SECRET` in Vercel.

The `vercel.json` crons run on Vercel's scheduler and include this secret
automatically in the `Authorization` header. You do not need to pass it manually
for scheduled runs.

For manual triggers (testing, backfill):
```bash
curl -X POST https://your-app.vercel.app/api/cron/send \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Step 7: Verify cron schedule

`vercel.json` configures two cron jobs:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `/api/cron/send` | Every 15 minutes | Send due reminders |
| `/api/cron/weekly-briefing` | Mondays at 13:00 UTC | Compute weekly recovery snapshot |

Verify in Vercel dashboard under **Settings → Cron Jobs** that both appear
and have a successful recent run after deployment.

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
4. Complete a test checkout (Lemon test mode or lowest real charge).
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
- `src/lib/payments/lemonsqueezy.ts`: `MONTHLY_PRICE_USD = 79`, `FREE_PLAN_LIMIT = 3`
- `src/components/billing/Paywall.tsx`: hardcoded copy
- `src/lib/quotes/actions.ts`: `check_and_increment_usage` RPC gating

Do not add discount codes, coupon logic, or alternative pricing. Any such change
requires an explicit product decision and full audit of billing and messaging code.
