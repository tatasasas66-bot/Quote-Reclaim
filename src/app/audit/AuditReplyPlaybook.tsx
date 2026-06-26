import {
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  MessageSquareMore,
  XCircle,
} from "lucide-react";

const REPLY_BRANCHES = [
  {
    label: "Still interested",
    icon: CheckCircle2,
    tone: "text-success",
    say: "Good to hear. Is the main question timing, one part of the scope, or getting a start date on the calendar?",
    move: "Confirm the real blocker, then give one specific next step. Do not resend the whole pitch.",
  },
  {
    label: "Price concern",
    icon: CircleDollarSign,
    tone: "text-money",
    say: "Understood. Is the total the issue, or is there a part of the scope you would rather separate or phase?",
    move: "Clarify scope before discounting. Simplify, phase, or revise only when the tradeoff is clear.",
  },
  {
    label: "Bad timing",
    icon: CalendarClock,
    tone: "text-warning",
    say: "No problem. What month would be more realistic for me to circle back?",
    move: "Get a real follow-up date and stop nudging them before then.",
  },
  {
    label: "Need to talk",
    icon: MessageSquareMore,
    tone: "text-brand",
    say: "Absolutely. I can call at 4:30 or 5:15 today. Does either work?",
    move: "Offer two concrete windows. A vague 'call me sometime' creates another dead end.",
  },
  {
    label: "Went another way",
    icon: XCircle,
    tone: "text-danger",
    say: "Thanks for letting me know. I will close it out on my side. If the scope changes later, you can reply here and I will pick it back up.",
    move: "Close cleanly. Do not argue with the no, and do not keep the quote in an active chase list.",
  },
] as const;

export function AuditReplyPlaybook() {
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
          The reply is not the finish line. It tells you the next move.
        </h3>
        <p className="max-w-sm text-sm leading-6 text-ink-muted">
          Open the answer that sounds closest to what they said.
        </p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {REPLY_BRANCHES.map(({ label, icon: Icon, tone, say, move }) => (
          <details
            key={label}
            className="group min-w-0 rounded-lg border border-line-subtle bg-surface-1 open:border-line-strong"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden">
              <Icon className={`h-5 w-5 shrink-0 ${tone}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words font-black text-ink-strong">
                {label}
              </span>
              <span className="text-lg text-ink-muted transition group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="border-t border-line-subtle px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
                What to say
              </p>
              <p className="mt-2 break-words text-sm font-semibold leading-6 text-ink-strong">
                &quot;{say}&quot;
              </p>
              <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-ink-muted">
                Next move
              </p>
              <p className="mt-2 break-words text-sm leading-6 text-ink">
                {move}
              </p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
