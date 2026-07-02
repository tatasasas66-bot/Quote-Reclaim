# 04 — Reply Handling System

The classifier already exists (`src/lib/auto-marketing/classify.ts`) and
is correctly suppression-first: stop/angry/not-interested words win over
everything, and AI may only classify what falls through to
`low_confidence` — never override a suppression. This doc maps the
requested categories onto it, sets auto vs. human, and supplies templates.

Master safety switch: `AUTO_SEND_SAFE_REPLIES=false` until the founder
has reviewed **50 drafts** with ≥95% agreement. Then flip to true for the
three ✅auto rows only. Everything else stays human-approved forever.

| Requested category | Classifier class | Risk | Handling | Suppress? | Opportunity tag | Alert founder |
|---|---|---|---|---|---|---|
| stop / unsubscribe | `unsubscribe` | low | 🤖 no reply sent; instant permanent suppression + suppression_list | ✅ permanent | — | no (weekly count only) |
| not interested | `not_interested` | low | 🤖 no reply; suppress | ✅ permanent | — | no |
| angry / complaint | `angry` | **high** | 👤 human only; suppress FIRST, then send apology template if warranted | ✅ permanent + domain-wide | — | **yes, immediately** |
| legal / security concern | `angry` (keywords: lawsuit, attorney, how did you get) | **high** | 👤 human only; suppress; answer honestly: public business listing source | ✅ permanent | — | **yes, immediately** |
| what is this? | `asks_how_it_works` | low | ✅ auto-draft (existing template) | no | maybe | no |
| how much? | `asks_price` | low | ✅ auto-draft ($79 answer, audit-first) | no | ✅ | no |
| is this a CRM? | `existing_crm_objection` | low | ✅ auto-draft ("not a CRM, sits beside Jobber/Housecall") | no | maybe | no |
| do I need to upload customer names? | `asks_how_it_works` (add keywords: "names", "customer data", "upload") | low | ✅ auto-draft (template below) | no | ✅ | no |
| does it text homeowners automatically? | `asks_how_it_works` (add keywords: "text them", "automatically", "my customers") | med (compliance-sensitive) | 👤 human-review draft (template below) — never auto: a wrong answer here creates a TCPA misunderstanding | no | ✅ | yes |
| send me the audit / interested | `interested` | low | ✅ auto-draft (existing) | no | ✅ | **yes** (this is the money) |
| wants a demo | `wants_demo` | low | ✅ auto-draft (audit IS the demo) | no | ✅ | yes |
| maybe later | NEW keywords → `maybe_later` (fallback today: `low_confidence`) | low | 🤖 template + 45-day snooze tag; no more sequence emails | pause 45d | ✅ soft | no |
| thinks we're lead-gen | `lead_gen_confusion` | low | ✅ auto-draft (existing "this is not lead generation") | no | maybe | no |
| wrong person | `wrong_person` | low | 👤 human-review draft (asks for right person — only send if company is A-tier, else just suppress) | soft | — | no |
| out of office | `out_of_office` | none | 🤖 ignore; sequence continues | no | — | no |
| bounce | `bounced` | med (aggregate) | 🤖 suppress + increment bounce breaker | ✅ | — | only if breaker trips |
| unknown | `low_confidence` | med | Groq fallback (build prompt #5) → if still unclear, 👤 human with drafted best-guess | no | — | daily digest |

## Templates beyond the built-ins

**"Do I need to upload customer names?"**
```
No. No names, no phone numbers, no addresses.

You type in the estimate amount and how many days it's been quiet.
That's it. The tool ranks which quote to reopen and writes the message.

Free check: https://www.quotereclaim.com/audit?c=rp1

{{sender_first_name}}
```

**"Does it text homeowners automatically?" (human-approved only)**
```
No — it never contacts your customers. Nothing goes out unless you
send it yourself.

Quote Reclaim writes the message and tells you which quote to send it
to first. You copy it into your own texts, from your own phone.

Free check: https://www.quotereclaim.com/audit?c=rp2

{{sender_first_name}}
```

**"Maybe later"**
```
No problem — it'll still be there. One thing worth doing today anyway:
the free check takes 60 seconds and at least tells you what's sitting
quiet right now. https://www.quotereclaim.com/audit?c=rp3

I'll leave you alone either way.

{{sender_first_name}}
```

**Angry (human-sent, after suppression is already done)**
```
Understood — you're removed and you won't hear from me again.

For what it's worth: your contact came from your public business
listing, and this was a one-founder note, not a list blast. Apologies
for the interruption.
```

**PLAYBOOK keyword (from email 3 — fully automated fulfillment)**
```
Here they are — the 7 reopen texts, no link needed:

1. Day 3: "Hi {name}, wanted to make sure the estimate came through
   OK. Happy to answer anything." 
2. Day 7: "Still holding your spot for the {job}. If timing moved,
   no problem — just let me know what changed."
3. Day 14 (price stall): "If the number was the sticking point, there
   are usually one or two places we can adjust scope. Want me to?"
4. Day 21 (season): "Heads up — the schedule's filling for {month}.
   If you want this done before then, now's the window."
5. After silence on 1–3: "Should I close this one out? No hard
   feelings — just keeping my board honest."
6. Referral close: "If the project's off, no worries — know anyone
   who needs {trade} work this season?"
7. Revival (60d+): "We're back in {area} on another job next week —
   if you still want the {job}, I can fold you into that trip and
   save you the mobilization cost."

If you want these ranked against your actual quiet quotes — which one
to send, to which estimate, today — that's what the free check does:
https://www.quotereclaim.com/audit?c=pbk

{{sender_first_name}}
```

## Escalation mechanics

- "Alert founder" = email to the founder's personal inbox (Resend, free
  tier) containing: lead, company, full reply text, classification,
  confidence, and the pre-written draft. Founder replies by
  approving/editing in `/admin` (drafts queue already renders in the
  admin UI).
- Daily digest (not per-item) for `low_confidence`; immediate send for
  `interested`, `wants_demo`, `angry`, legal keywords.
- SLA that matters: `interested` replies answered same business day —
  the auto-draft makes that possible even with weak English: the words
  are pre-written; the founder only clicks approve.

## Suppression rules (restated as absolutes)

1. unsubscribe/angry/not_interested → permanent, global, domain-wide
   (never email anyone else @ that company's domain).
2. Suppression survives niche pivots, new campaigns, re-scrapes — the
   email hash lives in `suppression_list` forever.
3. A signed-up user is auto-suppressed from ALL marketing campaigns.
4. Bounces suppress the address and score the source batch: a source
   batch with >5% bounces gets its remaining unverified leads re-verified
   before any send.
