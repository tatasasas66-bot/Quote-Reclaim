import {
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  LockKeyhole,
  MessageSquareMore,
  XCircle,
} from "lucide-react";

const LOCKED_BRANCHES = [
  {
    id: "price-concern",
    label: "Price concern",
    teaser:
      "The number that reopens a price-stalled quote isn't a discount - it's a reframe.",
    icon: CircleDollarSign,
    tone: "text-money",
  },
  {
    id: "bad-timing",
    label: "Bad timing",
    teaser: "Timing stalls usually mean spring/fall or a spouse's sign-off.",
    icon: CalendarClock,
    tone: "text-warning",
  },
  {
    id: "need-to-talk",
    label: "Need to talk",
    teaser: "They want a call but won't say it.",
    icon: MessageSquareMore,
    tone: "text-brand",
  },
  {
    id: "went-another-way",
    label: "Went another way",
    teaser: "How to close it clean so the door stays open.",
    icon: XCircle,
    tone: "text-danger",
  },
] as const;

type AuditReplyPlaybookProps = {
  unlockHref: string;
  onUnlock: (branchId: string) => void;
};

export function AuditReplyPlaybook({
  unlockHref,
  onUnlock,
}: AuditReplyPlaybookProps) {
  return (
    <section
      data-testid="audit-reply-playbook"
      aria-labelledby="reply-playbook-title"
      className="border-t border-line-strong pt-7"
    >
      <p className="text-xs font-black uppercase tracking-widest text-brand">
        If they reply
      </p>
      <div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h3
          id="reply-playbook-title"
          className="text-2xl font-black text-ink-strong"
        >
          The reply tells you the next move.
        </h3>
        <p className="max-w-sm text-sm leading-6 text-ink-muted">
          One branch is open. The other four show what the full playbook handles.
        </p>
      </div>

      <div
        data-testid="audit-reply-free"
        className="mt-5 border border-success/35 bg-success/5 p-5"
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
          <h4 className="font-black text-ink-strong">Still interested</h4>
          <span className="rounded-full border border-success/35 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-success">
            Free branch
          </span>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
              Meaning
            </dt>
            <dd className="mt-2 text-sm font-semibold leading-6 text-ink">
              They&apos;re warm &mdash; don&apos;t over-talk it.
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
              Reply
            </dt>
            <dd className="mt-2 text-sm font-semibold leading-6 text-ink-strong">
              Good &mdash; here&apos;s the link to pick back up: [link]. Want me
              to hold the dates?
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {LOCKED_BRANCHES.map(({ id, label, teaser, icon: Icon, tone }) => (
          <a
            key={id}
            href={unlockHref}
            data-testid={`audit-reply-locked-${id}`}
            onClick={() => onUnlock(id)}
            className="group min-w-0 border border-line-subtle bg-surface-1 p-4 transition hover:border-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <div className="flex items-center gap-3">
              <Icon className={`h-5 w-5 shrink-0 ${tone}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 font-black text-ink-strong">
                {label}
              </span>
              <LockKeyhole
                className="h-4 w-4 shrink-0 text-ink-muted group-hover:text-brand"
                aria-label="Locked"
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-ink-muted">{teaser}</p>
          </a>
        ))}
      </div>

      <a
        href={unlockHref}
        data-testid="audit-reply-unlock-cta"
        onClick={() => onUnlock("all")}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-brand/50 bg-brand/10 px-4 py-2 text-center text-sm font-black text-brand transition hover:bg-brand/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto"
      >
        <LockKeyhole className="h-4 w-4" aria-hidden="true" />
        Unlock all 5 replies &mdash; free, no card
      </a>
    </section>
  );
}
