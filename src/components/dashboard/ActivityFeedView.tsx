import type { ActivityEvent } from "@/lib/intelligence/list-recent-events";
import { titleCase } from "@/lib/utils/normalize";
import { formatCurrency } from "@/lib/utils/currency";

type ActivityTone = "neutral" | "rust" | "success" | "warning";

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function describeActivity(e: ActivityEvent): {
  text: string;
  tone: ActivityTone;
} {
  const client = titleCase(e.client_name ?? "a customer") || "a customer";
  const trade = e.trade ?? "the project";
  switch (e.event_type) {
    case "estimate_created":
      // Folds the now-hidden "Recovery plan built" line into one useful line:
      // every added quote gets the fixed 5-touch cadence scheduled.
      return {
        text: `${client} added · 5 follow-ups scheduled`,
        tone: "neutral",
      };
    case "followup_generated":
      // Internal plan-build mechanic. Kept for unit coverage but hidden from
      // the rendered feed (see cleanActivityEvents) so it never reads as spam.
      return { text: `Recovery plan built for ${client}`, tone: "neutral" };
    case "message_sent":
      return {
        text: `Day ${e.followup_number} follow-up sent to ${client} (${trade})`,
        tone: "rust",
      };
    case "message_delivered":
      return { text: `Message delivered to ${client}`, tone: "neutral" };
    case "reply_received":
      if (e.channel === "one_tap") {
        const intent = e.reply_intent;
        const phrase =
          intent === "positive"
            ? "replied in one tap: interested"
            : intent === "question"
              ? "asked a question in one tap"
              : intent === "not_interested"
                ? "tapped: not right now"
                : "replied in one tap";
        return { text: `${client} ${phrase}`, tone: "success" };
      }
      return {
        text: `${client} replied to your ${trade} quote`,
        tone: "success",
      };
    case "win_recorded":
      // "Matteo won · $4,000 recovered" — the headline win, not a log row.
      return {
        text: e.estimate_amount
          ? `${client} won · ${formatCurrency(e.estimate_amount)} recovered`
          : `${client} won`,
        tone: "success",
      };
    case "sequence_closed":
      return { text: `Sequence closed for ${client}`, tone: "neutral" };
    case "opt_out":
      return { text: `${client} opted out`, tone: "warning" };
    default:
      return { text: e.event_type, tone: "neutral" };
  }
}

/**
 * Render-time cleanup so the feed reads like field updates, not system logs.
 * Hides internal mechanics — the "Recovery plan built for X" plan-build events
 * (their value is folded into the "X added · 5 follow-ups scheduled" line) and
 * raw "Message delivered" rows (covered by the "follow-up sent" line). Pure
 * filter: NO data is deleted, NO event storage changes — only the visible list
 * is condensed. Replaces the earlier collapse-to-one approach.
 */
const HIDDEN_EVENT_TYPES = new Set(["followup_generated", "message_delivered"]);

export function cleanActivityEvents(events: ActivityEvent[]): ActivityEvent[] {
  return events.filter((e) => !HIDDEN_EVENT_TYPES.has(e.event_type));
}

export function ActivityFeedView({ events }: { events: ActivityEvent[] }) {
  const visibleEvents = cleanActivityEvents(events);
  return (
    <section className="rounded-lg border border-line-subtle bg-surface-1 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          Activity
        </h2>
        <span className="text-xs text-ink-muted">Last {visibleEvents.length}</span>
      </div>
      {visibleEvents.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Activity will appear here as Quote Reclaim works in the background.
        </p>
      ) : (
        <ol className="grid gap-3">
          {visibleEvents.map((e) => {
            const { text, tone } = describeActivity(e);
            const dot =
              tone === "success"
                ? "bg-success"
                : tone === "rust"
                  ? "bg-brand"
                  : tone === "warning"
                    ? "bg-warning"
                    : "bg-ink-muted";
            return (
              <li key={e.id} className="flex items-start gap-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`}
                  aria-hidden
                />
                <div className="grid gap-0.5">
                  <p className="text-sm text-ink-strong">{text}</p>
                  <p className="text-xs text-ink-muted">
                    {formatRelativeTime(e.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
