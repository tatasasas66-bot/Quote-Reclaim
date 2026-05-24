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
    <div className="rounded-xl border border-line-subtle bg-surface-2 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-money/80">
        PERSONAL RECOVERY DNA
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
  return (
    <>
      <p className="mt-2 text-base text-ink-strong">
        Unlocks after {unlockAt} sequences.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        You have {totalSequences}.
      </p>
      <p className="mt-3 text-xs text-ink-muted">
        Once unlocked, Quote Reclaim shows your strongest framework, your best
        reply windows, and how your recovery rate compares to your trade.
      </p>
    </>
  );
}

function UnlockedBody({ totalSequences }: { totalSequences: number }) {
  return (
    <>
      <p className="mt-2 text-base text-ink-strong">
        {totalSequences} sequences in.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        Personalized insights coming soon — the aggregation job is rolling them
        up now. Refresh in a few hours.
      </p>
    </>
  );
}
