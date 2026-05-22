import { cn } from "@/lib/utils/cn";

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  label?: string;
};

export function Logo({ className, showWordmark = false, label = "Quote Reclaim" }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label={label}>
      <svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-7 w-7 text-brand"
        role="img"
        aria-hidden={showWordmark ? "true" : undefined}
      >
        <path d="M7 4H4v16h3" />
        <path d="M20 9v3a3 3 0 0 1-3 3H10" />
        <path d="M13 12l-3 3 3 3" />
      </svg>
      {showWordmark ? (
        <span className="text-base font-bold tracking-tight">
          <span className="text-ink-strong">Quote</span>
          <span className="text-brand"> Reclaim</span>
        </span>
      ) : null}
    </span>
  );
}
