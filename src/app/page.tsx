import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  MessageSquareText,
  NotepadText,
  Target,
  Trophy,
} from "lucide-react";
import { Badge, Logo } from "@/components/ui";
import { PAYWALL_PRICE_LABEL } from "@/lib/payments/entitlement";

export const metadata: Metadata = {
  title: "Quote Reclaim - Quiet estimate recovery for contractors",
  description:
    "Before buying another lead, work the estimates you already sent. Run a free audit, then keep quiet estimates moving until they book or close.",
};

const trustPills = ["No names", "No phone numbers", "No card", "Result first"] as const;

const bridgeSteps = [
  {
    step: "01",
    title: "Run free audit",
    body: "See which sent estimate to chase first.",
  },
  {
    step: "02",
    title: "Save the recovery plan",
    body: "Keep the message and order ready.",
  },
  {
    step: "03",
    title: "Work quiet estimates every week",
    body: "Move quotes until they book or close.",
  },
] as const;

const auditOutputs = [
  "total quiet estimate value",
  "estimate to follow up first",
  "recovery window",
  "why this one first",
  "message to send today",
  "follow-up order",
  "next move",
] as const;

const sequenceSteps = [
  {
    day: "Day 1",
    title: "Estimate check",
    body: "Reopens the estimate with one specific question to answer.",
  },
  {
    day: "Day 3",
    title: "Schedule check",
    body: "Asks whether the estimate should stay active or move off the list.",
  },
  {
    day: "Day 7",
    title: "Scope rescue",
    body: "Offers a smaller path if scope, timing, or total is holding it up.",
  },
  {
    day: "Day 14",
    title: "Decision check",
    body: "Turns silence into a simple active, paused, or closed choice.",
  },
  {
    day: "Day 30",
    title: "Clean closeout",
    body: "Lets you move on cleanly while leaving the door open.",
  },
] as const;

const commandRows = [
  {
    estimate: "$9,000",
    age: "5 days quiet",
    window: "Warm",
    next: "Send today",
    status: "Follow-up 1 ready",
  },
  {
    estimate: "$3,200",
    age: "14 days quiet",
    window: "Warm",
    next: "Follow up next",
    status: "Queued after first",
  },
  {
    estimate: "$2,300",
    age: "31 days quiet",
    window: "Cold",
    next: "Light check-in",
    status: "Close-loop angle",
  },
] as const;

const comparison = [
  {
    label: "CRM / field-service app",
    points: [
      "runs the business",
      "schedules jobs",
      "sends invoices",
      "manages customers",
    ],
  },
  {
    label: "Estimating app",
    points: [
      "creates estimates",
      "sends proposals",
      "handles approvals",
      "keeps estimate files",
    ],
  },
  {
    label: "Quote Reclaim",
    points: [
      "ranks sent estimates",
      "tells you who to follow up first",
      "gives you the message to send today",
      "helps work quiet estimates until they book or close",
    ],
  },
] as const;

const trades = [
  ["Painting", "many estimates, many no-replies"],
  ["Remodeling", "high-ticket projects go quiet"],
  ["Roofing", "big estimates need timely follow-up"],
  ["HVAC", "replacement quotes need fast timing"],
  ["Plumbing", "quoted work gets delayed and forgotten"],
  ["Fencing", "seasonal demand creates follow-up windows"],
  ["Landscaping", "crew gaps matter"],
] as const;

const faqs = [
  {
    q: "Is Quote Reclaim a CRM?",
    a: "No. It does not run your business, schedule jobs, send invoices, or replace your customer system. It focuses on sent estimates that went quiet.",
  },
  {
    q: "Is this only for painters?",
    a: "No. Painting is a strong fit, but Quote Reclaim is built for estimate-heavy home-service contractors across trades.",
  },
  {
    q: "Do I need customer names?",
    a: "No. The free audit works with estimate amount and days quiet only.",
  },
  {
    q: "Do I need phone numbers?",
    a: "No. You can see the audit result without customer names, phone numbers, or a card.",
  },
  {
    q: "Do I need to sign up before seeing the audit result?",
    a: "No. Run the audit first. Create an account only if you want to save the plan and keep working quiet estimates.",
  },
  {
    q: "Will Quote Reclaim message customers for me?",
    a: "The free audit gives you a message to send. In the app, use the message sequence to copy, send, and mark progress.",
  },
  {
    q: "What if I already use Jobber, Housecall Pro, DripJobs, or a spreadsheet?",
    a: "Keep it. Quote Reclaim is the quiet-estimate recovery layer, not a replacement for the system you already use.",
  },
  {
    q: "Why would I pay monthly after the audit?",
    a: "The audit gives you the first move. The paid app is for contractors who want to keep working sent estimates every week, save message sequences, fill crew gaps, and track which follow-ups turn into booked work.",
  },
  {
    q: "Can Quote Reclaim promise I win the job?",
    a: "No. No software can promise a job back. Quote Reclaim helps you act on sent estimates instead of guessing or forgetting.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-canvas text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle/70 pb-4">
          <Logo showWordmark />
          <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold">
            <a
              href="#recovery-system"
              className="rounded text-ink-muted transition hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Recovery system
            </a>
            <Link
              href="/sign-in"
              className="rounded text-ink-muted transition hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Sign in
            </Link>
          </nav>
        </header>

        <section className="grid min-w-0 gap-7 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-10">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Quiet estimate recovery
            </p>
            <h1 className="mt-4 max-w-3xl text-balance text-[length:clamp(2.1rem,4.4vw,3.95rem)] font-black leading-[1.02] text-ink-strong">
              Turn sent estimates into booked work before buying another lead.
            </h1>
            <p className="mt-4 max-w-2xl break-words text-base leading-7 text-ink sm:text-lg">
              Quote Reclaim shows home-service contractors which quiet estimate
              to follow up first, what message to send today, and how to keep
              every sent estimate moving until it books or closes.
            </p>
            <p className="mt-3 max-w-xl break-words text-sm leading-6 text-ink-muted">
              Run a free 60-second estimate audit. If it helps, save the plan
              and keep working quiet estimates every week.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/audit"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-5 py-3 text-base font-semibold text-canvas shadow-[0_0_42px_rgba(217,111,50,0.28)] transition-colors hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                Run the free estimate audit
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href="#recovery-system"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line-strong bg-surface-1 px-5 py-3 text-base font-semibold text-ink-strong transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                See the recovery system
              </a>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {bridgeSteps.map((item) => (
                <div
                  key={item.step}
                  className="rounded-lg border border-line-subtle/80 bg-surface-1/70 px-3 py-3"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand">
                    {item.step}
                  </p>
                  <p className="mt-1 text-sm font-black text-ink-strong">
                    {item.title}
                  </p>
                  <p className="mt-1 break-words text-xs leading-5 text-ink-muted">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
            <div
              aria-label="Free audit trust line"
              className="mt-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-widest text-ink-muted"
            >
              {trustPills.map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-line-subtle bg-surface-1 px-3 py-2"
                >
                  {pill}
                </span>
              ))}
            </div>
            <p className="mt-3 max-w-xl text-sm font-semibold text-ink-muted">
              Built for US home-service contractors. {PAYWALL_PRICE_LABEL}{" "}
              after the free audit - first 3 quotes free, no card needed.
            </p>
          </div>

          <HeroProductPreview />
        </section>
      </div>

      <SectionShell id="expensive-leak" eyebrow="The expensive leak">
        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <SectionHeading
            title="Sent estimates go quiet. That does not mean they are dead."
            body="Contractors spend time driving out, scoping work, pricing estimates, and sending proposals. Then many prospects go quiet. Most businesses either forget to follow up or guess randomly."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <SignalCard
              icon={<NotepadText className="h-5 w-5" aria-hidden="true" />}
              title="You already did the work"
              body="The visit, measurements, scope, and price are already done."
            />
            <SignalCard
              icon={<MessageSquareText className="h-5 w-5" aria-hidden="true" />}
              title="Silence is unclear"
              body="They may be comparing, busy, waiting, or simply forgot."
            />
            <SignalCard
              icon={<Target className="h-5 w-5" aria-hidden="true" />}
              title="The next move matters"
              body="A quiet estimate needs a clear follow-up order, not random chasing."
            />
          </div>
        </div>
      </SectionShell>

      <SectionShell id="audit-doorway" eyebrow="Free audit">
        <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <SectionHeading
            title="The free audit shows what to do today."
            body="Enter 3 sent estimates and days quiet. Quote Reclaim gives you the first recovery move before you create an account."
          />
          <div className="rounded-2xl border border-line-subtle bg-surface-1 p-4 sm:p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {auditOutputs.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-lg border border-line-subtle bg-canvas/55 px-3 py-2 text-sm font-semibold text-ink"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-money" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
            <Link
              href="/audit"
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-4 py-2 text-sm font-bold text-canvas transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Run the free audit
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </SectionShell>

      <SectionShell id="recovery-system" eyebrow="Paid product">
        <div className="grid gap-7 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <SectionHeading
            title="The audit is the doorway. Quote Reclaim is the recovery system."
            body="The audit gives you the first move. The app helps you keep working sent estimates after that - follow-up order, message sequences, crew-gap opportunities, and wins."
          />
          <SystemPreview />
        </div>
      </SectionShell>

      <SectionShell id="silent-quote-command" eyebrow="Command center">
        <div className="grid gap-7 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <SectionHeading
            title="Silent Quote Command"
            body="This is the core screen: the quiet quote, the money, the next move, and the message to send today. No guessing. No digging through old texts."
          />
          <CommandTable />
        </div>
      </SectionShell>

      <SectionShell id="sequence" eyebrow="Recovery sequence">
        <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <SectionHeading
            title="Do not stop after one follow-up."
            body="Copy, send, and mark progress. The sequence keeps the next message ready so the estimate does not disappear after one try."
          />
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {sequenceSteps.map((step) => (
              <li
                key={step.day}
                className="rounded-2xl border border-line-subtle bg-surface-1 p-4"
              >
                <p className="text-xs font-black uppercase tracking-widest text-brand">
                  {step.day}
                </p>
                <h3 className="mt-3 text-base font-black text-ink-strong">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </SectionShell>

      <SectionShell id="crew-gap-rescue" eyebrow="Crew Gap Rescue">
        <div className="grid gap-7 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <SectionHeading
            title="Got an open crew day? Start with estimates you already sent."
            body="When next week has a gap, Quote Reclaim helps you find the quiet estimate most worth reopening to fill the schedule."
          />
          <CrewGapPreview />
        </div>
      </SectionShell>

      <SectionShell id="got-the-job" eyebrow="Win loop">
        <div className="grid gap-7 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
          <SectionHeading
            title="Mark the wins. See what came back."
            body="When a quiet estimate turns into booked work, mark it as Got the Job. Quote Reclaim helps you see which follow-ups created real revenue."
          />
          <GotJobPreview />
        </div>
      </SectionShell>

      <SectionShell id="not-crm" eyebrow="Focused by design">
        <div className="grid gap-7 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <SectionHeading
            title="Not another CRM. Not another estimating app."
            body="Keep Jobber, Housecall Pro, DripJobs, spreadsheets, or whatever you already use. Quote Reclaim only focuses on one expensive leak: sent estimates that go quiet."
          />
          <div className="grid gap-3 md:grid-cols-3">
            {comparison.map((column) => (
              <article
                key={column.label}
                className={`rounded-xl border p-4 ${
                  column.label === "Quote Reclaim"
                    ? "border-brand/45 bg-brand/10 shadow-[0_0_32px_rgba(217,111,50,0.12)]"
                    : "border-line-subtle bg-surface-1/70"
                }`}
              >
                <h3
                  className={`text-sm font-black uppercase tracking-widest ${
                    column.label === "Quote Reclaim"
                      ? "text-brand"
                      : "text-ink-strong"
                  }`}
                >
                  {column.label}
                </h3>
                <ul className="mt-4 grid gap-2 text-sm leading-6 text-ink-muted">
                  {column.points.map((point) => (
                    <li
                      key={point}
                      className="flex gap-2 rounded-lg border border-line-subtle/70 bg-canvas/35 px-3 py-2"
                    >
                      <span
                        className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                          column.label === "Quote Reclaim"
                            ? "bg-brand"
                            : "bg-ink-muted"
                        }`}
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </SectionShell>

      <SectionShell id="trades" eyebrow="Home services">
        <div className="grid gap-7 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <SectionHeading
            title="Built for estimate-heavy home services."
            body="Quote Reclaim is strongest when a contractor sends estimates often and quiet follow-up can decide whether work books or disappears."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trades.map(([trade, reason]) => (
              <article
                key={trade}
                className="rounded-xl border border-line-subtle bg-surface-1/75 p-4"
              >
                <h3 className="font-black text-ink-strong">{trade}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-muted">{reason}</p>
              </article>
            ))}
          </div>
        </div>
      </SectionShell>

      <SectionShell id="price-math" eyebrow="Price math">
        <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <SectionHeading
            title="One recovered job can make the math obvious."
            body={`Quote Reclaim is ${PAYWALL_PRICE_LABEL}. One recovered estimate can cover it many times over.`}
          />
          <PriceMathCard />
        </div>
      </SectionShell>

      <SectionShell id="faq" eyebrow="Straight answers">
        <div className="grid gap-7 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <SectionHeading
            title="What contractors usually need to know first."
            body="Short answers, no invented proof, no promise that software can make every estimate come back."
          />
          <div className="grid gap-3">
            {faqs.map((item) => (
              <article
                key={item.q}
                className="rounded-2xl border border-line-subtle bg-surface-1 p-4"
              >
                <h3 className="font-black text-ink-strong">{item.q}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-muted">{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </SectionShell>

      <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-brand/35 bg-surface-1 p-6 sm:p-8">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-brand">
                Start with the estimates already sent
              </p>
              <h2 className="mt-3 max-w-3xl text-balance text-3xl font-black leading-tight text-ink-strong sm:text-4xl">
                Before buying another lead, check the estimates you already sent.
              </h2>
              <p className="mt-3 text-sm font-semibold text-ink-muted">
                No names. No phone numbers. No card. See your result first.
              </p>
            </div>
            <Link
              href="/audit"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-5 py-3 text-base font-semibold text-canvas transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Run the free estimate audit
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line-subtle/80 px-4 py-6 text-sm text-ink-muted sm:px-6 lg:px-8">
        <p>
          Quote Reclaim helps contractors turn sent estimates into booked work.
          Not lead generation. Not scheduling software.
        </p>
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          <Link href="/terms" className="rounded hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            Terms
          </Link>
          <span aria-hidden="true">-</span>
          <Link href="/privacy" className="rounded hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            Privacy
          </Link>
          <span aria-hidden="true">-</span>
          <Link href="/refund-policy" className="rounded hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            Refund Policy
          </Link>
          <span aria-hidden="true">-</span>
          <Link href="/cancellation-policy" className="rounded hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            Cancellation
          </Link>
          <span aria-hidden="true">-</span>
          <Link href="/contact" className="rounded hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            Contact
          </Link>
        </nav>
      </footer>
    </main>
  );
}

function HeroProductPreview() {
  return (
    <div
      id="how-it-works"
      className="min-w-0 rounded-2xl border border-line-subtle bg-surface-1/85 shadow-[0_18px_54px_rgba(0,0,0,0.22)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle/80 px-4 py-3 sm:px-5">
        <Badge variant="money">SAMPLE PREVIEW - NOT CUSTOMER DATA</Badge>
        <span className="text-xs font-black uppercase tracking-widest text-ink-muted">
          Silent Quote Command
        </span>
      </div>
      <div className="grid gap-3 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_0.85fr]">
          <PreviewPanel label="Money still quiet" value="$14,500" body="across sent estimates" />
          <PreviewPanel label="Work first" value="Estimate #3" body="$9,000 - Warm" tone="brand" />
        </div>
        <div className="rounded-xl border border-brand/30 bg-brand/10 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Message to send today
          </p>
          <p className="mt-2 break-words text-sm leading-6 text-ink-strong">
            Quick check - is this project still on your list, or should I close
            the estimate on my side?
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <MiniStatus label="5-message sequence" value="Follow-up 1 ready" />
          <MiniStatus label="Crew gap match" value="Thu opening" />
          <MiniStatus label="Got the job?" value="Mark win" />
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({
  label,
  value,
  body,
  tone = "money",
}: {
  label: string;
  value: string;
  body: string;
  tone?: "money" | "brand";
}) {
  const toneClass = tone === "money" ? "text-money" : "text-brand";
  return (
    <section className="rounded-xl border border-line-subtle bg-canvas/45 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className={`mt-2 break-words text-2xl font-black sm:text-3xl ${toneClass}`}>
        {value}
      </p>
      <p className="mt-1 break-words text-sm text-ink-muted">{body}</p>
    </section>
  );
}

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface-2/80 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-black text-ink-strong">
        {value}
      </p>
    </div>
  );
}

function SectionShell({
  id,
  eyebrow,
  children,
}: {
  id: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="mx-auto w-full max-w-6xl scroll-mt-8 border-t border-line-subtle/70 px-4 py-9 sm:px-6 lg:px-8 lg:py-12"
    >
      <p className="mb-5 text-xs font-black uppercase tracking-widest text-brand">
        {eyebrow}
      </p>
      {children}
    </section>
  );
}

function SectionHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-balance text-2xl font-black leading-tight text-ink-strong sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-xl break-words text-sm leading-7 text-ink-muted sm:text-base">
        {body}
      </p>
    </div>
  );
}

function SignalCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-xl border border-line-subtle bg-surface-1/75 p-4">
      <div className="text-brand">{icon}</div>
      <h3 className="mt-3 font-black text-ink-strong">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{body}</p>
    </article>
  );
}

function SystemPreview() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SystemCard
        icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />}
        title="Follow-up order"
        body="See which quiet estimate deserves attention first, second, and last."
      />
      <SystemCard
        icon={<MessageSquareText className="h-5 w-5" aria-hidden="true" />}
        title="Message sequences"
        body="Keep the next message ready without making every follow-up sound the same."
      />
      <SystemCard
        icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
        title="Crew-gap opportunities"
        body="When the schedule opens up, start with estimates you already sent."
      />
      <SystemCard
        icon={<Trophy className="h-5 w-5" aria-hidden="true" />}
        title="Wins"
        body="Mark Got the Job when a quiet estimate turns into booked work."
      />
    </div>
  );
}

function SystemCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-xl border border-line-subtle bg-surface-1/75 p-4">
      <div className="text-brand">{icon}</div>
      <h3 className="mt-3 font-black text-ink-strong">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{body}</p>
    </article>
  );
}

function CommandTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-brand/35 bg-surface-1 shadow-[0_0_34px_rgba(217,111,50,0.10)]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-subtle bg-brand/10 px-4 py-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Next move
          </p>
          <h3 className="mt-1 text-xl font-black text-ink-strong">
            Work the warm, high-value estimate first.
          </h3>
        </div>
        <span className="rounded-lg border border-brand/35 bg-canvas/45 px-3 py-2 text-xs font-black uppercase tracking-widest text-brand">
          Send today
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-line-subtle px-4 py-3 text-xs font-black uppercase tracking-widest text-ink-muted sm:grid-cols-5">
        <span>Estimate</span>
        <span>Days quiet</span>
        <span className="hidden sm:block">Recovery window</span>
        <span className="hidden sm:block">Next move</span>
        <span>Status</span>
      </div>
      <div className="divide-y divide-line-subtle">
        {commandRows.map((row) => (
          <div
            key={row.estimate}
            className="grid grid-cols-2 gap-2 px-4 py-4 text-sm sm:grid-cols-5"
          >
            <span className="font-black text-ink-strong">{row.estimate}</span>
            <span className="text-ink-muted">{row.age}</span>
            <span className="text-money">{row.window}</span>
            <span className="font-semibold text-brand">{row.next}</span>
            <span className="text-ink-muted">{row.status}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-line-subtle bg-canvas/45 p-4">
        <p className="text-xs font-black uppercase tracking-widest text-brand">
          Message to send today
        </p>
        <p className="mt-2 break-words text-sm leading-6 text-ink-strong">
          I wanted to check back on the estimate I sent. Is this still active,
          or should I close it out for now?
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="brand">Copy</Badge>
          <Badge variant="money">Send today</Badge>
          <Badge variant="success">Got the Job action</Badge>
        </div>
      </div>
    </div>
  );
}

function CrewGapPreview() {
  return (
    <div className="rounded-xl border border-brand/35 bg-brand/10 p-5">
      <div className="flex items-center gap-2 text-brand">
        <CalendarClock className="h-5 w-5" aria-hidden="true" />
        <p className="text-xs font-black uppercase tracking-widest">
          Open crew day
        </p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <MetricBlock label="Open day" value="Thu, Jun 25" />
        <MetricBlock label="Best estimate to reopen" value="$9,000" />
        <MetricBlock label="Suggested message" value="Can we still help?" />
        <MetricBlock label="Reason" value="Warm + high value" />
      </div>
      <p className="mt-4 text-sm leading-6 text-ink-muted">
        Start with the quiet estimate most likely to put a crew back on the
        calendar.
      </p>
    </div>
  );
}

function GotJobPreview() {
  return (
    <div className="rounded-xl border border-money/35 bg-money/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-money">
            Recovery status
          </p>
          <h3 className="mt-2 text-2xl font-black text-ink-strong">
            Quiet estimate booked
          </h3>
        </div>
        <span className="rounded-lg border border-money/40 bg-canvas/50 px-4 py-2 text-sm font-black text-money">
          Got the Job
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MetricBlock label="Started" value="Warm quote" />
        <MetricBlock label="Sent" value="Follow-up 2" />
        <MetricBlock label="Recovered value" value="$4,000" />
      </div>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-canvas/50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className="mt-2 break-words text-lg font-black text-ink-strong">
        {value}
      </p>
    </div>
  );
}

function PriceMathCard() {
  return (
    <div className="rounded-2xl border border-money/35 bg-money/10 p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-widest text-money">
        {PAYWALL_PRICE_LABEL}
      </p>
      <h3 className="mt-3 max-w-2xl text-balance text-2xl font-black leading-tight text-ink-strong sm:text-3xl">
        One recovered estimate can cover it many times over.
      </h3>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MetricBlock label="Plan" value={PAYWALL_PRICE_LABEL} />
        <MetricBlock label="Example estimate" value="$2,500" />
        <MetricBlock label="Coverage" value="2+ years" />
      </div>
      <p className="mt-5 text-sm leading-6 text-ink-muted">
        No software can promise a job back. The point is simple: sent estimates
        often represent thousands in quoted work, so the follow-up system does
        not need many wins to make sense.
      </p>
      <Link
        href="/audit"
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-4 py-2 text-sm font-bold text-canvas transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Run the free audit
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
