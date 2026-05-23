# Twilio Setup Checklist

Step-by-step guide to configure Twilio for Quote Reclaim SMS delivery.

---

## 1. Create a Twilio account

1. Go to [twilio.com](https://www.twilio.com) and sign up.
2. Verify your email and phone number.
3. From the Twilio Console home, note your **Account SID** and **Auth Token**.

---

## 2. Provision a phone number

1. In the Console: **Phone Numbers → Manage → Buy a number**.
2. Choose a US number with SMS capability.
3. Note the number in **E.164 format** (e.g. `+14155551234`).

**A2P 10DLC (required for US production SMS):**

Twilio requires A2P 10DLC registration before delivering messages to US numbers at volume.
Complete this in the Console under **Messaging → Regulatory Compliance → A2P 10DLC**:
- Register your brand (business name, EIN, website).
- Create a campaign (use case: "Customer Care" or "Mixed").
- Link the campaign to your phone number.

Allow 1–5 business days for carrier approval. Without registration, messages
may be filtered or blocked by US carriers.

---

## 3. Set environment variables

Add these to your Vercel project (Settings → Environment Variables):

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+14155551234
```

**Never use `TWILIO_PHONE_NUMBER`** — the app reads `TWILIO_FROM_NUMBER` exactly.

---

## 4. Configure inbound webhook URL

In the Twilio Console:

1. **Phone Numbers → Manage → Active numbers → click your number**.
2. Under **Messaging → A message comes in**:
   - Set to **Webhook**.
   - URL: `https://quote-reclaim.vercel.app/api/webhooks/twilio/inbound`
   - Method: **HTTP POST**
3. Save.

This endpoint handles inbound replies and STOP/opt-out keywords.

---

## 5. Configure status callback URL

Status callbacks report delivery success, failure, and undelivered states.

In the Twilio Console:

1. **Messaging → Settings → General** → look for **Status Callback URL** (or configure per-send).

The app sends the status callback URL per-message at send time — it is embedded in the
`StatusCallback` parameter of the Twilio API call. You do not need to configure a
global default unless your Twilio account requires it.

Status callback endpoint:
```
https://quote-reclaim.vercel.app/api/webhooks/twilio/status
```

---

## 6. Verify signature checking

The app uses HMAC-SHA1 to verify every inbound webhook from Twilio.

In production:
- `TWILIO_AUTH_TOKEN` present → signature verified; unsigned requests return 403.
- `TWILIO_AUTH_TOKEN` absent → route returns 503 (fail-closed).

To test signature verification locally, use the Twilio CLI or Ngrok with a real
account and supply the auth token.

---

## 7. STOP / opt-out test

After deployment:

1. Send a real SMS to a quote's client phone (via manual send or cron).
2. Reply **STOP** from the client number.
3. Verify in Supabase:
   - The `quotes` row for that client has `client_opted_out = true`.
   - The `reminders` rows for that quote have `paused_at` set.
   - A `recovery_events` row with `event_type = 'opt_out'` was inserted.
4. Send another manual SMS to the same client — it should be skipped (opt-out guard).

Twilio also manages its own opt-out list. After a STOP, Twilio will block further
messages to that number regardless of app state.

---

## 8. Production smoke test

After env vars are set and webhooks configured:

1. Create a quote with a valid US mobile number as `client_phone`.
2. Use the **Send Now** button (manual send) on the quote detail page.
3. Confirm the SMS arrives on the phone within ~30 seconds.
4. Check `outbound_messages` in Supabase: row with `status = 'sent'` and a `provider_msg_id`.
5. Wait for Twilio status callback: `outbound_messages.status` should update to `'delivered'`.
6. Reply to the SMS. Check `outbound_messages.status` updates to `'replied'`.

---

## Environment variable reference

| Variable | Example | Required |
|----------|---------|---------|
| `TWILIO_ACCOUNT_SID` | `ACxxxxxx` | Yes |
| `TWILIO_AUTH_TOKEN` | 32-char hex | Yes |
| `TWILIO_FROM_NUMBER` | `+14155551234` | Yes |

---

## Failure modes

| Condition | Behavior |
|-----------|---------|
| All three vars absent, non-production | Simulator used; no real SMS sent |
| Any var absent, production | `getMessagingService()` throws; cron returns 503 |
| Wrong `TWILIO_FROM_NUMBER` name | Provider not configured; fails closed |
| Invalid auth token | Twilio API returns 401; `SmsResult.ok = false`; claim released for retry |
| A2P not registered | Messages silently filtered by US carriers |
