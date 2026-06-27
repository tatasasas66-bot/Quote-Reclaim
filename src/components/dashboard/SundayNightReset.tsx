import { MoonStar } from "lucide-react";
import { updateSundayResetAction } from "@/app/(app)/dashboard/sunday-reset-actions";

export function SundayNightReset({ enabled }: { enabled: boolean }) {
  return (
    <section
      data-testid="sunday-night-reset"
      aria-labelledby="sunday-reset-title"
      className="border-y border-line-subtle py-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-brand">
            <MoonStar className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-black uppercase tracking-widest">
              Weekly habit
            </p>
          </div>
          <h2
            id="sunday-reset-title"
            className="mt-2 text-lg font-black text-ink-strong"
          >
            Sunday Night Reset
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink">
            Every Sunday evening, get one quiet quote to work this week — the
            amount, the window, and the text to send.
          </p>
          <p className="mt-2 text-xs leading-5 text-ink-muted">
            Contractor email only. Scheduled for Sunday at 7:00 PM UTC until
            account timezones are available. Nothing is sent to a homeowner.
          </p>
        </div>
        <form action={updateSundayResetAction}>
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
          <button
            type="submit"
            role="switch"
            aria-checked={enabled}
            aria-label="Sunday Night Reset"
            className={`relative h-7 w-12 shrink-0 rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              enabled
                ? "border-success/50 bg-success/25"
                : "border-line-strong bg-surface-2"
            }`}
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full transition ${
                enabled
                  ? "left-6 bg-success"
                  : "left-1 bg-ink-muted"
              }`}
            />
          </button>
        </form>
      </div>
    </section>
  );
}
