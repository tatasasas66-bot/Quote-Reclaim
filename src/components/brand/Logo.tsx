import { cn } from "@/lib/utils/cn";

const BRAND_TITLE = "Quote Reclaim";

type MarkProps = {
  className?: string;
  /** Hide the mark from assistive tech when an adjacent text wordmark already labels it. */
  decorative?: boolean;
};

type WordmarkProps = {
  className?: string;
};

/**
 * The Quote Reclaim mark: a geometric "Q" bowl whose tail is a returning
 * arrow — the arrowhead curls back inward toward the center, reading as both
 * the "Q" (Quote) and the bring-it-back gesture (Reclaim).
 *
 * Colors come entirely from the design-system tokens (text-brand rust,
 * text-money gold) via currentColor, so the mark themes correctly and never
 * hardcodes a hex value.
 */
export function LogoMark({ className, decorative = false }: MarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : BRAND_TITLE}
      className={cn("h-8 w-8", className)}
    >
      <title>{BRAND_TITLE}</title>
      {/* Q bowl */}
      <circle
        cx="16"
        cy="16"
        r="9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        className="text-brand"
      />
      {/* Returning-arrow tail — the shaft exits the bowl at the lower right */}
      <line
        x1="24.5"
        y1="24.5"
        x2="20"
        y2="20"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="text-brand"
      />
      {/* Arrowhead curling back toward the center — subtle gold accent */}
      <polygon
        points="16.3,16.3 22.4,17.6 17.6,22.4"
        fill="currentColor"
        className="text-money"
      />
    </svg>
  );
}

function Wordmark({ className }: WordmarkProps) {
  return (
    <span className={cn("font-black tracking-tight", className)}>
      <span className="text-ink-strong">Quote</span>
      <span className="text-brand"> Reclaim</span>
    </span>
  );
}

/** Mark + horizontal "Quote Reclaim" wordmark. App header / nav. */
export function LogoFull({ className }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="h-8 w-8 shrink-0" decorative />
      <Wordmark className="text-base" />
    </span>
  );
}

/** Mark stacked above a centered wordmark. Auth hero / empty states. */
export function LogoStacked({ className }: WordmarkProps) {
  return (
    <span
      className={cn("inline-flex flex-col items-center gap-2 text-center", className)}
    >
      <LogoMark className="h-12 w-12" decorative />
      <Wordmark className="text-lg" />
    </span>
  );
}
