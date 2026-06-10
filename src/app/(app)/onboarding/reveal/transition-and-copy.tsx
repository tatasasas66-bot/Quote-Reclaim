/**
 * Pure (client-safe) helpers for the Silent Money Reveal onboarding screen.
 *
 * Lives separately from RevealClient.tsx so the unit tests can import the
 * helpers without dragging in the "use server" action chain (which imports
 * the server-only Supabase service client and throws when loaded under any
 * test env that defines `window`).
 *
 * Contracts:
 *   - REVEAL_TRANSITION_MIN_MS is the visible audit-transition window,
 *     capped by spec to 2800–3400ms — short enough never to feel slow,
 *     long enough that the four honest audit lines actually register as
 *     "Quote Reclaim just did work" before the number lands. Below ~2s
 *     the labor-illusion signal is wasted because all four lines render
 *     almost simultaneously; above ~3.5s the contractor starts to suspect
 *     the wait is fake.
 *   - REVEAL_AUDIT_LINES is honest contractor-facing copy ONLY. No AI,
 *     billing, internal-validation, or security wording.
 *   - AuditTransition renders the transition view. No timers — the host
 *     component owns the state machine; this component is presentational.
 *   - noEmailRevealCopy is the no-email matrix; explicit "your top N" for
 *     free users, "these" for paid users. Never promises auto-send for
 *     rows without an email.
 */
import * as React from "react";

export const REVEAL_TRANSITION_MIN_MS = 3000;

export const REVEAL_AUDIT_LINES: ReadonlyArray<string> = [
  "Reading your pasted estimates…",
  "Ranking your highest-value quiet quotes…",
  "Separating email-ready from manual follow-ups…",
  "Preparing your first recovery targets…",
];

export function AuditTransition({ messageIdx }: { messageIdx: number }) {
  const safeIdx = Math.max(
    0,
    Math.min(messageIdx, REVEAL_AUDIT_LINES.length - 1),
  );
  const line = REVEAL_AUDIT_LINES[safeIdx];
  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="mx-auto mt-12 grid w-full max-w-3xl place-items-center gap-6 py-16 sm:mt-20"
    >
      <p className="text-xs font-black uppercase tracking-widest text-brand">
        Silent Quote Audit
      </p>
      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand [animation-delay:200ms]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand [animation-delay:400ms]" />
      </div>
      <p className="min-h-6 text-center text-sm text-ink-muted">{line}</p>
    </section>
  );
}

export function noEmailRevealCopy(args: {
  willImport: number;
  noEmailInImporting: number;
  isPaid: boolean;
}): string | null {
  const { willImport, noEmailInImporting, isPaid } = args;
  if (willImport === 0) return null;

  // Paid: importing all rows, refer to "these".
  if (isPaid) {
    if (noEmailInImporting === 0) return null;
    if (noEmailInImporting === willImport) {
      return "None of these have an email yet — you'll send the follow-ups yourself. Add an email to a quote to switch it to automatic.";
    }
    const verb = noEmailInImporting === 1 ? "has" : "have";
    const pronoun = noEmailInImporting === 1 ? "that one" : "those";
    return `${noEmailInImporting} of these ${verb} no email — you'll send ${pronoun} yourself. The rest can run by email.`;
  }

  // Free: explicit "your top N" so the contractor cannot read "these" as
  // the full pasted list.
  const subjectCap = willImport === 1 ? "Your top quote" : `Your top ${willImport}`;

  if (noEmailInImporting === 0) {
    // All importing rows have email addresses — describe what that enables.
    if (willImport === 1) {
      return `${subjectCap} has an email address, so the 5-message follow-up can run by email.`;
    }
    return `${subjectCap} have email addresses, so the 5-message follow-up can run by email.`;
  }
  if (noEmailInImporting === willImport) {
    // None have email — no automation claim possible.
    if (willImport === 1) {
      return `${subjectCap} has no email — you'll send that one yourself. Add an email later to switch to automatic follow-up.`;
    }
    return `${subjectCap} have no email — you'll send those yourself. Add emails later to switch them to automatic follow-up.`;
  }
  // Mixed — some have email, some don't. One clear sentence for both cases.
  return "Quotes with email can run by email. Quotes without email get the same 5-message plan ready to copy.";
}
