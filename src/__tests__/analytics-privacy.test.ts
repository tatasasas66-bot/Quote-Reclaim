/**
 * @vitest-environment happy-dom
 *
 * Privacy/safety contract for the audit analytics emit:
 *   - track() is safe when PostHog is unavailable, AND still pushes to
 *     window.__qrEvents (so paid-traffic launches without a provider
 *     wired still produce verifiable in-page evidence).
 *   - audit_completed never sends raw dollar amounts or customer fields —
 *     bucketed totals + counts + flags only.
 *   - The PostHog provider source enforces no-autocapture and no-session-
 *     recording defaults, gates on NEXT_PUBLIC_POSTHOG_KEY existing, and
 *     lazy-imports posthog-js so the bundle stays light when unconfigured.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { bucketCurrency, readUtms } from "@/lib/analytics/privacy";
import { track } from "@/lib/analytics/track";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const providerSrc = readSource("../lib/analytics/PostHogProvider.tsx");
const trackSrc = readSource("../lib/analytics/track.ts");

// ---------------------------------------------------------------------------
// bucketCurrency — coarse buckets, no raw amounts ever
// ---------------------------------------------------------------------------

describe("bucketCurrency", () => {
  it("maps amounts to the five documented buckets", () => {
    expect(bucketCurrency(0)).toBe("0_999");
    expect(bucketCurrency(999.99)).toBe("0_999");
    expect(bucketCurrency(1_000)).toBe("1000_2499");
    expect(bucketCurrency(2_499)).toBe("1000_2499");
    expect(bucketCurrency(2_500)).toBe("2500_4999");
    expect(bucketCurrency(4_999)).toBe("2500_4999");
    expect(bucketCurrency(5_000)).toBe("5000_9999");
    expect(bucketCurrency(9_999)).toBe("5000_9999");
    expect(bucketCurrency(10_000)).toBe("10000_plus");
    expect(bucketCurrency(1_000_000)).toBe("10000_plus");
  });

  it("rejects negatives / NaN / Infinity as 'invalid'", () => {
    expect(bucketCurrency(-1)).toBe("invalid");
    expect(bucketCurrency(Number.NaN)).toBe("invalid");
    expect(bucketCurrency(Number.POSITIVE_INFINITY)).toBe("invalid");
  });
});

// ---------------------------------------------------------------------------
// readUtms — UTMs only, length-capped, everything else dropped
// ---------------------------------------------------------------------------

describe("readUtms", () => {
  it("captures every documented UTM param", () => {
    const utms = readUtms(
      "?utm_source=reddit&utm_medium=cpc&utm_campaign=painters&utm_content=ad1&utm_term=silent",
    );
    expect(utms).toEqual({
      utm_source: "reddit",
      utm_medium: "cpc",
      utm_campaign: "painters",
      utm_content: "ad1",
      utm_term: "silent",
    });
  });

  it("drops fbclid, gclid, and every non-UTM param", () => {
    const utms = readUtms(
      "?utm_source=meta&fbclid=abc&gclid=xyz&user_id=secret&email=a@b.com",
    );
    expect(utms).toEqual({ utm_source: "meta" });
    expect(JSON.stringify(utms)).not.toContain("@");
    expect(JSON.stringify(utms)).not.toContain("fbclid");
  });

  it("caps each UTM value to 100 characters", () => {
    const long = "x".repeat(500);
    const utms = readUtms(`?utm_source=${long}`);
    expect(utms.utm_source).toHaveLength(100);
  });

  it("returns an empty object on an empty / undefined search string", () => {
    expect(readUtms("")).toEqual({});
    expect(readUtms("?")).toEqual({});
    // @ts-expect-error — defensive runtime call
    expect(readUtms(undefined)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// track() safety contract — never breaks the page
// ---------------------------------------------------------------------------

describe("track() is safe when PostHog is unavailable AND still records locally", () => {
  beforeEach(() => {
    // Fresh window state for each test (vitest with happy-dom shares window).
    const w = window as unknown as {
      posthog?: unknown;
      __qrEvents?: unknown;
      dataLayer?: unknown;
    };
    delete w.posthog;
    delete w.__qrEvents;
    delete w.dataLayer;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not throw when window.posthog is missing", () => {
    expect(() => track("audit_page_viewed", { utm_source: "reddit" })).not.toThrow();
  });

  it("pushes to window.__qrEvents even without a provider", () => {
    track("audit_completed", { quote_count: 3, total_silent_quote_value_bucket: "5000_9999" });
    const ledger = (window as unknown as { __qrEvents?: Array<{ event: string; props: Record<string, unknown> }> })
      .__qrEvents ?? [];
    expect(ledger).toHaveLength(1);
    expect(ledger[0].event).toBe("audit_completed");
    expect(ledger[0].props.quote_count).toBe(3);
    expect(ledger[0].props.total_silent_quote_value_bucket).toBe("5000_9999");
  });

  it("forwards to window.posthog.capture when a global is wired", () => {
    const capture = vi.fn();
    (window as unknown as { posthog: { capture: typeof capture } }).posthog = { capture };
    track("audit_signup_clicked", { utm_source: "meta" });
    expect(capture).toHaveBeenCalledWith("audit_signup_clicked", { utm_source: "meta" });
  });

  it("never logs the props payload to console (no incidental leak)", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    track("audit_started", { utm_source: "reddit", utm_campaign: "p1" });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("the track helper source bans direct posthog-js imports (lazy-loaded by the provider)", () => {
    expect(trackSrc).not.toMatch(/from ["']posthog-js["']/);
  });

  it("adds only lightweight manual SMS and WhatsApp message events", () => {
    for (const event of [
      "sms_opened",
      "sms_copied",
      "whatsapp_opened",
      "whatsapp_copied",
    ]) {
      expect(trackSrc).toContain(`"${event}"`);
    }
    for (const removed of [
      "flagship_feature_viewed",
      "playbook_viewed",
      "quote_rescue_score_viewed",
      "followup_schedule_viewed",
      "checkout_started",
      "signup_completed",
    ]) {
      expect(trackSrc).not.toContain(`"${removed}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// PostHog provider — env-gated, privacy-defaulted, lazy-loaded
// ---------------------------------------------------------------------------

describe("PostHog provider source — env-gated and privacy-defaulted", () => {
  it("gates initialization on NEXT_PUBLIC_POSTHOG_KEY existing", () => {
    expect(providerSrc).toContain("NEXT_PUBLIC_POSTHOG_KEY");
    expect(providerSrc).toMatch(/if \(!key\) return;/);
  });

  it("uses NEXT_PUBLIC_POSTHOG_HOST with the US default fallback", () => {
    expect(providerSrc).toContain("NEXT_PUBLIC_POSTHOG_HOST");
    expect(providerSrc).toContain("https://us.i.posthog.com");
  });

  it("lazy-imports posthog-js so unconfigured deployments take zero bundle weight", () => {
    expect(providerSrc).toMatch(/import\(["']posthog-js["']\)/);
    // No top-level `import ... from "posthog-js"` line.
    expect(providerSrc).not.toMatch(/^import .* from ["']posthog-js["']/m);
  });

  it("initializes with autocapture OFF, session recording OFF, manual pageviews", () => {
    expect(providerSrc).toMatch(/autocapture:\s*false/);
    expect(providerSrc).toMatch(/disable_session_recording:\s*true/);
    expect(providerSrc).toMatch(/capture_pageview:\s*false/);
    expect(providerSrc).toMatch(/capture_pageleave:\s*false/);
    expect(providerSrc).toMatch(/mask_all_text:\s*true/);
    expect(providerSrc).toMatch(/respect_dnt:\s*true/);
  });

  it("does NOT call identify() — distinct ids stay anonymous", () => {
    // Scan only non-comment lines so the docstring noting the absence of
    // identify() doesn't trip the assertion.
    const codeOnly = providerSrc
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");
    expect(codeOnly).not.toMatch(/posthog\.identify\s*\(/);
    expect(codeOnly).not.toMatch(/\.identify\s*\(/);
  });

  it("always renders its children (never blocks layout)", () => {
    // The pass-through render is what keeps the app working when the env is
    // unset, network blocks the CDN, or the lazy import fails.
    expect(providerSrc).toContain("return <>{children}</>;");
  });
});
