import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  "No customer names",
  "No phone numbers",
  "No card",
  "No signup before result",
] as const;

export function TrustStrip({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      aria-label="Privacy and signup promises"
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-ink-muted",
        compact && "text-xs",
        className,
      )}
    >
      {ITEMS.map((item) => (
        <span key={item} className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          {item}
        </span>
      ))}
    </div>
  );
}
