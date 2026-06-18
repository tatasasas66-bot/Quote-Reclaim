# Real End-to-End Test Plan

Manual test plan for verifying Quote Reclaim works end-to-end in a staging or
production environment. Automated unit tests (467 total) cover pure logic.
This plan covers the user flows that require real infrastructure.

---

## Prerequisites

Before running any test, confirm:
- [ ] All required env vars are set (see `docs/ENV_VARS.md`)
- [ ] Supabase project is running with migrations applied
- [ ] Twilio number is provisioned with webhooks configured
- [ ] Billing provider is disabled (Quote Reclaim is between MoRs);
      Paywall surfaces support@quotereclaim.com instead of a checkout link
- [ ] Vercel deployment is live (or `npm run dev` for local)
- [ ] You have a real US mobile number for SMS testing

---

## Test Group 1: Authentication

### T1.1 — Sign up with magic link

1. Navigate to `/sign-up`.
2. Enter a real email address you can receive mail at.
3. Click **Send link**.
4. Open the magic link email. Click the link.
5. **Expected:** redirected to `/dashboard`. User session is active.
6. Verify in Supabase: `auth.users` row exists; `profiles` row exists with `is_paid = false`.

### T1.2 — Sign in with magic link

1. Navigate to `/sign-in`.
2. Enter the same email.
3. Click the magic link in email.
4. **Expected:** redirected to `/dashboard` with active session.

### T1.3 — Protected route without session

1. Open an incognito window. Navigate to `/dashboard`.
2. **Expected:** redirected to `/sign-in`.

---

## Test Group 2: Quote creation (free tier)

### T2.1 — Create first quote (free)

1. Sign in. Navigate to `/quotes/new`.
2. Fill in: client name, phone (real US mobile), trade, city, state, estimate amount.
3. Submit.
4. **Expected:** quote created; redirected to quote detail page.
5. Verify in Supabase: `quotes` row, `reminders` rows (Day 1, Day 3, Day 7) for this quote.

### T2.2 — Create second and third quote

Repeat T2.1 twice. Each should succeed.

### T2.3 — Paywall on fourth quote

1. Navigate to `/quotes/new`.
2. **Expected:** paywall renders (not the form).
3. Paywall copy must read: **"You've used your 3 free recovery plans."**
4. CTA button: **"Unlock unlimited recovery — $49/month"**
5. Secondary link: **"Keep viewing existing recovery plans"** → links to `/dashboard`.

---

## Test Group 3: Manual SMS send

### T3.1 — Manual send succeeds

1. Open a quote detail page with a valid US phone number.
2. A Day 1 reminder should be ready (send_at in the past).
3. Click **Send Now**.
4. **Expected:** button changes to "Sent!" after ~2 seconds.
5. Verify: SMS arrives on the target phone.
6. Verify in Supabase:
   - `outbound_messages` row: `status = 'sent'`, `provider_msg_id` populated.
   - `reminders` row: `sent = true`, `claimed_by = null`.

### T3.2 — Double-send prevention

1. With the reminder already sent, try clicking Send Now again (or re-enabling via DB).
2. **Expected:** button is disabled or returns an error; no duplicate SMS.

### T3.3 — Opt-out blocks manual send

1. Set `quotes.client_opted_out = true` in Supabase for a test quote.
2. Attempt manual send on that quote.
3. **Expected:** action returns an error; no SMS sent.

---

## Test Group 4: Cron send

### T4.1 — Cron sends due reminders

1. Set a reminder's `send_at` to a past timestamp via Supabase editor.
2. Trigger the cron manually:
   ```
   curl -X POST https://your-app.vercel.app/api/cron/send \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
3. **Expected:** response: `{ claimed: 1, sent: 1, failed: 0, skipped: 0 }`.
4. Verify: SMS arrives on phone; `reminders.sent = true`.

### T4.2 — Cron respects per-user cap

1. Create 6+ due reminders for the same user.
2. Trigger the cron.
3. **Expected:** response shows `sent ≤ 5`, `cap_deferred ≥ 1`.
4. Trigger cron again. Remaining reminders should now send.

### T4.3 — Cron self-heals stale claims

1. Manually set `claimed_by` and `claimed_at` (30+ minutes ago) on a reminder without `sent = true`.
2. Trigger the cron.
3. **Expected:** `stale_claims_released ≥ 1`; the reminder is claimed and sent this run.

---

## Test Group 5: Twilio inbound webhooks

### T5.1 — Reply received

1. Send an SMS to the quote's client phone.
2. Reply from the client phone.
3. **Expected:**
   - `outbound_messages.status` updates to `'replied'`.
   - Reminders for that quote are paused (`paused_at` set).
   - `recovery_events` row with `event_type = 'reply_received'`.

### T5.2 — STOP opt-out

1. Reply **STOP** from the client phone.
2. **Expected:**
   - `quotes.client_opted_out = true`.
   - Reminders paused.
   - `recovery_events` row with `event_type = 'opt_out'`.
3. Attempt another manual send — should be blocked.

### T5.3 — Delivery status callback

After sending an SMS:
1. Wait up to 30 seconds for Twilio to call the status callback.
2. **Expected:** `outbound_messages.status = 'delivered'` and `delivered_at` set.

---

## Test Group 6: Billing — currently disabled

Quote Reclaim is between merchants of record. The Paywall + UpgradeButton
must not call any checkout route. Re-introduce real checkout tests when a
future provider is wired up.

### T6.1 — Paywall surfaces the support email instead of a dead route

1. Hit the paywall on the 4th quote.
2. Click the CTA.
3. **Expected:** an inline status appears with a `mailto:` link to
   `support@quotereclaim.com`; the page does NOT navigate, no network
   call is made, no toast is shown, and there is no `#` jump.

### T6.2 — Manual paid activation (admin out-of-band)

1. With service-role access, set `profiles.is_paid = true` for the user.
2. Reload `/quotes/new` — the form renders, not the Paywall.
3. Set `profiles.is_paid = false`. Reload — the Paywall returns.

### T6.3 — No legacy checkout/webhook routes remain

1. Any prior provider-specific checkout / webhook routes under
   `/api/*` must return 404.
2. Grep the deployed bundle for any prior provider name. Should be zero
   hits.

---

## Test Group 7: Security checks

### T7.1 — Cron auth without secret

```bash
curl https://your-app.vercel.app/api/cron/send
# Expected: 401 or 503
```

### T7.2 — Cron auth with wrong secret

```bash
curl https://your-app.vercel.app/api/cron/send \
  -H "Authorization: Bearer wrongsecret"
# Expected: 401
```

### T7.3 — Twilio signature verification

Send a POST to `/api/webhooks/twilio/inbound` without a valid `X-Twilio-Signature` header.
**Expected:** 403.

### T7.4 — Cross-user quote access

1. Sign in as User A. Note a quote ID.
2. Sign in as User B. Navigate to `/quotes/<A's quote id>`.
3. **Expected:** 404 or redirect; User B cannot see User A's quote.

---

## Test Group 8: Weekly briefing cron

### T8.1 — Briefing cron runs

```bash
curl -X POST https://your-app.vercel.app/api/cron/weekly-briefing \
  -H "Authorization: Bearer $CRON_SECRET"
# Expected: { cron_run_id: "...", candidates: N, briefings: [...] }
```

Verify in Supabase: `cron_runs` row with `cron_name = 'weekly_briefing'`, `status = 'success'`,
`metadata.candidates ≥ 0`.

---

## Pass criteria

All tests in Groups 1–8 must pass before production launch. Any failure in
Group 7 (security) is a P0 blocker.
