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
    <div className="rounded-2xl border border-line-subtle bg-white p-5 shadow-premium">
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
  const analyzed = Math.min(totalSequences, unlockAt);
  return (
    <>
      <p className="mt-2 text-lg font-bold text-ink-strong">
        Learning from your first {unlockAt} sequences.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {analyzed} of {unlockAt} analyzed.
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-money transition-[width] duration-700"
          style={{
            width: `${Math.min(100, (totalSequences / unlockAt) * 100)}%`,
          }}
          aria-label={`${analyzed} of ${unlockAt} sequences analyzed`}
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">
        Then Quote Reclaim shows which follow-ups work best for your trade and
        when quiet quotes are most likely to come back.
      </p>
    </>
  );
}

function UnlockedBody({ totalSequences }: { totalSequences: number }) {
  return (
    <>
      <p className="mt-2 text-lg font-bold text-ink-strong">
        {totalSequences} of {totalSequences} analyzed.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        Quote Reclaim is building your recovery pattern from these now. Check
        back soon.
      </p>
    </>
  );
}
