import { Badge } from "@/components/ui";
import { CopyButton } from "./CopyButton";
import type { SuggestedResponse, SuggestTone } from "@/lib/ai/suggest-response";

export type ReplyRadarData = {
  clientName: string;
  replyText: string;
  suggestion: SuggestedResponse;
};

const toneCard: Record<SuggestTone, string> = {
  success: "border-success/40",
  warning: "border-warning/40",
  neutral: "border-line-subtle",
  danger: "border-danger/40",
  brand: "border-brand/40",
};

/**
 * Reply Radar — the moat. When a customer reply has been classified, surface
 * the intent, a ready-to-send suggested response, and the tactic behind it.
 *
 * Renders nothing when there is no classified reply, so the quote detail page
 * can mount it unconditionally.
 */
export function ReplyRadarCard({ reply }: { reply: ReplyRadarData | null }) {
  if (!reply) return null;

  const { clientName, replyText, suggestion } = reply;
  const name = clientName.trim() || "Customer";

  return (
    <section
      aria-label="Reply Radar"
      className={`space-y-4 rounded-lg border-2 bg-surface-1 p-5 shadow-[0_16px_46px_rgba(0,0,0,0.2)] sm:p-6 ${toneCard[suggestion.tone]}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Reply Radar
          </p>
          <h2 className="mt-1 text-2xl font-black text-ink-strong">
            {name} replied — {suggestion.label}
          </h2>
        </div>
        <Badge variant={suggestion.tone}>{suggestion.badgeLabel}</Badge>
      </div>

      <blockquote className="border-l-2 border-line-subtle pl-3 text-sm italic leading-6 text-ink-muted">
        “{replyText}”
      </blockquote>

      <div className="rounded-lg border border-line-subtle bg-canvas/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
            Suggested response
          </p>
          <CopyButton text={suggestion.message} label="Copy response" />
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-strong">
          {suggestion.message}
        </p>
      </div>

      <p className="text-xs italic text-ink-muted">
        <span className="font-semibold not-italic">Why this works:</span>{" "}
        {suggestion.tactic}
      </p>
    </section>
  );
}
