import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, LogOut } from "lucide-react";
import { LogoFull } from "@/components/brand/Logo";
import { ThemeSelector } from "@/components/app/ThemeSelector";
import { cn } from "@/lib/utils/cn";

type AppHeaderProps = {
  className?: string;
  upgrade?: ReactNode;
  /**
   * The Recovery Report link only earns header space once there is activity
   * to report (follow-ups sent or jobs won). A brand-new contractor clicking
   * into a page of zeros learns the wrong lesson about the product.
   */
  showReportLink?: boolean;
};

export function AppHeader({
  className,
  upgrade,
  showReportLink = true,
}: AppHeaderProps) {
  return (
    <header
      data-testid="app-header"
      className={cn(
        "sticky top-0 z-50 flex min-w-0 flex-col gap-2 border-b border-line-subtle bg-canvas py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <Link
        href="/dashboard"
        aria-label="Quote Reclaim dashboard"
        className="w-fit min-w-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <LogoFull className="whitespace-nowrap" />
        <span className="mt-0.5 block text-[11px] font-semibold text-ink-muted">
          One quote. One move. Today.
        </span>
      </Link>

      <div
        data-testid="app-header-actions"
        className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end sm:gap-2"
      >
        {upgrade}
        <ThemeSelector />
        {showReportLink ? (
          <Link
            href="/recovery-report"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden md:inline">Recovery </span>Report
          </Link>
        ) : null}
        <form action="/api/auth/sign-out" method="post" className="shrink-0">
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
