"use client";

import * as React from "react";
import { Check, Copy, Flame, MessageSquareText } from "lucide-react";
import { recordSmsOpenedAction } from "@/app/(app)/dashboard/actions";
import { buildSmsDeepLink, type RecoveryStreak, type TodayMove } from "@/lib/recovery/daily-loop";
import { formatCurrency } from "@/lib/utils/currency";

export function TodaysMoves({
  moves,
  streak,
}: {
  moves: TodayMove[];
  streak: RecoveryStreak;
}) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

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
      className="border-y border-line-subtle bg-surface-1"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-subtle px-4 py-5 sm:px-6">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Today&apos;s Moves
          </p>
          <h2 id="todays-moves-title" className="mt-1 text-2xl font-black text-ink-strong">
            One clear move at a time.
          </h2>
        </div>
        <div className="flex items-center gap-2 text-sm font-black text-warning">
          <Flame className="h-5 w-5" aria-hidden="true" />
          {streak.count}-day recovery streak
        </div>
        {streak.resetYesterday && moves[0] ? (
          <p className="basis-full text-sm text-ink-muted">
            Streak reset yesterday. Today&apos;s move: {moves[0].clientName}.
          </p>
        ) : null}
      </div>

      {moves.length === 0 ? (
        <p className="px-4 py-6 text-sm font-semibold text-ink-muted sm:px-6">
          No moves due today. You&apos;re caught up. 🔥 Come back tomorrow.
        </p>
      ) : (
        <ol className="divide-y divide-line-subtle">
          {moves.map((move) => {
            const smsHref = buildSmsDeepLink(move.phone, move.message);
            return (
              <li
                key={move.reminderId}
                className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
              >
                <div className="min-w-0">
                  <p className="break-words text-base font-black text-ink-strong">
                    {move.clientName} · {formatCurrency(move.amount)} · {move.windowLabel}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-widest text-ink-muted">
                    {move.overdue ? "Overdue" : "Due today"} · {move.family}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">
                    {move.message}
                  </p>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  {smsHref ? (
                    <button
                      type="button"
                      aria-label={`Tap to text ${move.clientName}`}
                      onClick={() => void openSms(move, smsHref)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-black text-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                      Tap to text {move.clientName} →
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label={`Copy message for ${move.clientName}`}
                        onClick={() => void copyMessage(move)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line-strong px-4 py-2 text-sm font-black text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        {copiedId === move.reminderId ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                        {copiedId === move.reminderId ? "Copied" : "Copy message"}
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
      )}
    </section>
  );
}
