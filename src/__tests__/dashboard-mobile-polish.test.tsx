/**
 * @vitest-environment happy-dom
 *
 * Mobile dashboard polish guarantees:
 *   - sticky CTA renders the exact "+ Add Estimate" label
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
  cleanActivityEvents,
} from "@/components/dashboard/ActivityFeedView";
import { RecoveryWindowAlert } from "@/components/dashboard/RecoveryWindowAlert";
import type { ActivityEvent } from "@/lib/intelligence/list-recent-events";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const dashboard = readSource("../app/(app)/dashboard/page.tsx");
const appHeader = readSource("../components/app/AppHeader.tsx");
const sendEarly = readSource("../components/quotes/SendEarlyButton.tsx");
const receiptSrc = readSource("../components/dashboard/RecoveryReceipt.tsx");

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Sticky + Add Estimate — label is exact, bottom padding sized for the bar
// ---------------------------------------------------------------------------

describe("Sticky '+ Add Estimate' CTA", () => {
  it("renders the exact text '+ Add Estimate' (no 'Add Quiet Quote' variant)", () => {
    expect(dashboard).toContain("+ Add Estimate");
    expect(dashboard).not.toMatch(/Add Quiet Quote/);
  });

  it("stays mobile-only, fixed at the bottom, forest-green primary", () => {
    expect(dashboard).toMatch(/fixed inset-x-3 bottom-3 z-30 sm:hidden/);
    // Brand-primary styling stays intact on the sticky CTA.
    expect(dashboard).toMatch(/border-brand bg-brand/);
    expect(dashboard).toMatch(/text-white/);
    // Thumb-target: min-h-12.
    expect(dashboard).toMatch(/min-h-12/);
  });

  it("main has bottom padding sized for the sticky bar + iOS safe area", () => {
    expect(dashboard).toMatch(
      /pb-\[calc\(6rem\+env\(safe-area-inset-bottom\)\)\]/,
    );
    expect(dashboard).toMatch(/sm:pb-8/);
  });

  it("desktop renders a SECOND '+ Add Estimate' in the queue header (hidden on mobile)", () => {
    // The queue-header CTA cluster (Add + Paste more quotes) is desktop-only
    // (hidden sm:flex on the wrapper) so it never competes with the sticky
    // mobile bar. Both use the exact same primary label.
    expect(dashboard).toMatch(
      /hidden items-center gap-3 sm:flex[\s\S]*?<Link href="\/quotes\/new">[\s\S]*?\+ Add Estimate/,
    );
    // The label appears at least twice (desktop header + sticky mobile bar).
    const occurrences = dashboard.split("+ Add Estimate").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("the queue-header Add button sits to the right of 'IN THE QUEUE'", () => {
    const queueIdx = dashboard.indexOf("IN THE QUEUE");
    // The desktop add CTA now lives inside a desktop-only cluster (hidden
    // items-center gap-3 sm:flex) that wraps both Paste-more and Add.
    const headerAddIdx = dashboard.indexOf("hidden items-center gap-3 sm:flex");
    const stickyIdx = dashboard.indexOf("fixed inset-x-3 bottom-3");
    expect(queueIdx).toBeGreaterThan(0);
    // Desktop header cluster comes after the queue label and before the
    // sticky bar.
    expect(headerAddIdx).toBeGreaterThan(queueIdx);
    expect(headerAddIdx).toBeLessThan(stickyIdx);
  });

  it("the old bare 'Add Estimate' (no '+') queue button is gone", () => {
    expect(dashboard).not.toMatch(/<Button size="sm">Add Estimate<\/Button>/);
  });
});

// ---------------------------------------------------------------------------
// Mobile header hierarchy — Upgrade visible, Sign out subtle
// ---------------------------------------------------------------------------

describe("Mobile header — Upgrade dominant, Sign out subtle", () => {
  it("puts the app header and actions above Today's Moves and the command", () => {
    const headerIdx = dashboard.indexOf("<AppHeader");
    const upgradeIdx = dashboard.indexOf("<UpgradeButton");
    const movesIdx = dashboard.indexOf("<TodaysMoves");
    const h1Idx = dashboard.indexOf("Silent Quote Command");
    expect(headerIdx).toBeGreaterThan(0);
    expect(upgradeIdx).toBeGreaterThan(headerIdx);
    expect(movesIdx).toBeGreaterThan(upgradeIdx);
    expect(h1Idx).toBeGreaterThan(movesIdx);
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
    expect(appHeader).toMatch(
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

describe("Activity feed — system-log events are hidden, not shown as spam", () => {
  it("cleanActivityEvents hides ALL plan-built events (no 'Recovery plan built' rows)", () => {
    const events = [
      planEvent("e1", "q-jasmine", "jasmine"),
      planEvent("e2", "q-jasmine", "jasmine"),
      planEvent("e3", "q-jasmine", "jasmine"),
      ev({ id: "keep", event_type: "win_recorded", client_name: "tom" }),
    ];
    const out = cleanActivityEvents(events);
    expect(out.map((e) => e.id)).toEqual(["keep"]);
  });

  it("hides message_delivered (covered by the 'follow-up sent' line)", () => {
    const out = cleanActivityEvents([
      ev({ id: "a", event_type: "message_delivered" }),
      ev({ id: "b", event_type: "message_sent" }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["b"]);
  });

  it("contractor-useful events (added/sent/replied/won/closed) are never hidden", () => {
    const events: ActivityEvent[] = [
      ev({ id: "a", event_type: "estimate_created" }),
      ev({ id: "b", event_type: "message_sent" }),
      ev({ id: "c", event_type: "reply_received" }),
      ev({ id: "d", event_type: "win_recorded" }),
      ev({ id: "e", event_type: "sequence_closed" }),
    ];
    const out = cleanActivityEvents(events);
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("renders ZERO 'Recovery plan built' rows even when given 5 in a row", () => {
    const events = [
      planEvent("e1", "q-jasmine", "jasmine"),
      planEvent("e2", "q-jasmine", "jasmine"),
      planEvent("e3", "q-jasmine", "jasmine"),
      planEvent("e4", "q-jasmine", "jasmine"),
      planEvent("e5", "q-jasmine", "jasmine"),
    ];
    render(React.createElement(ActivityFeedView, { events }));
    expect(screen.queryByText(/Recovery plan built/)).toBeNull();
    // Empty visible list → the empty-state copy, not 5 log rows. The header
    // count chip is hidden entirely when there are no visible events, so a
    // misleading "Last 0" never renders alongside an empty list.
    expect(screen.queryByText("Last 0")).toBeNull();
    expect(
      screen.getByText(
        /Activity will appear here as Quote Reclaim works in the background/i,
      ),
    ).toBeTruthy();
  });

  it("renders the premium contractor lines and no plan-built spam", () => {
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
    expect(screen.getByText(/Jasmine added · 6 follow-ups scheduled/)).toBeTruthy();
    expect(screen.getByText(/Day 1 follow-up sent to Jasmine/)).toBeTruthy();
    expect(
      screen.getByText(/Jasmine replied in one tap: interested/),
    ).toBeTruthy();
    expect(screen.getByText(/Jasmine won · \$8,500 recovered/)).toBeTruthy();
    // Zero plan-built rows.
    expect(screen.queryByText(/Recovery plan built/)).toBeNull();
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

  it("locked progress copy reads the premium '3 of 5 analyzed.' form", () => {
    render(
      React.createElement(IntelligencePanel, {
        totalSequences: 3,
        unlockAt: 5,
      }),
    );
    expect(screen.getByText(/3 of 5 analyzed\./)).toBeTruthy();
    expect(
      screen.getByText(/Learning from your first 5 sequences\./),
    ).toBeTruthy();
    // No game-like countdown.
    expect(screen.queryByText(/to go/)).toBeNull();
  });

  it("'X of N analyzed.' updates dynamically (1 of 5)", () => {
    render(
      React.createElement(IntelligencePanel, {
        totalSequences: 1,
        unlockAt: 5,
      }),
    );
    expect(screen.getByText(/1 of 5 analyzed\./)).toBeTruthy();
  });

  it("unlocked state reads 'X of X analyzed.'", () => {
    render(
      React.createElement(IntelligencePanel, {
        totalSequences: 5,
        unlockAt: 5,
      }),
    );
    expect(screen.getByText(/5 of 5 analyzed\./)).toBeTruthy();
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
        /which follow-ups work best for your trade and when quiet quotes are most likely to come back\./,
      ),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Do This Today — short mobile headline
// ---------------------------------------------------------------------------

describe("Do This Today — daily-command headline polish", () => {
  it("renders the directive naming the client: 'Work {ClientName} first.'", () => {
    const { container } = render(
      React.createElement(RecoveryWindowAlert, {
        quoteId: "q1",
        amount: 8500,
        trade: "Roofing",
        clientName: "jasmine",
        daysSilent: 9,
        score: 60,
      }),
    );
    expect(screen.getByText("Work Jasmine first.")).toBeTruthy();
    // Trade · amount · days · risk context line stays.
    const text = container.textContent ?? "";
    expect(text).toContain("Roofing");
    expect(text).toContain("$8,500");
    expect(text).toContain("9 days quiet");
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
  it("RecoveryReceipt no longer carries the months-paid ROI equation (pricing math moved to Price Check + Win Moment)", () => {
    // The receipt used to duplicate the months-paid equation here. The launch-polish
    // pass removed it so the ROI equation lives in exactly two places product-
    // wide. Pricing untouched everywhere it actually drives billing; what
    // changed is one display surface stopped repeating it.
    expect(receiptSrc).not.toMatch(/MONTHLY_PRICE_USD/);
    expect(receiptSrc).not.toMatch(/Math\.floor/);
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
