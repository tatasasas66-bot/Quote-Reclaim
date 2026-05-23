# Supabase Auth Setup Checklist

Step-by-step guide to configure Supabase authentication and database for Quote Reclaim.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → choose a region close to your users.
3. Note the **Project URL** and both API keys once the project is ready.

---

## 2. Set environment variables

From **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   (anon/public key)
SUPABASE_SERVICE_ROLE_KEY=eyJ...       (service_role key — keep secret)
```

**The service_role key bypasses RLS.** It must only be used in server-side code.
Never expose it in client bundles or commit it to source control.

---

## 3. Run migrations

All database schema, RLS policies, and stored procedures are managed via migration
files in `supabase/migrations/`. Apply them in order:

```bash
npx supabase db push
```

Or if using the Supabase CLI directly:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Verify the following tables exist after migration:
- `profiles`
- `quotes`
- `reminders`
- `recovery_events`
- `outbound_messages`
- `cron_runs`
- `subscriptions`

Verify these RPC functions exist:
- `claim_due_reminders(p_cron_run_id uuid)`
- `claim_reminder_manual(p_reminder_id uuid, p_cron_run_id uuid)`
- `toggle_sequence_pause(p_sequence_id uuid, p_paused boolean)`
- `mark_quote_won(p_quote_id uuid)`
- `check_and_increment_usage(p_user_id uuid)`

---

## 4. Configure Auth settings

In the Supabase dashboard → **Authentication → URL Configuration**:

| Setting | Value |
|---------|-------|
| Site URL | `https://quote-reclaim.vercel.app` |
| Redirect URLs | `https://quote-reclaim.vercel.app/api/auth/callback` |

Without the correct redirect URL, magic links and OAuth logins will fail with
a redirect URI mismatch error.

**For local development**, also add:
```
http://localhost:3000/api/auth/callback
```

---

## 5. Configure email auth

Quote Reclaim uses magic link (email OTP) authentication by default.

In **Authentication → Providers → Email**:
- Confirm Sign In: enabled
- Secure Email Change: enabled
- Double Confirm Email Change: optional

**Custom SMTP (recommended for production):**

Supabase's built-in email is rate-limited and branded as Supabase. Configure
a custom SMTP server for production deliverability:

1. **Authentication → SMTP Settings** → enable custom SMTP.
2. Use any transactional email provider (Resend, Postmark, SendGrid, etc.).
3. Set: host, port, username, password, sender name, sender email.

Without custom SMTP, magic link emails may hit the Supabase rate limit under load
or land in spam due to Supabase branding.

---

## 6. Configure Row Level Security

RLS is enforced for all user-facing tables. The migrations apply the policies.
After running migrations, verify in **Table Editor → [table] → RLS**:

| Table | Expected policy |
|-------|----------------|
| `profiles` | Users can only read/update their own row |
| `quotes` | Users can only CRUD their own quotes |
| `reminders` | Users can only read their own reminders |
| `recovery_events` | Users can only read their own events |
| `outbound_messages` | Users can only read their own messages |
| `subscriptions` | Users can only read their own subscription |
| `cron_runs` | No user-level RLS (service_role only) |

Cron and webhook routes use `createServiceSupabaseClient()` which bypasses RLS.
User-facing routes use `createServerSupabaseClient()` scoped to the authenticated user.

---

## 7. Verify the `profiles` table trigger

New users must have a `profiles` row created automatically on sign-up.
The migration should include a trigger like:

```sql
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, is_paid)
  values (new.id, false);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

Test by signing up a new user and confirming a `profiles` row exists with `is_paid = false`.

---

## 8. Local development setup

```bash
# Start Supabase locally
npx supabase start

# Apply migrations
npx supabase db push

# Note local credentials output by `supabase start`:
# API URL: http://localhost:54321
# anon key: eyJ...
# service_role key: eyJ...
```

Update `.env.local` (never committed) with the local credentials.

---

## 9. Production verification checklist

- [ ] Project URL and anon key set in Vercel env vars
- [ ] Service role key set in Vercel env vars (server env only, not preview scope)
- [ ] Site URL and redirect URL configured in Auth settings
- [ ] All migrations applied (`supabase db push`)
- [ ] RLS enabled on all user tables
- [ ] `profiles` trigger fires on new user creation
- [ ] Custom SMTP configured (or accept Supabase rate limits)
- [ ] Magic link login works end-to-end
