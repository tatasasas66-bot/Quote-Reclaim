/**
 * Vendor-agnostic client event hook.
 *
 * The app does not currently wire a dedicated analytics provider, and this
 * file deliberately does NOT add one. `track()` opportunistically forwards to
 * whatever global analytics happens to exist at runtime (PostHog, GTM's
 * dataLayer) and always records the event locally — so events flow the moment
 * any provider is configured, and nothing breaks before then.
 *
 * SSR-safe and failure-proof: it no-ops on the server and swallows every
 * error, because analytics must never take a landing page down.
 */
export type AuditEvent =
  | "audit_page_viewed"
  | "audit_started"
  | "audit_completed"
  | "audit_signup_clicked";

export type CrewGapEvent =
  | "crew_gap_page_viewed"
  | "crew_gap_started"
  | "crew_gap_completed"
  | "crew_gap_signup_clicked";

export type TrackEvent = AuditEvent | CrewGapEvent;

export type TrackProps = Record<string, string | number | boolean | null>;

export function track(event: TrackEvent, props: TrackProps = {}): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as {
      posthog?: { capture?: (event: string, props?: TrackProps) => void };
      dataLayer?: Array<Record<string, unknown>>;
      __qrEvents?: Array<{ event: string; props: TrackProps; t: number }>;
    };
    // PostHog, if a future global init exists (no import, no bundle weight).
    w.posthog?.capture?.(event, props);
    // GTM dataLayer, if present.
    if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event, ...props });
    }
    // Always: an in-page ledger + a DOM event for debugging / custom listeners.
    (w.__qrEvents ??= []).push({ event, props, t: Date.now() });
    window.dispatchEvent(new CustomEvent("qr:track", { detail: { event, props } }));
  } catch {
    // never let analytics break the page
  }
}
