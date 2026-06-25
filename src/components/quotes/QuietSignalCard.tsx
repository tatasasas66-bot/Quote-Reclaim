import Link from "next/link";
import type { RecoveryPlanQuietSignal } from "@/lib/recovery/recovery-plan-view-model";

/**
 * QuietSignal card — read-only diagnostic surface on the quote detail page.
 *
 * UI contract (locked):
 *   - Vocabulary: "Possible stall reason" · "Signal" · "What we can see" ·
 *     "Best next move".
 *   - Strength chip: Early / Medium / Strong only — never a numeric %.
 *   - Renders nothing when the engine returns null (won, opted-out, positive
 *     reply already in hand).
 *   - The button only scrolls to a recommended follow-up; it never swaps,
 *     replaces, or regenerates the plan.
 */

export function QuietSignalCard({
  signal,
}: {
  signal: RecoveryPlanQuietSignal | null;
}) {
  if (!signal) return null;

  return (
    <section
      aria-label="Quiet Signal"
      className="space-y-5 rounded-lg border-2 border-brand/30 bg-surface-1 p-5 shadow-[0_16px_46px_rgba(0,0,0,0.2)] sm:p-6"
    >
      <p className="text-xs font-black uppercase tracking-widest text-brand">
        Quiet Signal
      </p>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Possible stall reason
          </p>
          <p className="mt-1 text-2xl font-black text-ink-strong">
            {signal.stallReason}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Signal
          </p>
          <p className="mt-1 text-base font-bold text-brand">
            {signal.signal}
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          What we can see
        </p>
        <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink">
          {signal.evidence.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true" className="text-ink-muted">
                ·
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-line-subtle bg-canvas/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          Best next move
        </p>
        <p className="mt-2 text-sm leading-7 text-ink-strong">
          {signal.recommendedMove}
        </p>
        {signal.currentMoveAnchorId ? (
          <div className="mt-3">
            <Link
              href={`#${signal.currentMoveAnchorId}`}
              className="inline-flex items-center rounded border border-brand/40 px-3 py-1.5 text-sm font-bold text-brand hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Open recommended follow-up
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
