/**
 * Pure business-hour helpers — no server / DB imports. Safe to use from
 * tests and from any module without dragging the `use server` action surface.
 */

/**
 * Default contractor timezone used to anchor scheduled send times to a
 * business hour. Launch market is Houston (Central). When per-contractor TZ
 * is added later, this becomes the fallback.
 */
export const DEFAULT_TIMEZONE = "America/Chicago";
export const DEFAULT_SEND_HOUR = 9; // 09:00 local

/**
 * THE single quote-detail schedule formatter. Header ("Next follow-up
 * sends"), per-message badge ("Scheduled …"), and footer ("Scheduled …")
 * MUST all call this so they never disagree (the badge used to render UTC
 * "2 PM" next to a CT "9:00 AM" footer). Always America/Chicago for now.
 *
 *   → "May 28, 9:00 AM"
 */
export function formatScheduleDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", {
    timeZone: DEFAULT_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Time-only variant for "Sent …" labels. Same timezone discipline. */
export function formatScheduleTime(value: string | Date | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", {
    timeZone: DEFAULT_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Round `date` to {DEFAULT_SEND_HOUR}:00 local in {DEFAULT_TIMEZONE}. Pure
 * Date + Intl math — no library. Anchors every generated send_at to a
 * sensible business-hour window so the detail page never displays an
 * off-hour "we emailed your customer at 3 AM" timestamp.
 *
 * Returns a Date whose UTC instant displays as 09:00 in DEFAULT_TIMEZONE on
 * the same calendar day (in that timezone) as the input.
 */
export function normalizeToBusinessHour(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  // Walk a naive UTC moment at SEND_HOUR onto the real local hour by reading
  // what hour it formats as in the target zone, then adjusting by the diff.
  const naive = new Date(Date.UTC(year, month - 1, day, DEFAULT_SEND_HOUR));
  const localHourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TIMEZONE,
    hour: "numeric",
    hour12: false,
  }).format(naive);
  // "24" can come back for midnight in hour12=false locales — normalize.
  const localHour = Number(localHourStr) % 24;
  const offsetHours = DEFAULT_SEND_HOUR - localHour;
  return new Date(naive.getTime() + offsetHours * 3_600_000);
}
