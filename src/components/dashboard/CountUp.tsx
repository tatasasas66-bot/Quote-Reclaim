"use client";

import * as React from "react";
import { formatCurrency } from "@/lib/utils/currency";

type CountUpProps = {
  value: number;
  prefix?: string;
  durationMs?: number;
};

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * Animates a currency value from 0 to `value` on mount over `durationMs`
 * using easeOutQuart and requestAnimationFrame. Honors prefers-reduced-motion
 * by rendering the final value immediately.
 */
export function CountUp({ value, prefix = "", durationMs = 800 }: CountUpProps) {
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || value === 0) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const progress = Math.min(1, (ts - startTs) / durationMs);
      setDisplay(value * easeOutQuart(progress));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <>
      {prefix}
      {formatCurrency(Math.round(display))}
    </>
  );
}
