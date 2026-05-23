# Environment Variable Audit Matrix

Every environment variable used by Quote Reclaim, with its required/optional status,
where to obtain the value, and exactly what fails when it is absent in production.

## Legend

| Symbol | Meaning |
|--------|---------|
| REQUIRED | App fails to start or route returns 5xx without this |
| OPTIONAL | Feature degrades or is disabled; app still runs |
| PUBLIC | Safe to expose to the browser; prefixed `NEXT_PUBLIC_` |
| SERVER | Never exposed to browser; server-side only |

---

## Supabase

| Variable | Scope | Status | Where to get | Failure mode when absent |
|----------|-------|--------|--------------|--------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | PUBLIC | REQUIRED | Project Settings → API → Project URL | Client-side auth breaks; app unusable |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PUBLIC | REQUIRED | Project Settings → API → anon key | Client-side auth breaks; app unusable |
| `SUPABASE_SERVICE_ROLE_KEY` | SERVER | REQUIRED | Project Settings → API → service_role key | All server actions and cron jobs fail |

**Security note:** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Never expose it to the browser.
It must only appear in server-side code (`createServiceSupabaseClient`).

---

## App URLs

| Variable | Scope | Status | Where to get | Failure mode when absent |
|----------|-------|--------|--------------|--------------------------|
| `NEXT_PUBLIC_APP_URL` | PUBLIC | REQUIRED | Your production domain, e.g. `https://quote-reclaim.vercel.app` | Auth redirects and email links point to wrong host |
| `NEXT_PUBLIC_AUTH_CALLBACK_URL` | PUBLIC | REQUIRED | `${NEXT_PUBLIC_APP_URL}/api/auth/callback` | OAuth login loop; magic link fails |

---

## Twilio (SMS)

| Variable | Scope | Status | Where to get | Failure mode when absent |
|----------|-------|--------|--------------|--------------------------|
| `TWILIO_ACCOUNT_SID` | SERVER | REQUIRED (prod) | Twilio Console → Account Info | `getMessagingService()` throws; cron returns 503; no SMS sent |
| `TWILIO_AUTH_TOKEN` | SERVER | REQUIRED (prod) | Twilio Console → Account Info | Same as above |
| `TWILIO_FROM_NUMBER` | SERVER | REQUIRED (prod) | Twilio Console → Phone Numbers | Same as above |

**Non-production behavior:** When all three Twilio vars are absent and `NODE_ENV !== production`,
the app automatically uses the in-memory simulator. No SMS is sent; sends are logged to stdout.

**Production behavior:** If any of the three vars is missing in production, `getMessagingService()`
throws. The cron route catches the error, records a `failed` cron_run, and returns 503.
No silent simulation ever happens in production.

---

## AI (Groq)

| Variable | Scope | Status | Where to get | Failure mode when absent |
|----------|-------|--------|--------------|--------------------------|
| `GROQ_API_KEY` | SERVER | REQUIRED | console.groq.com → API Keys | Message generation fails; quote creation returns error |
| `AI_WRITER_PROVIDER` | SERVER | OPTIONAL | Set to `groq` | Defaults to `groq` |
| `AI_WRITER_MODEL` | SERVER | OPTIONAL | Set to `llama-3.3-70b-versatile` | Defaults to `llama-3.3-70b-versatile` |
| `AI_FAST_PROVIDER` | SERVER | OPTIONAL | Set to `groq` | Defaults to `groq` |
| `AI_FAST_MODEL` | SERVER | OPTIONAL | Set to `llama-3.1-8b-instant` | Defaults to `llama-3.1-8b-instant` |
| `OPENAI_API_KEY` | SERVER | OPTIONAL | platform.openai.com | Not used unless provider switched; safe to omit |

---

## Lemon Squeezy (Payments)

Pick exactly one checkout mode (Mode A preferred):

### Mode A — API-created checkouts (preferred)

| Variable | Scope | Status | Where to get | Failure mode when absent |
|----------|-------|--------|--------------|--------------------------|
| `LEMONSQUEEZY_API_KEY` | SERVER | REQUIRED (Mode A) | app.lemonsqueezy.com → Settings → API | Checkout endpoint returns 503 |
| `LEMONSQUEEZY_STORE_ID` | SERVER | REQUIRED (Mode A) | Dashboard URL: `/stores/<id>` | Same as above |
| `LEMONSQUEEZY_VARIANT_ID` | SERVER | REQUIRED (Mode A) | Product page → Variants → numeric ID | Same as above |

### Mode B — Direct store URL fallback

| Variable | Scope | Status | Where to get | Failure mode when absent |
|----------|-------|--------|--------------|--------------------------|
| `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL` | PUBLIC | REQUIRED (Mode B) | Product → Share → copy URL | Checkout endpoint returns 503 |

### Always required

| Variable | Scope | Status | Where to get | Failure mode when absent |
|----------|-------|--------|--------------|--------------------------|
| `LEMONSQUEEZY_WEBHOOK_SECRET` | SERVER | REQUIRED (prod) | Lemon dashboard → Webhooks → signing secret | Webhook route returns 503; subscriptions never activate |

**Mode resolution logic:** If `LEMONSQUEEZY_API_KEY` + `LEMONSQUEEZY_STORE_ID` + `LEMONSQUEEZY_VARIANT_ID`
are all set → Mode A. Else if `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL` is set → Mode B.
Else → unavailable (returns 503).

---

## Email (optional, future channel)

| Variable | Scope | Status | Where to get | Failure mode when absent |
|----------|-------|--------|--------------|--------------------------|
| `RESEND_API_KEY` | SERVER | OPTIONAL | resend.com → API Keys | Email channel disabled; SMS-only mode |
| `RESEND_FROM_EMAIL` | SERVER | OPTIONAL | Verified sender in Resend | Same as above |

---

## Cron

| Variable | Scope | Status | Where to get | Failure mode when absent |
|----------|-------|--------|--------------|--------------------------|
| `CRON_SECRET` | SERVER | REQUIRED (prod) | Generate: `openssl rand -base64 32` | Cron routes return 503 in production; no reminders sent |

**Non-production behavior:** If `CRON_SECRET` is absent and `NODE_ENV !== production`,
cron endpoints allow all requests (no auth). This lets local dev trigger the cron
manually without a secret.

---

## Monitoring (optional)

| Variable | Scope | Status | Where to get | Failure mode when absent |
|----------|-------|--------|--------------|--------------------------|
| `SENTRY_DSN` | SERVER | OPTIONAL | sentry.io → Project → DSN | Error tracking disabled; app runs normally |
| `NEXT_PUBLIC_POSTHOG_KEY` | PUBLIC | OPTIONAL | posthog.com → Project API Key | Analytics disabled; app runs normally |
| `NEXT_PUBLIC_POSTHOG_HOST` | PUBLIC | OPTIONAL | Default: `https://us.i.posthog.com` | Uses default host |

---

## Summary: minimum required for production launch

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_AUTH_CALLBACK_URL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
GROQ_API_KEY=
LEMONSQUEEZY_API_KEY=       # or NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL
LEMONSQUEEZY_STORE_ID=      # Mode A
LEMONSQUEEZY_VARIANT_ID=    # Mode A
LEMONSQUEEZY_WEBHOOK_SECRET=
CRON_SECRET=
```
