-- 010_one_tap_reply.sql
-- One-Tap Reply: a secure tokenized public page where a homeowner can reply
-- to a specific estimate without composing an email — yes, a question,
-- or a clean no, plus optional contractor-approved alternative options.
--
-- Additive only: three new tables, RLS-enabled, no edits to existing tables,
-- columns, constraints, RPCs, or migrations 001-009.

-- ---------------------------------------------------------------------------
-- one_tap_reply_links — per-email-send token ledger
-- ---------------------------------------------------------------------------
-- One row per token issued. token_hash is the SHA-256 of the raw token; the
-- raw token NEVER touches the database. The same quote can have many
-- (cascade-deletable) links — one for each follow-up email it received plus
-- any minted via the contractor's "Copy link" button.

create table if not exists public.one_tap_reply_links (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  outbound_message_id uuid references public.outbound_messages(id) on delete set null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_otrl_quote on public.one_tap_reply_links(quote_id);

alter table public.one_tap_reply_links enable row level security;

-- Contractor reads links for their own quotes only. Public reply page reads
-- via the service client (RLS-bypassing) so the homeowner — who has no auth
-- session — can still resolve their token.
drop policy if exists "otr_links_select_own" on public.one_tap_reply_links;
create policy "otr_links_select_own"
  on public.one_tap_reply_links for select
  using (
    exists (
      select 1 from public.quotes q
       where q.id = one_tap_reply_links.quote_id
         and q.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- one_tap_replies — the actual replies homeowners submit
-- ---------------------------------------------------------------------------
-- answer_type CHECK enforces the closed set of intents the public page emits.
-- ip_hash stores a SHA-256 of (ip + a deployment-wide salt) so we have basic
-- abuse-protection telemetry without storing raw IP. Optional.

create table if not exists public.one_tap_replies (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  outbound_message_id uuid references public.outbound_messages(id) on delete set null,
  answer_type text not null check (answer_type in (
    'interested',
    'question',
    'not_now',
    'option_selected'
  )),
  question_text text,
  selected_option_id uuid,
  created_at timestamptz not null default now(),
  user_agent text,
  ip_hash text
);

create index if not exists idx_otr_quote_created
  on public.one_tap_replies(quote_id, created_at desc);

alter table public.one_tap_replies enable row level security;

drop policy if exists "otr_replies_select_own" on public.one_tap_replies;
create policy "otr_replies_select_own"
  on public.one_tap_replies for select
  using (
    exists (
      select 1 from public.quotes q
       where q.id = one_tap_replies.quote_id
         and q.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- one_tap_reply_options — contractor-approved alternative offers
-- ---------------------------------------------------------------------------
-- Surfaced on the homeowner page when present. amount_cents is an integer to
-- keep arithmetic exact; null means "no price shown" (e.g. "Essentials first,
-- price on request"). The app layer caps active options at two.

create table if not exists public.one_tap_reply_options (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  label text not null,
  amount_cents integer,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_otro_quote_active
  on public.one_tap_reply_options(quote_id, is_active);

alter table public.one_tap_reply_options enable row level security;

drop policy if exists "otr_opts_select_own" on public.one_tap_reply_options;
create policy "otr_opts_select_own"
  on public.one_tap_reply_options for select
  using (
    exists (
      select 1 from public.quotes q
       where q.id = one_tap_reply_options.quote_id
         and q.user_id = auth.uid()
    )
  );

drop policy if exists "otr_opts_insert_own" on public.one_tap_reply_options;
create policy "otr_opts_insert_own"
  on public.one_tap_reply_options for insert
  with check (
    exists (
      select 1 from public.quotes q
       where q.id = one_tap_reply_options.quote_id
         and q.user_id = auth.uid()
    )
  );

drop policy if exists "otr_opts_update_own" on public.one_tap_reply_options;
create policy "otr_opts_update_own"
  on public.one_tap_reply_options for update
  using (
    exists (
      select 1 from public.quotes q
       where q.id = one_tap_reply_options.quote_id
         and q.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.quotes q
       where q.id = one_tap_reply_options.quote_id
         and q.user_id = auth.uid()
    )
  );

drop policy if exists "otr_opts_delete_own" on public.one_tap_reply_options;
create policy "otr_opts_delete_own"
  on public.one_tap_reply_options for delete
  using (
    exists (
      select 1 from public.quotes q
       where q.id = one_tap_reply_options.quote_id
         and q.user_id = auth.uid()
    )
  );
