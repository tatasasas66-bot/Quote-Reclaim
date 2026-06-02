type IntelligencePanelProps = {
  totalSequences: number;
  unlockAt: number;
};

export function IntelligencePanel({
  totalSequences,
  unlockAt,
}: IntelligencePanelProps) {
  const unlocked = totalSequences >= unlockAt;
  return (
    <div className="rounded-lg border border-money/25 bg-surface-1 p-5 shadow-[0_18px_54px_rgba(0,0,0,0.22)]">
      <p className="text-xs font-black uppercase tracking-widest text-money/80">
        RECOVERY PATTERN
      </p>
      {unlocked ? (
        <UnlockedBody totalSequences={totalSequences} />
      ) : (
        <LockedBody totalSequences={totalSequences} unlockAt={unlockAt} />
      )}
    </div>
  );
}

function LockedBody({
  totalSequences,
  unlockAt,
}: {
  totalSequences: number;
  unlockAt: number;
}) {
  const remaining = Math.max(0, unlockAt - totalSequences);
  return (
    <>
      <p className="mt-2 text-lg font-bold text-ink-strong">
        Unlocks after {unlockAt} sequences.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        You have {totalSequences} — {remaining} to go.
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-money transition-[width] duration-700"
          style={{
            width: `${Math.min(100, (totalSequences / unlockAt) * 100)}%`,
          }}
          aria-label={`${totalSequences} of ${unlockAt} sequences captured`}
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">
        Once unlocked, Quote Reclaim shows which follow-ups work best for your
        trade and when your quiet quotes are most likely to come back.
      </p>
    </>
  );
}

function UnlockedBody({ totalSequences }: { totalSequences: number }) {
  return (
    <>
      <p className="mt-2 text-lg font-bold text-ink-strong">
        You have {totalSequences} — unlocked.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        Quote Reclaim is rolling up your pattern now. Check back in a few hours.
      </p>
    </>
  );
}
