import { LogoFull, LogoMark } from "@/components/brand/Logo";

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  label?: string;
};

/**
 * Back-compat wrapper around the brand mark. `showWordmark` picks the full
 * lockup (mark + "Quote Reclaim") vs. the compact mark only.
 */
export function Logo({ className, showWordmark = false }: LogoProps) {
  return showWordmark ? (
    <LogoFull className={className} />
  ) : (
    <LogoMark className={className} />
  );
}
