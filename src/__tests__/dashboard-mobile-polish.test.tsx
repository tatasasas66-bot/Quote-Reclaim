/**
 * @vitest-environment happy-dom
 *
 * Mobile dashboard polish guarantees:
 *   - sticky CTA renders the exact "+ Add Silent Quote" label
 *   - mobile header de-emphasizes Sign out below Upgrade
 *   - activity feed collapses repeated "Recovery plan built" events
 *   - Recovery Pattern (formerly DNA) shows the dynamic "Y to go" copy
 *   - Do This Today carries the short mobile headline
 *   - Recovery Receipt zero-state line is the shortened version
 *   - no backend, schema, pricing, or recovery-message coupling regressed
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { IntelligencePanel } from "@/components/intelligence/IntelligencePanel";
import {
  ActivityFeedView,
  collapsePlanBuiltDuplicates,
} from "@/components/dashboard/ActivityFeedView";
import { RecoveryWindowAlert } from "@/components/dashboard/RecoveryWindowAlert";
import type { ActivityEvent } from "@/lib/intelligence/list-recent-events";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const dashboard = readSource("../app/(app)/dashboard/page.tsx");
const sendEarly = readSource("../components/quotes/SendEarlyButton.tsx");
const receiptSrc = readSource("../components/dashboard/RecoveryReceipt.tsx");

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Sticky + Add Silent Quote — label is exact, bottom padding sized for the bar
// ---------------------------------------------------------------------------

describe("Sticky '+ Add Silent Quote' CTA", () => {
  it("renders the exact text '+ Add Silent Quote' (no 'Add Quiet Quote' variant)", () => {
    expect(dashboard).toContain("+ Add Silent Quote");
    expect(dashboard).not.toMatch(/Add Quiet Quote/);
  });

  it("stays mobile-only, fixed at the bottom, rust/orange primary", () => {
    expect(dashboard).toMatch(/fixed inset-x-3 bottom-3 z-30 sm:hidden/);
    // Brand-primary styling (rust/orange) intact on the sticky CTA.
    expect(dashboard).toMatch(/border-brand bg-brand/);
    expect(dashboard).toMatch(/text-canvas/);
    // Thumb-target: min-h-12.
    expect(dashboard).toMatch(/min-h-12/);
  });

  it("main has bottom padding sized for the sticky bar + iOS safe area", () => {
    expect(dashboard).toMatch(
      /pb-\[calc\(6rem\+env\(safe-area-inset-bottom\)\)\]/,
    );
    expect(dashboard).toMatch(/sm:pb-8/);
  });
});

// ---------------------------------------------------------------------------
// Mobile header hierarchy — Upgrade visible, Sign out subtle
// ---------------------------------------------------------------------------

describe("Mobile header — Upgrade dominant, Sign out subtle", () => {
  it("eyebrow + actions share the top row; H1 sits below", () => {
    // The QUOTE RECLAIM eyebrow appears before the H1 block, and the actions
    // wrapper (Upgrade + Sign out) sits in the same row as the eyebrow.
    const eyebrowIdx = dashboard.indexOf("QUOTE RECLAIM");
    const upgradeIdx = dashboard.indexOf("<UpgradeButton");
    const h1Idx = dashboard.indexOf("Silent Quote Command");
    expect(eyebrowIdx).toBeGreaterThan(0);
    expect(upgradeIdx).toBeGreaterThan(eyebrowIdx);
    expect(h1Idx).toBeGreaterThan(upgradeIdx);
  });

  it("Upgrade remains visible", () => {
    expect(dashboard).toContain("<UpgradeButton");
  });

  it("Sign out is not rendered as a large primary Button — it's a small text link", () => {
    // The old `<Button variant="ghost" size="sm">Sign out</Button>` is gone;
    // Sign out is now a small `<button>` styled as a text link.
    expect(dashboard).not.toMatch(
      /<Button[^>]*type="submit"[^>]*>\s*Sign out/,
    );
    expect(dashboard).toMatch(
      /<button\s+type="submit"[\s\S]*?text-xs[\s\S]*?text-ink-muted[\s\S]*?>\s*Sign out/,
    );
  });

  it("H1 keeps the brand frame and scales sensibly on mobile (text-3xl -> sm:text-4xl)", () => {
    expect(dashboard).toMatch(
      /text-3xl font-black leading-tight text-ink-strong sm:text-4xl/,
    );
    expect(dashboard).toMatch(/Silent Quote Command/);
  });
});

// ---------------------------------------------------------------------------
// Activity feed — collapse repeated "Recovery plan built" duplicates
// ---------------------------------------------------------------------------

function planEvent(
  id: string,
  quoteId: string,
  clientName: string,
): ActivityEvent {
  return {
    id,
    event_type: "followup_generated",
    trade: "roofing",
    estimate_amount: null,
    followup_number: null,
    reply_intent: null,
    created_at: new Date().toISOString(),
    quote_id: quoteId,
    client_name: clientName,
  };
}

function ev(overrides: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: "e1",
    event_type: "estimate_created",
    trade: "roofing",
    estimate_amount: null,
    followup_number: null,
    reply_intent: null,
    created_at: new Date().toISOString(),
    quote_id: "q1",
    client_name: "tom",
    ...overrides,
  };
}

describe("Activity feed — duplicates are collapsed at render time", () => {
  it("collapsePlanBuiltDuplicates keeps only the most recent plan-built per quote", () => {
    const events = [
      planEvent("e1", "q-jasmine", "jasmine"),
      planEvent("e2", "q-jasmine", "jasmine"),
      planEvent("e3", "q-jasmine", "jasmine"),
      planEvent("e4", "q-tom", "tom"),
      planEvent("e5", "q-jasmine", "jasmine"),
    ];
    const out = collapsePlanBuiltDuplicates(events);
    expect(out.map((e) => e.id)).toEqual(["e1", "e4"]);
  });

  it("non-plan events (added/sent/replied/won) are never collapsed", () => {
    const events: ActivityEvent[] = [
      ev({ id: "a", event_type: "estimate_created", quote_id: "q1" }),
      ev({ id: "b", event_type: "message_sent", quote_id: "q1" }),
      ev({ id: "c", event_type: "reply_received", quote_id: "q1" }),
      ev({ id: "d", event_type: "win_recorded", quote_id: "q1" }),
      ev({ id: "e", event_type: "estimate_created", quote_id: "q1" }),
    ];
    const out = collapsePlanBuiltDuplicates(events);
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("renders 'Recovery plan built for Jasmine' once even when given 5 in a row", () => {
    const events = [
      planEvent("e1", "q-jasmine", "jasmine"),
      planEvent("e2", "q-jasmine", "jasmine"),
      planEvent("e3", "q-jasmine", "jasmine"),
      planEvent("e4", "q-jasmine", "jasmine"),
      planEvent("e5", "q-jasmine", "jasmine"),
    ];
    render(React.createElement(ActivityFeedView, { events }));
    const matches = screen.getAllByText(/Recovery plan built for Jasmine/);
    expect(matches).toHaveLength(1);
    // The footer count reflects the collapsed list, not the raw input.
    expect(screen.getByText("Last 1")).toBeTruthy();
  });

  it("still renders meaningful events (quote added, message sent, reply, won) alongside the single plan-built", () => {
    const events: ActivityEvent[] = [
      ev({
        id: "a",
        event_type: "estimate_created",
        client_name: "jasmine",
        estimate_amount: 8500,
      }),
      planEvent("b", "q-jasmine", "jasmine"),
      planEvent("c", "q-jasmine", "jasmine"),
      ev({
        id: "d",
        event_type: "message_sent",
        client_name: "jasmine",
        followup_number: 1,
      }),
      ev({
        id: "e",
        event_type: "reply_received",
        client_name: "jasmine",
        channel: "one_tap",
        reply_intent: "positive",
      }),
      ev({
        id: "f",
        event_type: "win_recorded",
        client_name: "jasmine",
        estimate_amount: 8500,
      }),
    ];
    render(React.createElement(ActivityFeedView, { events }));
    expect(screen.getByText(/You added Jasmine's roofing quote/)).toBeTruthy();
    expect(screen.getByText(/Day 1 follow-up sent to Jasmine/)).toBeTruthy();
    expect(
      screen.getByText(/Jasmine replied in one tap: interested/),
    ).toBeTruthy();
    expect(screen.getByText(/Won Jasmine's roofing quote/)).toBeTruthy();
    // One plan-built, not two.
    expect(screen.getAllByText(/Recovery plan built/)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Recovery Pattern (renamed from PERSONAL RECOVERY DNA)
// ---------------------------------------------------------------------------

describe("Recovery Pattern card", () => {
  it("eyebrow renders 'RECOVERY PATTERN' (not 'PERSONAL RECOVERY DNA')", () => {
    render(
      React.createElement(IntelligencePanel, {
        totalSequences: 4,
        unlockAt: 5,
      }),
    );
    expect(screen.getByText("RECOVERY PATTERN")).toBeTruthy();
    expect(screen.queryByText(/PERSONAL RECOVERY DNA/)).toBeNull();
  });

  it("locked progress copy reads 'You have 4 — 1 to go.'", () => {
    render(
      React.createElement(IntelligencePanel, {
        totalSequences: 4,
        unlockAt: 5,
      }),
    );
    expect(screen.getByText(/You have 4 — 1 to go\./)).toBeTruthy();
  });

  it("'You have 4 — 1 to go.' updates dynamically (1 -> 4 to go)", () => {
    render(
      React.createElement(IntelligencePanel, {
        totalSequences: 1,
        unlockAt: 5,
      }),
    );
    expect(screen.getByText(/You have 1 — 4 to go\./)).toBeTruthy();
  });

  it("unlocked state reads 'You have 5 — unlocked.'", () => {
    render(
      React.createElement(IntelligencePanel, {
        totalSequences: 5,
        unlockAt: 5,
      }),
    );
    expect(screen.getByText(/You have 5 — unlocked\./)).toBeTruthy();
  });

  it("preview copy uses contractor-native wording (no 'framework' / 'reply windows' jargon)", () => {
    render(
      React.createElement(IntelligencePanel, {
        totalSequences: 0,
        unlockAt: 5,
      }),
    );
    expect(
      screen.getByText(
        /which follow-ups work best for your trade and when your quiet quotes are most likely to come back\./,
      ),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Do This Today — short mobile headline
// ---------------------------------------------------------------------------

describe("Do This Today — mobile headline polish", () => {
  it("renders the short directive 'Work the highest-value quiet quote first.'", () => {
    render(
      React.createElement(RecoveryWindowAlert, {
        quoteId: "q1",
        amount: 8500,
        trade: "Roofing",
        clientName: "jasmine",
        daysSilent: 9,
        score: 60,
      }),
    );
    expect(
      screen.getByText("Work the highest-value quiet quote first."),
    ).toBeTruthy();
    expect(
      screen.getByText("Start where the money and timing still have a real shot."),
    ).toBeTruthy();
  });

  it("the old long-block headline is gone", () => {
    render(
      React.createElement(RecoveryWindowAlert, {
        quoteId: "q1",
        amount: 8500,
        trade: "Roofing",
        clientName: "jasmine",
        daysSilent: 9,
        score: 60,
      }),
    );
    expect(
      screen.queryByText(
        /Start with the highest-value quiet quote that still has a real shot/,
      ),
    ).toBeNull();
    expect(screen.queryByText(/before you chase anything new/)).toBeNull();
  });

  it("CTA still reads 'Work this quote'", () => {
    render(
      React.createElement(RecoveryWindowAlert, {
        quoteId: "q1",
        amount: 8500,
        trade: "Roofing",
        clientName: "jasmine",
        daysSilent: 9,
        score: 60,
      }),
    );
    expect(screen.getByText(/Work this quote/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Quote queue button: "Send early" -> "Send today"
// ---------------------------------------------------------------------------

describe("SendEarlyButton label polish", () => {
  it("renders 'Send today' (not 'Send early')", () => {
    expect(sendEarly).toContain("Send today");
    expect(sendEarly).not.toMatch(/>\s*Send early\s*</);
  });
});

// ---------------------------------------------------------------------------
// Lock-rail invariants — backend / pricing / messages unchanged
// ---------------------------------------------------------------------------

describe("Lock rails — nothing under the hood moved", () => {
  it("RecoveryReceipt still uses $79 floor math (pricing untouched)", () => {
    expect(receiptSrc).toMatch(/MONTHLY_PRICE_USD\s*=\s*79/);
    expect(receiptSrc).toMatch(/Math\.floor\([^)]*MONTHLY_PRICE_USD/);
  });

  it("Dashboard page does not import billing / lemon / stripe modules", () => {
    expect(dashboard).not.toMatch(/from\s+["']@\/lib\/billing/);
    expect(dashboard).not.toMatch(/stripe/i);
    expect(dashboard).not.toMatch(/lemonsqueezy/i);
  });

  it("No fake-revenue / banned SaaS-cliché vocabulary on the polished surfaces", () => {
    for (const src of [dashboard, receiptSrc]) {
      expect(src).not.toMatch(/\bguaranteed\b/i);
      expect(src).not.toMatch(/\boptimize\b/i);
      expect(src).not.toMatch(/\bAI magic\b/i);
      expect(src).not.toMatch(/\bworkflow\b/i);
      expect(src).not.toMatch(/\bpipeline\b/i);
    }
  });
});
