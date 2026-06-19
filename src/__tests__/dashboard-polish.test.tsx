/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { recoveryPriority } from "@/lib/quotes/recovery-score";
import {
  ActivityFeedView,
  describeActivity,
} from "@/components/dashboard/ActivityFeedView";
import type { ActivityEvent } from "@/lib/intelligence/list-recent-events";

const SRC_ROOT = join(process.cwd(), "src");

const heroMetric = readFileSync(
  join(SRC_ROOT, "components/dashboard/HeroMetric.tsx"),
  "utf8",
);

afterEach(cleanup);

// ---------------------------------------------------------------------------
// HeroMetric now hosts the Recovered So Far proof column, while preserving the
// money-still-quiet hero. (Detailed receipt behavior lives in
// recovery-receipt.test.tsx.)
// ---------------------------------------------------------------------------

describe("HeroMetric — value column is the recovered proof", () => {
  it("preserves the Money Still Quiet hero", () => {
    expect(heroMetric).toContain("MONEY STILL QUIET");
  });

  it("renders the Recovered So Far column component on the right", () => {
    expect(heroMetric).toContain("RecoveryReceipt");
  });

  it("no longer keeps a duplicate inline Months Paid ledger stat", () => {
    // The months-paid math moved into RecoveryReceipt; HeroMetric should not
    // also compute/render its own copy.
    expect(heroMetric).not.toContain("MONTHS PAID FOR");
    expect(heroMetric).not.toContain("LedgerSideStat");
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — LIVE LEDGER removed
// ---------------------------------------------------------------------------

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectSources(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("LIVE LEDGER badge is gone everywhere", () => {
  it('no source renders the decorative "Live ledger" badge', () => {
    const offenders = collectSources(SRC_ROOT).filter((p) =>
      /live ledger/i.test(readFileSync(p, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Phase 2.1 — "file" never refers to a quote
// ---------------------------------------------------------------------------

describe('Banned quote-as-"file" vocabulary', () => {
  const sources = collectSources(SRC_ROOT).map((path) => ({
    path,
    content: readFileSync(path, "utf8"),
  }));

  it('no source contains "money file"', () => {
    const hits = sources.filter((s) => /money file/i.test(s.content));
    expect(hits.map((h) => h.path)).toEqual([]);
  });

  it('no source contains "coldest file"', () => {
    const hits = sources.filter((s) => /coldest file/i.test(s.content));
    expect(hits.map((h) => h.path)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — Recovery Priority scale
// ---------------------------------------------------------------------------

describe("recoveryPriority bands", () => {
  it("maps 86-100 to LOW", () => {
    expect(recoveryPriority(100).label).toBe("LOW");
    expect(recoveryPriority(86).label).toBe("LOW");
  });

  it("maps 72-85 to MEDIUM", () => {
    expect(recoveryPriority(85).label).toBe("MEDIUM");
    expect(recoveryPriority(72).label).toBe("MEDIUM");
  });

  it("maps 55-71 to HIGH", () => {
    expect(recoveryPriority(71).label).toBe("HIGH");
    expect(recoveryPriority(55).label).toBe("HIGH");
  });

  it("maps 0-54 to CRITICAL", () => {
    expect(recoveryPriority(54).label).toBe("CRITICAL");
    expect(recoveryPriority(0).label).toBe("CRITICAL");
  });

  it("CRITICAL is red, LOW is gold", () => {
    expect(recoveryPriority(10).barClass).toBe("bg-danger");
    expect(recoveryPriority(10).labelClass).toBe("text-danger");
    expect(recoveryPriority(95).barClass).toBe("bg-money");
  });
});

// ---------------------------------------------------------------------------
// Phase 6 — Activity Feed
// ---------------------------------------------------------------------------

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

describe("ActivityFeedView 0-state", () => {
  it("renders the empty-state copy when there are no events, without a 'Last 0' chip", () => {
    render(<ActivityFeedView events={[]} />);
    expect(
      screen.getByText(
        /Activity will appear here as Quote Reclaim works in the background\./,
      ),
    ).toBeTruthy();
    // The header count chip is hidden on an empty feed so the section never
    // shows "Last 0" beside the empty-state copy.
    expect(screen.queryByText("Last 0")).toBeNull();
  });

  it("renders an event row when events exist", () => {
    render(
      <ActivityFeedView
        events={[ev({ event_type: "reply_received", client_name: "sarah" })]}
      />,
    );
    expect(
      screen.getByText("Sarah replied to your roofing quote"),
    ).toBeTruthy();
  });
});

describe("describeActivity copy + tone per event type", () => {
  it("estimate_created", () => {
    const { text, tone } = describeActivity(
      ev({ event_type: "estimate_created", estimate_amount: 8500 }),
    );
    // Folds the hidden plan-built line into one useful line.
    expect(text).toBe("Tom added · 5 follow-ups scheduled");
    expect(tone).toBe("neutral");
  });

  it("followup_generated", () => {
    expect(describeActivity(ev({ event_type: "followup_generated" }))).toEqual({
      text: "Recovery plan built for Tom",
      tone: "neutral",
    });
  });

  it("message_sent is rust and includes the follow-up day", () => {
    const { text, tone } = describeActivity(
      ev({ event_type: "message_sent", followup_number: 2 }),
    );
    expect(text).toBe("Day 2 follow-up sent to Tom (roofing)");
    expect(tone).toBe("rust");
  });

  it("message_delivered", () => {
    expect(describeActivity(ev({ event_type: "message_delivered" })).text).toBe(
      "Message delivered to Tom",
    );
  });

  it("reply_received is success", () => {
    expect(describeActivity(ev({ event_type: "reply_received" })).tone).toBe(
      "success",
    );
  });

  it("win_recorded is success and includes the recovered amount", () => {
    const { text, tone } = describeActivity(
      ev({ event_type: "win_recorded", estimate_amount: 12000 }),
    );
    expect(text).toBe("Tom won · $12,000 recovered");
    expect(tone).toBe("success");
  });

  it("sequence_closed", () => {
    expect(describeActivity(ev({ event_type: "sequence_closed" })).text).toBe(
      "Sequence closed for Tom",
    );
  });

  it("opt_out is a warning", () => {
    expect(describeActivity(ev({ event_type: "opt_out" })).tone).toBe(
      "warning",
    );
  });

  it("falls back to the raw event type for unknown events", () => {
    expect(describeActivity(ev({ event_type: "mystery" })).text).toBe(
      "mystery",
    );
  });
});
