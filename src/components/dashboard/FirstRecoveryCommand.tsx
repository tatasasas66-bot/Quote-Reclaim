import Link from "next/link";
import { Button } from "@/components/ui";

type Props = {
  /** True when the contractor is on an unlimited paid plan. */
  isPaid: boolean;
  /**
   * Free quotes still available (Number.POSITIVE_INFINITY for paid). Drives
   * the trust line so we only ever claim "3 free" when it is actually true —
   * a returning free user who already spent their allowance must never be
   * told the quotes are free.
   */
  freeRemaining: number;
  /**
   * True when this contractor has already won/recovered at least one job.
   * Flips "FIRST recovery move" framing to "NEXT recovery move" so the panel
   * never tells a proven winner this is their first time.
   */
  hasRecoveredBefore: boolean;
  /**
   * True when the user has already completed onboarding (either by importing
   * or by skipping). Sends the bulk-paste CTA to the reusable /quotes/import
   * door instead of /onboarding/reveal, so a returning empty-queue contractor
   * is never bounced through onboarding framing again.
   */
  onboardingDone?: boolean;
};

/**
 * First-run / empty-queue command panel.
 *
 * Renders ONLY when the recovery queue is empty. It replaces the passive
 * "nothing here" dead zone with the dashboard's single obvious first mission:
 * run the Silent Money Reveal (paste recent estimates), with manual add as the
 * honest secondary path. Dark command-center treatment, amber action glow — it
 * is meant to visually overpower the small Add button, not to be a modal the
 * user must dismiss.
 */
export function FirstRecoveryCommand({
  isPaid,
  freeRemaining,
  hasRecoveredBefore,
  onboardingDone = false,
}: Props) {
  // Reusable bulk-import door for returning users; onboarding/reveal for
  // first-run users. Same parser, same import action, different framing — so
  // a returning empty-queue contractor is never sent back through onboarding.
  const importHref = onboardingDone ? "/quotes/import" : "/onboarding/reveal";
  const importCta = onboardingDone
    ? "Paste more quotes"
    : "Run the Silent Money Reveal";
  // A "fresh" free user still has the full first-3 allowance — only then is the
  // "first 3 free" language truthful.
  const freshFree = !isPaid && freeRemaining >= 3;

  const eyebrow = hasRecoveredBefore
    ? "NEXT RECOVERY MOVE"
    : "FIRST RECOVERY MOVE";
  const headline = hasRecoveredBefore
    ? "Your queue is clear. Feed it the next silent quotes."
    : "Start with the quotes already sitting silent.";
  const body = freshFree
    ? "Paste your recent estimates. Quote Reclaim ranks the highest-value quiet money, imports your first 3 free, and builds the recovery plan."
    : "Paste your recent estimates. Quote Reclaim ranks the highest-value quiet money and builds the recovery plan for each one.";

  const bullets = [
    "Paste your recent estimates",
    "We rank the highest-value quiet money",
    freshFree ? "Start with your top 3 free" : "Build a follow-up plan for each",
  ];

  const trustLine = (() => {
    if (isPaid) {
      return "Unlimited recovery is on — paste estimates or add a quote.";
    }
    if (freeRemaining >= 3) {
      return "No card needed. Your first 3 quotes are free.";
    }
    if (freeRemaining > 0) {
      return `No card needed. You have ${freeRemaining} free quote${
        freeRemaining === 1 ? "" : "s"
      } left.`;
    }
    return "You've used your 3 free quotes — add a quote to see what's recoverable.";
  })();

  return (
    <section
      aria-labelledby="first-recovery-heading"
      className="relative overflow-hidden rounded-2xl border border-brand/25 bg-white p-6 shadow-premium sm:p-8"
    >
      {/* Amber top edge — the command-center signature, not decoration. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand"
      />

      <p className="text-xs font-black uppercase tracking-widest text-brand">
        {eyebrow}
      </p>
      <h2
        id="first-recovery-heading"
        className="mt-3 text-balance text-3xl font-black leading-tight text-ink-strong sm:text-4xl"
      >
        {headline}
      </h2>
      <p className="mt-3 max-w-xl text-base leading-7 text-ink">{body}</p>

      <ul className="mt-5 grid gap-2 sm:grid-cols-3">
        {bullets.map((b) => (
          <li
            key={b}
            className="flex items-start gap-2 rounded-md border border-line-subtle bg-surface-2 px-3 py-2 text-sm text-ink"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
            />
            {b}
          </li>
        ))}
      </ul>

      <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-ink-strong">
        Before buying another lead, work the estimates you already paid to
        create.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href={importHref} className="w-full sm:w-auto">
          <Button
            size="lg"
            className="w-full sm:w-auto"
          >
            {importCta}
          </Button>
        </Link>
        <Link href="/quotes/new" className="w-full sm:w-auto">
          <Button variant="secondary" size="lg" className="w-full sm:w-auto">
            + Add Estimate
          </Button>
        </Link>
      </div>

      <p className="mt-4 text-xs text-ink-muted">{trustLine}</p>
    </section>
  );
}
