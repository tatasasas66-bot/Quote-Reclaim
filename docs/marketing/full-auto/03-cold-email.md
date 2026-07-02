# 03 — Cold Email Campaign

The email has ONE job: get one click to `/audit`. It does not sell the
SaaS, the price, or the feature list. Rules enforced everywhere below:
plain text · no images · no attachments · no open pixel · no click-track
rewrite · one raw link · real sender name · postal address · plain-word
opt-out · no fake personalization · no claim we saw their estimates · no
"AI-powered", "boost revenue", "streamline" · no fake urgency · no
guarantees.

**Personalization tokens (only real data):** `{{first_name}}` (from ROC
qualifying party or website — if unknown, the copy is written to work
without a greeting), `{{company_name}}`, `{{city}}`. Nothing else. A
wrong "Hi Mike" is worse than no greeting.

**Link strategy:** raw URL, no hyperlink text, compact attribution param
(PostHog auto-captures it; audit_events logs it):
`https://www.quotereclaim.com/audit?c=pc1e1`
(`pc1`=phx-concrete-v1, `e1`=email 1; painters `pp1`, fence `pf1`,
HVAC `ph1`).

---

## PRIMARY — Concrete, 4-email sequence (recommended)

The existing 3-step sequence in `src/lib/marketing/sequence.ts` has the
right voice. This v2 keeps its best lines, tightens length (every email
under 120 words), and adds a day-16 breakup. Days: **0 · 3 · 8 · 16**.

### Email 1 — day 0
**Subject:** `the quote in your truck`
**Preview (first line does this job):** `You drove out. Measured it. Priced it. Sent it. Then nothing.`

```
You drove out. Measured it. Priced the work. Sent the quote.

Then it went quiet.

Quiet is not always dead. On a $6,000 driveway, most homeowners go
silent because they're figuring out the money — not because they hate
your number.

Before you buy another lead this week, check the estimates you already
paid to create. Type in 3 old quote amounts and how long each has been
quiet. It tells you which one to reopen first and what to text today.

No names. No phone numbers. No card. No signup.

https://www.quotereclaim.com/audit?c=pc1e1

{{sender_first_name}}
Quote Reclaim
{{postal_address}}
Reply "stop" and I won't email you again.
```

### Email 2 — day 3 (the "what do I even say" angle)
**Subject:** `Re: the quote in your truck`

```
Most concrete guys never follow up on a quiet quote because there's
nothing to say that doesn't sound desperate.

"So... you ready to do the driveway?"

Feels like begging. So the quote just dies in the truck.

That's the expensive part: buying a new lead feels like progress.
Reopening an old quote feels like rejection. The math says the old
quote wins — they already met you, already let you on the property.

This shows you which quiet quote to reopen first and gives you the
exact text — one that doesn't sound cheap:

https://www.quotereclaim.com/audit?c=pc1e2

{{sender_first_name}}
Quote Reclaim
{{postal_address}}
Reply "stop" and I won't email you again.
```

### Email 3 — day 8 (the math angle + reply bait)
**Subject:** `Re: the quote in your truck`

```
Quick math.

A shared concrete lead in Phoenix runs $40–$100, answers the phone
maybe half the time, and is shopping four other guys.

The homeowner from your March estimate already picked you off a truck,
a review, or a referral. Reopening that quote costs one text.

Three old quote amounts + days quiet. 60 seconds. It ranks them and
writes the text:

https://www.quotereclaim.com/audit?c=pc1e3

If you want the follow-up texts without the tool, reply PLAYBOOK and
I'll send the list — no link, just the texts.

{{sender_first_name}}
Quote Reclaim
{{postal_address}}
Reply "stop" and I won't email you again.
```

(The PLAYBOOK keyword creates replies. Replies are the single strongest
deliverability signal a new domain can earn — see `08-growth-ideas.md`
idea #3 for the automated fulfillment.)

### Email 4 — day 16 (breakup, permission close)
**Subject:** `closing this out`

```
Last one from me.

If quiet estimates aren't a problem in your business, ignore this and
I'm gone.

If there are a few sitting in the truck right now — a patio from April,
a driveway from May — this takes 60 seconds and shows which one is
still alive:

https://www.quotereclaim.com/audit?c=pc1e4

Either way, good pours.

{{sender_first_name}}
Quote Reclaim
{{postal_address}}
Reply "stop" and I won't email you again.
```

---

## 6-email variant — built, NOT recommended for launch

Add: day 24 "one thing we see in Phoenix audits" (aggregate insight,
requires ≥50 audits of data — honest only after month 2) and day 35
seasonal re-open ("monsoon season pause = homeowners resurfacing").
**Why not now:** on a ~300-lead universe, emails 5–6 raise complaint risk
faster than they raise replies, and the leads are better recycled into
the fence/painter tests. Turn on in month 2 for B-tier only if complaint
rate is 0 and reply rate ≥2%.

## Short first-touch (A/B against Email 1; also the seed-test email)

**Subject:** `old estimates`

```
You priced it. You sent it. It went quiet.

Quiet is not always dead. This free check tells you which old estimate
to reopen first and what to text today — no names, no card, no signup:

https://www.quotereclaim.com/audit?c=pc1s1

{{sender_first_name}} — Quote Reclaim
{{postal_address}}
Reply "stop" and I won't email you again.
```

---

## HVAC replacement variant (deploy September — see 02)

**Subject:** `the changeout that went quiet`

```
You did the load calc. Quoted the changeout. Homeowner said "we need
to think about it."

That was three weeks ago.

A $12,000 replacement quote doesn't die — it stalls at sticker shock
while they limp the old unit along. The contractor who sends one calm,
useful follow-up usually gets the job. The one who waits gets the
"we went with someone else" text in October.

Type in 3 quiet replacement quotes and how long they've been silent.
It ranks them and writes today's follow-up:

https://www.quotereclaim.com/audit?c=ph1e1

No names. No card. No signup.

{{sender_first_name}}
Quote Reclaim
{{postal_address}}
Reply "stop" and I won't email you again.
```

## Painter variant (experimental batch, week 3)

**Subject:** `the bid they never answered`

```
Ten estimates a month, three yeses, and the rest just... nothing.

Painting bids go quiet more than any trade — homeowners collect three
numbers and stall. Most of those jobs still happen. The question is
whose bid gets remembered when they finally pick a weekend.

Put in 3 quiet bids and how long they've been silent. It tells you
which to reopen first and what to text today:

https://www.quotereclaim.com/audit?c=pp1e1

No names. No card. No signup.

{{sender_first_name}}
Quote Reclaim
{{postal_address}}
Reply "stop" and I won't email you again.
```

## Fence variant (backup niche)

**Subject:** `the fence quote from May`

```
Three guys bid the same fence. The homeowner went quiet on all three.

Whoever sends one decent follow-up this week probably gets it — fences
don't get un-needed, they get postponed.

Put in 3 quiet quotes and how long they've been silent. It ranks them
and writes the text:

https://www.quotereclaim.com/audit?c=pf1e1

No names. No card. No signup.

{{sender_first_name}}
Quote Reclaim
{{postal_address}}
Reply "stop" and I won't email you again.
```

---

## Subject line bank (all lowercase, zero salesmanship)

Primary set: `the quote in your truck` · `old estimates` · `the driveway
bid from May` · `quiet quotes` · `closing this out` (breakup only)
Test set: `before the next lead` · `the estimate they never answered` ·
`$14,000 sitting quiet` (only when true from aggregate audit data) ·
`not a CRM` (objection-preempt; test in email 2 slot)
Banned: anything with caps, "!", "%", "free", "opportunity", their
company name in subject (mail-merge smell), fake "Re:" on email 1.

("Re:" on emails 2–3 of a real thread is fine — Smartlead sends
follow-ups in-thread, so the Re: is genuine.)

## Preview-line rule

No hidden preheader HTML (plain text!). The first sentence IS the
preview. Every email 1 first sentence must pass this test: readable
alone on a phone lock screen and specific to the trade.

## Follow-up logic

- Stop-on-reply: ANY reply halts the sequence (Smartlead native).
- Stop-on-click + audit completion: lead who completed the audit is
  moved out of cold sequence into the product's own nurture (they're a
  prospect now, not a cold lead).
- Bounce: sequence stops, lead suppressed, counts toward breaker.
- No re-enrollment: a lead exits this campaign forever when done. The
  same human may be re-approached ONCE, ≥90 days later, in a different
  campaign with different copy — never before.

## A/B test matrix (one variable at a time, 100+ sends per arm)

| Test | Arm A | Arm B | Metric | Decision rule |
|---|---|---|---|---|
| T1 (wk 3) | Subject `the quote in your truck` | `old estimates` | reply+click rate | ≥1.5× winner after 100/arm, else keep A |
| T2 (wk 4) | Email 1 long (primary) | Short first-touch | click rate | winner becomes default e1 |
| T3 (wk 5) | East Valley cluster | West Valley cluster | audit completions | winner gets 70% of sends |
| T4 (wk 5–6) | Concrete | Painter batch | audit completions per 100 sends | decides month-2 niche mix |
| T5 (wk 6) | e3 with PLAYBOOK bait | e3 without | reply rate + deliverability drift | keep bait if replies ≥2× and 0 complaints |

Never test two variables in the same week. Log every test in the
`experiments` table; the Monday report computes the verdict.

## Footer / compliance block (every email, non-negotiable)

```
{{sender_first_name}}
Quote Reclaim
{{postal_address}}
Reply "stop" and I won't email you again.
```

- CAN-SPAM: real physical postal address (env `COMPLIANCE_POSTAL_ADDRESS`
  — cron fails closed without it, correct), honest From (real founder
  name, quotereclaim outbound domain), no deceptive subjects, opt-out
  honored immediately and permanently (suppression_list), sender
  identity never hidden.
- "Reply stop" outperforms an unsubscribe link for tiny-volume plain-text
  sending AND generates a reply signal. The classifier already treats
  stop/unsubscribe/remove as permanent suppression, deterministically,
  before any other classification (see `classify.ts`).
