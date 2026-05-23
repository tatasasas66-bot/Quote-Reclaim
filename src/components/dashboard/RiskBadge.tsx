import type { RiskLevel } from "@/lib/recovery/risk";
import { riskLabel } from "@/lib/recovery/risk";

type RiskBadgeProps = {
  level: RiskLevel;
};

const STYLE_FOR_LEVEL: Record<RiskLevel, string> = {
  warm: "border-success/40 bg-success/15 text-success",
  cooling: "border-warning/30 bg-warning/10 text-warning",
  cold: "border-warning/50 bg-warning/20 text-warning",
  hot: "border-danger/50 bg-danger/15 text-danger",
  won: "border-success/50 bg-success/20 text-success",
  closed: "border-line-subtle bg-surface-3 text-ink-muted",
};

export function RiskBadge({ level }: RiskBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${STYLE_FOR_LEVEL[level]}`}
    >
      {riskLabel(level)}
    </span>
  );
}
