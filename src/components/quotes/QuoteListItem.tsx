import Link from "next/link";
import { Badge } from "@/components/ui";
import type { QuoteRow } from "@/lib/quotes/repo";
import { formatCurrency } from "@/lib/utils/currency";

type AgeBadge = { variant: "neutral" | "warning" | "danger"; label: string };

function ageBadge(daysSilent: number): AgeBadge {
  if (daysSilent >= 14) return { variant: "danger", label: `${daysSilent}d silent` };
  if (daysSilent >= 7) return { variant: "warning", label: `${daysSilent}d silent` };
  return { variant: "neutral", label: `${daysSilent}d silent` };
}

export function QuoteListItem({ quote }: { quote: QuoteRow }) {
  const age = ageBadge(quote.days_silent);
  return (
    <li>
      <Link
        href={`/quotes/${quote.id}`}
        className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink-strong">
            {quote.client_name}
          </p>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {quote.trade}
            {quote.city ? ` · ${quote.city}` : ""}
            {quote.state ? `, ${quote.state}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-semibold text-ink-strong">
            {formatCurrency(quote.estimate_amount)}
          </span>
          <Badge variant={age.variant}>{age.label}</Badge>
        </div>
      </Link>
    </li>
  );
}
