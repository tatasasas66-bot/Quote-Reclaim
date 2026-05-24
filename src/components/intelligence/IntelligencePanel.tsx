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
      <p className="mt-2 text-lg font-bold text-ink-strong">
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
      <p className="mt-2 text-lg font-bold text-ink-strong">
        {totalSequences} sequences in.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        Personalized insights coming soon — the aggregation job is rolling them
        up now. Refresh in a few hours.
      </p>
    </>
  );
}
