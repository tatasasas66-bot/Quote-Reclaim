"use client";

import * as React from "react";
import { Check, Copy, Flame, MessageSquareText } from "lucide-react";
import { recordSmsOpenedAction } from "@/app/(app)/dashboard/actions";
import {
  buildSmsDeepLink,
  type RecoveryStreak,
  type TodayMove,
} from "@/lib/recovery/daily-loop";
import { formatCurrency } from "@/lib/utils/currency";

const DEFAULT_VISIBLE_MOVES = 3;

export function TodaysMoves({
  moves,
  streak,
}: {
  moves: TodayMove[];
  streak: RecoveryStreak;
}) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const visibleMoves = showAll
    ? moves
    : moves.slice(0, DEFAULT_VISIBLE_MOVES);
  const remainingCount = Math.max(0, moves.length - DEFAULT_VISIBLE_MOVES);

  async function openSms(move: TodayMove, href: string) {
    await recordSmsOpenedAction({
      quoteId: move.quoteId,
      messageFamily: move.family,
      step: move.step,
    });
    window.location.href = href;
  }

  async function copyMessage(move: TodayMove) {
    await navigator.clipboard.writeText(move.message);
    setCopiedId(move.reminderId);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  return (
    <section
      id="today"
      aria-labelledby="todays-moves-title"
      className="overflow-hidden rounded-2xl border border-line-subtle bg-white shadow-premium"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Today&apos;s Moves
          </p>
          <h2
            id="todays-moves-title"
            className="mt-1 text-xl font-black text-ink-strong sm:text-2xl"
          >
            One clear move at a time.
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {streak.count > 0 ? (
            <div className="flex items-center gap-2 text-sm font-black text-warning">
              <Flame className="h-5 w-5" aria-hidden="true" />
              {streak.count}-day recovery streak
            </div>
          ) : (
            <p className="text-sm font-semibold text-ink-muted">
              Your recovery streak starts with your first move.
            </p>
          )}
          {moves.length > 0 ? (
            <a
              href="#silent-quote-command"
              className="rounded text-xs font-bold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Jump to Silent Quote Command
            </a>
          ) : null}
        </div>
        {streak.resetYesterday && moves[0] ? (
          <p className="basis-full text-sm text-ink-muted">
            Streak reset yesterday. Today&apos;s move: {moves[0].clientName}.
          </p>
        ) : null}
      </div>

      {moves.length === 0 ? (
        <p className="px-4 py-3 text-sm font-semibold text-success sm:px-6">
          No moves due right now.
        </p>
      ) : (
        <>
          <ol className="divide-y divide-line-subtle">
            {visibleMoves.map((move) => {
              const smsHref = buildSmsDeepLink(move.phone, move.message);
              return (
                <li
                  key={move.reminderId}
                  className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="break-words text-base font-black text-ink-strong">
                      {move.clientName} · {formatCurrency(move.amount)} ·{" "}
                      {move.windowLabel}
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-widest text-ink-muted">
                      {move.overdue ? "Overdue" : "Due today"} · {move.family}
                    </p>
                    <p className="mt-2 line-clamp-1 text-sm leading-6 text-ink-muted sm:line-clamp-2">
                      {move.message}
                    </p>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    {smsHref ? (
                      <button
                        type="button"
                        aria-label={`Tap to text ${move.clientName}`}
                        onClick={() => void openSms(move, smsHref)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-4 py-2 text-sm font-bold text-white shadow-premium focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        <MessageSquareText
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        Tap to text {move.clientName} →
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`Copy message for ${move.clientName}`}
                          onClick={() => void copyMessage(move)}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-line-subtle bg-white px-4 py-2 text-sm font-bold text-ink-strong shadow-premium focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                          {copiedId === move.reminderId ? (
                            <Check
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          ) : (
                            <Copy
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          )}
                          {copiedId === move.reminderId
                            ? "Copied"
                            : "Copy message"}
                        </button>
                        <p className="max-w-64 text-xs leading-5 text-ink-muted">
                          Add a phone number to enable one-tap texting.
                        </p>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {remainingCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle bg-surface-2 px-4 py-3 sm:px-6">
              <p className="text-sm font-bold text-ink-muted">
                {remainingCount} more move
                {remainingCount === 1 ? "" : "s"} today
              </p>
              <button
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll((current) => !current)}
                className="min-h-10 rounded-md border border-line-strong bg-surface-1 px-3 py-2 text-sm font-black text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {showAll ? "Show top 3" : "View all moves"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
