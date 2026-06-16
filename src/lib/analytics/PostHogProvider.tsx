"use client";

import * as React from "react";

/**
 * Minimal PostHog provider. Renders only as a side-effect host: it ALWAYS
 * returns its children unchanged, so layout rendering is never blocked or
 * conditional on analytics.
 *
 * Initialization is gated on NEXT_PUBLIC_POSTHOG_KEY existing at build time.
 * When the key is absent (local dev without env, preview branches without
 * analytics, etc.), the provider is a no-op: no import, no bundle weight
 * pulled at runtime, no errors. When the key IS present, posthog-js is
 * lazy-loaded (dynamic import) on mount and attached to window.posthog —
 * which is exactly what the existing vendor-agnostic `track()` helper
 * already forwards to.
 *
 * Defaults are deliberately privacy-leaning:
 *   - autocapture OFF: we never capture random clicks/inputs. Only the
 *     events we explicitly fire via `track()` are sent.
 *   - session recording OFF: never record the screen.
 *   - mask_all_text true: defense in depth — if a future code change ever
 *     re-enables autocapture by accident, no text values escape.
 *   - capture_pageview/pageleave OFF: we fire `audit_page_viewed` manually
 *     so the funnel can stay clean; pageview spray adds noise without value.
 *   - respect_dnt true: honor browser Do-Not-Track.
 *
 * This file does NOT call posthog.identify(). Distinct IDs stay anonymous
 * (random) so paid-traffic attribution flows without ever sending a name
 * or email to PostHog.
 */
export function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
      "https://us.i.posthog.com";

    // Already initialized (e.g. fast-refresh, second mount) — don't re-init.
    if ((window as unknown as { posthog?: unknown }).posthog) return;

    import("posthog-js")
      .then(({ default: posthog }) => {
        posthog.init(key, {
          api_host: host,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          mask_all_text: true,
          respect_dnt: true,
        });
        (window as unknown as { posthog?: unknown }).posthog = posthog;
      })
      .catch(() => {
        // Lazy import or init failure — silent. The track() helper will
        // continue to push to window.__qrEvents and dataLayer regardless.
      });
  }, []);

  return <>{children}</>;
}
