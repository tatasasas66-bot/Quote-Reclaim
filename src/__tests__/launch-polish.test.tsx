/**
 * @vitest-environment happy-dom
 *
 * Narrow launch-readiness polish — six fixes, one test file.
 *
 *   1. ROI framing helper caps the "151 months" absurdity above 24 months.
 *   2. ROI equation appears in exactly TWO places product-wide (Price Check
 *      + Win Moment), never three.
 *   4. tradeLabel preserves HVAC as an acronym across every surface.
 *   5. Meta-line separator is the middot — "HVAC · DC", never "Hvac, DC".
 *   6. priorityBarFill maps score → fill % inside the label's band.
 *   7. Activity feed renders "Latest" for count=1, never "Last 1".
 *   8. emailFollowupsSent filters to sent=true and is labeled "Follow-ups
 *      sent this month".
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import { roiFraming, roiPieces } from "@/lib/utils/roi-framing";
import { tradeLabel, tradeLocationLine } from "@/lib/quotes/quote-display";
import { priorityBarFill, recoveryPriority } from "@/lib/quotes/recovery-score";
import { ActivityFeedView } from "@/components/dashboard/ActivityFeedView";
import { PaidForItselfMeter } from "@/components/dashboard/PaidForItselfMeter";
import type { ActivityEvent } from "@/lib/intelligence/list-recent-events";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const meterSrc = readSource("../components/dashboard/PaidForItselfMeter.tsx");
const winSrc = readSource("../components/dashboard/WinMomentOverlay.tsx");
const receiptSrc = readSource("../components/dashboard/RecoveryReceipt.tsx");
const repoSrc = readSource("../lib/quotes/repo.ts");
const heroSrc = readSource("../components/dashboard/HeroMetric.tsx");
const dashboardSrc = readSource("../app/(app)/dashboard/page.tsx");
const queueItemSrc = readSource("../components/quotes/QuoteListItem.tsx");
const wonGallerySrc = readSource("../components/dashboard/WonJobsGallery.tsx");
const windowAlertSrc = readSource(
  "../components/dashboard/RecoveryWindowAlert.tsx",
);

afterEach(() => cleanup());

// ───────────────────────────────────────────────────────────────────────
// FIX 1 — roiFraming helper behavior
// ───────────────────────────────────────────────────────────────────────

describe("FIX 1 — roiFraming helper", () => {
  it("sub-month: returns a humble line, never '0 months'", () => {
    expect(roiFraming(0)).toBe("less than 1 month of Quote Reclaim");
    // Below the $79 monthly price -> still sub-month.
    expect(roiFraming(40)).toBe("less than 1 month of Quote Reclaim");
    expect(roiFraming(-100)).toBe("less than 1 month of Quote Reclaim");
    expect(roiFraming(Number.NaN)).toBe("less than 1 month of Quote Reclaim");
  });

  it("exact spec examples at $79/month: 948, 1580, 4000, 12000", () => {
    expect(roiFraming(948)).toBe("12 months of Quote Reclaim"); // floor(948/79)=12
    expect(roiFraming(1580)).toBe("20 months of Quote Reclaim"); // floor(1580/79)=20
    expect(roiFraming(4000)).toBe("4x a full year of Quote Reclaim"); // floor(4000/948)=4
    expect(roiFraming(12000)).toBe("12x a full year of Quote Reclaim"); // floor(12000/948)=12
  });

  it("boundary: floor at exactly 24 months stays in months phrasing; one cent past flips to years", () => {
    // 24 * 79 = 1896 -> exactly 24 months
    expect(roiFraming(1896)).toBe("24 months of Quote Reclaim");
    // 25 * 79 = 1975 -> 25 months, but 25 > 24 so we flip
    expect(roiFraming(1975)).toBe(
      `${Math.floor(1975 / 948)}x a full year of Quote Reclaim`,
    );
  });

  it("always floors — never rounds up (overclaim guard)", () => {
    // 79*24 + 78 = 1974 -> still 24 months
    expect(roiFraming(1974)).toBe("24 months of Quote Reclaim");
  });

  it("roiPieces returns the structured shape callers can compose around", () => {
    expect(roiPieces(40)).toEqual({ kind: "subMonth" });
    expect(roiPieces(948)).toEqual({ kind: "months", months: 12 });
    expect(roiPieces(4000)).toEqual({ kind: "years", yearMultiple: 4 });
    expect(roiPieces(12000)).toEqual({ kind: "years", yearMultiple: 12 });
  });
});

// ───────────────────────────────────────────────────────────────────────
// FIX 2 — Exactly two ROI placements in the product
// ───────────────────────────────────────────────────────────────────────

describe("FIX 2 — ROI equation lives in exactly two places product-wide", () => {
  it("Price Check (PaidForItselfMeter) imports roiFraming and renders the phrase", () => {
    expect(meterSrc).toContain('from "@/lib/utils/roi-framing"');
    expect(meterSrc).toMatch(/roiFraming\(biggestQuoteAmount\)/);
    // The disclaimer line is preserved verbatim — that's the trust anchor.
    expect(meterSrc).toContain("Straight math from your own queue");
    expect(meterSrc).toContain("No promises");
    expect(meterSrc).toContain("size of the opportunity");
  });

  it("Price Check headline uses the short emphasized phrase and wraps inside the card", () => {
    // Headline: "If this one comes back, that's 12x a full year." — the long
    // "covers 12x a full year of Quote Reclaim" headline could push outside
    // the card. The emphasized span must NOT be nowrap; the card is min-w-0
    // and both paragraphs break-words so nothing escapes at 125% zoom.
    expect(meterSrc).toContain("that&apos;s");
    expect(meterSrc).not.toMatch(/that covers/);
    expect(meterSrc).toMatch(/min-w-0 rounded-lg border border-money\/30/);
    expect(meterSrc).toMatch(/break-words text-2xl/);
    expect(meterSrc).not.toMatch(/whitespace-nowrap text-money/);
  });

  it("Price Check $12,000: headline says \"that's 12x a full year\", body carries the full phrase once", () => {
    const { container } = render(
      React.createElement(PaidForItselfMeter, {
        biggestQuoteName: "david harris",
        biggestQuoteAmount: 12_000,
        queueTotal: 31_000,
        pendingCount: 4,
      }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("If this one comes back, that's 12x a full year.");
    expect(text).toContain("If it comes back, that's 12x a full year of Quote Reclaim.");
    expect(text).not.toContain("covers 12x a full year");
    expect(text).not.toMatch(/151 months|\d{3,} months/);
    // Disclaimer preserved exactly.
    expect(text).toContain("Straight math from your own queue: $12,000 ÷ $79/month.");
    expect(text).toContain("No promises — just the size of the opportunity.");
  });

  it("WinMomentOverlay imports roiPieces and switches phrasing above 24 months", () => {
    expect(winSrc).toContain('from "@/lib/utils/roi-framing"');
    expect(winSrc).toMatch(/roiPieces\(amount\)/);
    expect(winSrc).toContain("x over for a full year");
    expect(winSrc).toContain("paid for Quote Reclaim");
    // Sub-month branch has a humble line so $50 never reads as "0 months".
    expect(winSrc).toContain("This one job is on the board.");
  });

  it("Recovery Receipt does NOT import roi-framing — the ROI equation has been removed from this surface", () => {
    expect(receiptSrc).not.toMatch(/roi-framing|roiFraming|roiPieces/);
    expect(receiptSrc).not.toMatch(/months paid/i);
    expect(receiptSrc).not.toMatch(/MONTHLY_PRICE_USD/);
    expect(receiptSrc).not.toMatch(/Math\.floor/);
  });

  it("no other surface in app/ or components/ imports roi-framing (the contract is two callers, exactly)", () => {
    // The helper is used by exactly two callers. Any new caller must be
    // justified — three repetitions of the equation in one journey reads as
    // pleading.
    const allowed = [
      "components/dashboard/PaidForItselfMeter.tsx",
      "components/dashboard/WinMomentOverlay.tsx",
    ].sort();
    const srcRoot = join(process.cwd(), "src");
    function walk(dir: string, rel: string, out: string[]) {
      for (const entry of readdirSync(dir)) {
        if (entry === "__tests__") continue;
        const full = join(dir, entry);
        const relPath = rel ? `${rel}/${entry}` : entry;
        if (statSync(full).isDirectory()) walk(full, relPath, out);
        else if (/\.(tsx?|css)$/.test(entry)) out.push(relPath);
      }
    }
    const files: string[] = [];
    for (const top of ["app", "components"]) {
      walk(join(srcRoot, top), top, files);
    }
    const callers = files.filter((rel) => {
      const content = readFileSync(join(srcRoot, rel), "utf8");
      return /from\s+["']@\/lib\/utils\/roi-framing["']/.test(content);
    });
    expect(callers.sort()).toEqual(allowed);
  });
});

// ───────────────────────────────────────────────────────────────────────
// FIX 4 + FIX 5 — Trade label casing + meta-line separator
// ───────────────────────────────────────────────────────────────────────

describe("FIX 4 — tradeLabel preserves acronyms across every surface", () => {
  it("HVAC stays HVAC regardless of input casing", () => {
    expect(tradeLabel("hvac")).toBe("HVAC");
    expect(tradeLabel("HVAC")).toBe("HVAC");
    expect(tradeLabel("Hvac")).toBe("HVAC");
    expect(tradeLabel("  hvac  ")).toBe("HVAC");
  });

  it("other canonical trades titlecase normally", () => {
    expect(tradeLabel("roofing")).toBe("Roofing");
    expect(tradeLabel("plumbing")).toBe("Plumbing");
    expect(tradeLabel("electrical")).toBe("Electrical");
    expect(tradeLabel("remodeling")).toBe("Remodeling");
    expect(tradeLabel("general contracting")).toBe("General Contracting");
    expect(tradeLabel("painting")).toBe("Painting");
    expect(tradeLabel("landscaping")).toBe("Landscaping");
    expect(tradeLabel("concrete")).toBe("Concrete");
    expect(tradeLabel("flooring")).toBe("Flooring");
    expect(tradeLabel("fencing")).toBe("Fencing");
  });

  it("unknown trades fall through to titleCase so legacy/freeform values still render", () => {
    expect(tradeLabel("solar")).toBe("Solar");
  });

  it("blank/null/undefined returns empty so callers can branch off truthiness", () => {
    expect(tradeLabel(null)).toBe("");
    expect(tradeLabel(undefined)).toBe("");
    expect(tradeLabel("")).toBe("");
    expect(tradeLabel("   ")).toBe("");
  });

  it("the queue card, the won-jobs gallery, the do-this-today alert, and the dashboard COLDEST stat all route through tradeLabel", () => {
    expect(queueItemSrc).toContain("tradeLocationLine");
    expect(wonGallerySrc).toContain("tradeLabel");
    expect(windowAlertSrc).toContain("tradeLabel");
    expect(dashboardSrc).toContain("tradeLabel(coldest.trade)");
  });
});

describe("FIX 5 — meta-line separator is the middot, never a comma between trade and location", () => {
  it("HVAC · DC, never 'Hvac, DC'", () => {
    expect(tradeLocationLine("hvac", null, "dc")).toBe("HVAC · DC");
    expect(tradeLocationLine("hvac", "", " ")).toBe("HVAC");
    expect(tradeLocationLine("hvac", "Washington", "DC")).toBe(
      "HVAC · Washington, DC",
    );
  });

  it("city + state separator (the city,state postal convention) is preserved", () => {
    expect(tradeLocationLine("roofing", "Tampa", "FL")).toBe("Roofing · Tampa, FL");
    expect(tradeLocationLine("remodeling", null, "HI")).toBe("Remodeling · HI");
    expect(tradeLocationLine("painting", "Boise", null)).toBe("Painting · Boise");
  });

  it("blank trade returns just the location — never a leading middot", () => {
    expect(tradeLocationLine("", "Tampa", "FL")).toBe("Tampa, FL");
    expect(tradeLocationLine("   ", "Tampa", "FL")).toBe("Tampa, FL");
    // Everything blank → empty.
    expect(tradeLocationLine("", null, null)).toBe("");
  });

  it("QuoteListItem no longer string-glues a trailing comma to the trade", () => {
    expect(queueItemSrc).not.toMatch(/\$\{displayState \? `, \$\{displayState\}` : ""\}/);
    expect(queueItemSrc).toContain("tradeLocationLine(quote.trade, quote.city, quote.state)");
  });
});

// ───────────────────────────────────────────────────────────────────────
// FIX 6 — Priority bar matches its label
// ───────────────────────────────────────────────────────────────────────

describe("FIX 6 — priorityBarFill stays inside each label's band", () => {
  // Bands: LOW 86-100, MEDIUM 72-85, HIGH 55-71, CRITICAL 0-54
  // Visual: LOW 15-30, MEDIUM 35-55, HIGH 60-80, CRITICAL 85-100
  it("LOW (score 86..100) fills 15-30%", () => {
    for (const s of [86, 90, 95, 100]) {
      const fill = priorityBarFill(s);
      expect(recoveryPriority(s).label).toBe("LOW");
      expect(fill).toBeGreaterThanOrEqual(15);
      expect(fill).toBeLessThanOrEqual(30);
    }
  });

  it("MEDIUM (score 72..85) fills 35-55%", () => {
    for (const s of [72, 78, 81, 85]) {
      const fill = priorityBarFill(s);
      expect(recoveryPriority(s).label).toBe("MEDIUM");
      expect(fill).toBeGreaterThanOrEqual(35);
      expect(fill).toBeLessThanOrEqual(55);
    }
  });

  it("HIGH (score 55..71) fills 60-80% — never below 60% (the visible bug we fixed)", () => {
    for (const s of [55, 60, 65, 71]) {
      const fill = priorityBarFill(s);
      expect(recoveryPriority(s).label).toBe("HIGH");
      expect(fill).toBeGreaterThanOrEqual(60);
      expect(fill).toBeLessThanOrEqual(80);
    }
  });

  it("CRITICAL (score 0..54) fills 85-100%", () => {
    for (const s of [0, 10, 30, 54]) {
      const fill = priorityBarFill(s);
      expect(recoveryPriority(s).label).toBe("CRITICAL");
      expect(fill).toBeGreaterThanOrEqual(85);
      expect(fill).toBeLessThanOrEqual(100);
    }
  });

  it("clamps gracefully outside 0-100 so a future score change can't break the bar", () => {
    expect(priorityBarFill(-100)).toBeGreaterThanOrEqual(85);
    expect(priorityBarFill(150)).toBeLessThanOrEqual(30);
  });

  it("QuoteListItem renders the banded fill, not the old 100 - score formula", () => {
    expect(queueItemSrc).toContain("priorityBarFill");
    expect(queueItemSrc).not.toMatch(/width:\s*`\$\{100 - score\.score\}%`/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// FIX 7 — Activity header: "Last 1" → "Latest"
// ───────────────────────────────────────────────────────────────────────

describe("FIX 7 — Activity feed never renders 'Last 1'", () => {
  function event(over: Partial<ActivityEvent> = {}): ActivityEvent {
    return {
      id: "e-" + Math.random().toString(36).slice(2),
      created_at: new Date().toISOString(),
      event_type: "estimate_created",
      client_name: "Jane",
      trade: "Roofing",
      city: null,
      state: null,
      estimate_amount: 8500,
      followup_number: null,
      reply_intent: null,
      channel: null,
      ...over,
    } as ActivityEvent;
  }

  it("count 1 renders 'Latest'", () => {
    render(React.createElement(ActivityFeedView, { events: [event()] }));
    expect(screen.getByText("Latest")).toBeTruthy();
    expect(screen.queryByText(/Last 1\b/)).toBeNull();
  });

  it("count > 1 renders 'Last {n}'", () => {
    render(
      React.createElement(ActivityFeedView, {
        events: [event(), event(), event()],
      }),
    );
    expect(screen.getByText("Last 3")).toBeTruthy();
    expect(screen.queryByText("Latest")).toBeNull();
  });

  it("zero events: header count is hidden entirely", () => {
    const { container } = render(
      React.createElement(ActivityFeedView, { events: [] }),
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Last 0\b/);
    expect(text).not.toMatch(/Latest\b/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// FIX 8 — emailFollowupsSent filters to sent = true, label is precise
// ───────────────────────────────────────────────────────────────────────

describe("FIX 8 — Follow-ups query and label match each other (sent only)", () => {
  it("the repo query gates on sent = true so scheduled rows never inflate the count", () => {
    expect(repoSrc).toMatch(/\.eq\("sent", true\)/);
    // The window is keyed on sent_at, not the older send_at (which counted
    // future-dated scheduled reminders).
    expect(repoSrc).toMatch(/\.gte\("sent_at", monthStartIso\)/);
    expect(repoSrc).toMatch(/\.lt\("sent_at", monthEndIso\)/);
  });

  it("the returned shape uses emailFollowupsSent (renamed from emailFollowups)", () => {
    expect(repoSrc).toContain("emailFollowupsSent: number");
    expect(repoSrc).toContain("let emailFollowupsSent = 0");
  });

  it("the Recovery Receipt label matches the query — 'Follow-ups sent this month'", () => {
    expect(receiptSrc).toContain("Follow-ups sent this month");
    expect(receiptSrc).not.toContain("Follow-ups this month");
  });

  it("the dashboard wires the renamed field through HeroMetric end-to-end", () => {
    expect(dashboardSrc).toContain("emailFollowupsSent={monthlyActivity.emailFollowupsSent}");
    expect(dashboardSrc).not.toMatch(/emailFollowups[^S]/);
    expect(heroSrc).toContain("emailFollowupsSent={emailFollowupsSent}");
  });
});
