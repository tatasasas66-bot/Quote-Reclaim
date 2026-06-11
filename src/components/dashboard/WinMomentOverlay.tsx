"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { roiPieces } from "@/lib/utils/roi-framing";

export function WinMomentOverlay({
  amount,
  allTimeRecovered,
  onDismiss,
}: {
  amount: number;
  allTimeRecovered: number;
  onDismiss: () => void;
}) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");
  // Guard against an accidental dismiss while the number is still punching up.
  const [canDismiss, setCanDismiss] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 200);
    const tDismiss = setTimeout(() => setCanDismiss(true), 2000);
    const t2 = setTimeout(() => setPhase("exit"), 3700);
    const t3 = setTimeout(onDismiss, 4000);
    return () => {
      clearTimeout(t1);
      clearTimeout(tDismiss);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onDismiss]);

  // Honest ROI framing. Below 24 months the natural "paid for Quote Reclaim
  // for N months" line works; above that it flips to "covered Quote Reclaim
  // Nx over for a full year" so a $12,000 win never produces the comedic
  // "151 months" punch line. Tiny wins fall back to a humble line.
  const roi = roiPieces(amount);
  const lifetime = formatCurrency(allTimeRecovered + amount);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm transition-opacity duration-300 ${
        phase === "exit" ? "opacity-0" : "opacity-100"
      }`}
      onClick={() => canDismiss && onDismiss()}
    >
      <div
        className={`grid max-w-md gap-6 px-8 text-center transition-transform duration-500 ${
          phase === "enter"
            ? "scale-90 opacity-0"
            : phase === "hold"
              ? "scale-100 opacity-100"
              : "scale-95 opacity-0"
        }`}
      >
        <CheckCircle2
          className="mx-auto h-20 w-20 text-success"
          strokeWidth={1.5}
          aria-hidden="true"
        />

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-money/80">
            RECOVERED REVENUE
          </p>
          <p className="mt-2 text-6xl font-black tabular-nums text-money">
            +{formatCurrency(amount)}
          </p>
        </div>

        <p className="text-lg font-semibold text-ink-strong">
          {roi.kind === "subMonth" ? (
            <>This one job is on the board.</>
          ) : roi.kind === "months" ? (
            <>
              This one job paid for Quote Reclaim
              <br />
              for {roi.months} months.
            </>
          ) : (
            <>
              This one job covered Quote Reclaim
              <br />
              {roi.yearMultiple}x over for a full year.
            </>
          )}
        </p>

        <p className="text-xs text-ink-muted">
          Lifetime recovered:{" "}
          <span className="font-semibold text-money">{lifetime}</span>
        </p>
      </div>
    </div>
  );
}
