import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const homepage = readSource("../app/page.tsx");
const authShell = readSource("../components/onboarding/AuthShell.tsx");
const dashboard = readSource("../app/(app)/dashboard/page.tsx");
const quoteListItem = readSource("../components/quotes/QuoteListItem.tsx");

// ---------------------------------------------------------------------------
// Bug 1 — text must wrap on mobile (no truncate / whitespace-nowrap on the
// nodes that were getting cut at 360-390px viewports).
// ---------------------------------------------------------------------------

describe("Bug 1: text wraps on mobile, no clipping at 360-390px", () => {
  it("QuoteListItem name uses break-words on mobile (truncate only at sm and up)", () => {
    // Name was `truncate` unconditionally. Now wraps on mobile.
    expect(quoteListItem).toMatch(
      /break-words text-xl font-black text-ink-strong sm:truncate/,
    );
  });

  it("QuoteListItem meta line (trade · city · state) wraps on every viewport", () => {
    // The state was being cut off mid-word ("Tampa, Fl[..]"). Must never truncate.
    expect(quoteListItem).toMatch(/break-words text-sm text-ink-muted/);
    expect(quoteListItem).not.toMatch(/truncate text-sm text-ink-muted/);
  });

  it("QuoteListItem Next-Best-Action value wraps on mobile", () => {
    // `mt-1 truncate text-sm font-black` clipped long action labels on narrow
    // cards. The value now wraps on mobile and only truncates at sm+.
    expect(quoteListItem).toMatch(
      /break-words text-sm font-black sm:truncate/,
    );
    expect(quoteListItem).not.toMatch(
      /mt-1 truncate text-sm font-black/,
    );
  });

  it("landing 'Martin Alvarez · Roofing · Tampa, FL' card heading no longer truncates", () => {
    // Was `truncate text-xl font-bold` — the state was cut mid-word.
    expect(homepage).not.toMatch(
      /mt-1 truncate text-xl font-bold text-ink-strong/,
    );
    expect(homepage).toMatch(/Martin Alvarez · Roofing · Tampa, FL/);
    expect(homepage).toMatch(
      /break-words text-base font-bold text-ink-strong sm:text-xl/,
    );
  });

  it("landing 'Still Bleeding' body wraps inside the card on mobile (no fixed max-w-sm cap)", () => {
    // The body had max-w-sm with no break helper — it pushed past the card
    // boundary at 360px. Now wraps, with max-w-sm only at sm+.
    expect(homepage).toMatch(
      /break-words text-sm text-ink-muted sm:max-w-sm/,
    );
    expect(homepage).not.toMatch(/mt-2 max-w-sm text-sm text-ink-muted/);
  });

  it("landing Recovery Window Alert body wraps cleanly on mobile", () => {
    // "...before the job goes cold" was clipping. Allow wrapping.
    expect(homepage).toMatch(
      /9 days quiet\. Open the plan before the job goes cold\./,
    );
    expect(homepage).toMatch(
      /mt-2 break-words text-sm text-ink-muted/,
    );
  });

  it("AuthShell preview card wraps the Still Bleeding + alert bodies on mobile", () => {
    expect(authShell).toMatch(
      /mt-1 break-words text-sm text-ink-muted/,
    );
    expect(authShell).toMatch(
      /mt-2 break-words text-lg font-bold text-ink-strong/,
    );
  });

  it("the three fixed surfaces never use whitespace-nowrap on these text nodes", () => {
    for (const src of [homepage, authShell, quoteListItem]) {
      expect(src).not.toMatch(/whitespace-nowrap.*Tampa/);
      expect(src).not.toMatch(/whitespace-nowrap.*Still Bleeding/);
    }
  });

  it("brand truthfulness preserved: no 'Bid' anywhere on the fixed surfaces", () => {
    for (const src of [homepage, authShell, dashboard, quoteListItem]) {
      expect(src).not.toMatch(/\bBid\b/);
    }
  });
});

// ---------------------------------------------------------------------------
// Bug 2 — sticky "+ Add Silent Quote" bar must not cover "Jobs Won Back".
// ---------------------------------------------------------------------------

describe("Bug 2: sticky add-quote bar no longer covers Jobs Won Back", () => {
  it("dashboard <main> has mobile bottom padding sized for the fixed bar + safe area", () => {
    // Was `py-8` (top + bottom both 2rem). The fixed bar is bottom-3 + min-h-12
    // ~ ≈5rem total, so we leave a 6rem gap on mobile and account for the iOS
    // home-indicator safe area. Desktop keeps the original sm:pb-8.
    expect(dashboard).toMatch(
      /pb-\[calc\(6rem\+env\(safe-area-inset-bottom\)\)\]/,
    );
    expect(dashboard).toMatch(/sm:pb-8/);
  });

  it("does not regress the existing horizontal + top spacing", () => {
    expect(dashboard).toMatch(/px-4/);
    expect(dashboard).toMatch(/sm:px-6/);
    expect(dashboard).toMatch(/lg:px-8/);
    expect(dashboard).toMatch(/pt-8/);
  });

  it("'Jobs Won Back' section sits inside the padded main, above the fixed bar", () => {
    // The fixed bar block must still come AFTER the WonJobsGallery wrapper so
    // the bottom spacer + DOM order keep the gallery visible on scroll.
    const galleryIdx = dashboard.indexOf("<WonJobsGallery");
    const fixedBarIdx = dashboard.indexOf("fixed inset-x-3 bottom-3");
    expect(galleryIdx).toBeGreaterThan(0);
    expect(fixedBarIdx).toBeGreaterThan(galleryIdx);
  });

  it("fixed bar stays mobile-only (sm:hidden)", () => {
    expect(dashboard).toMatch(/fixed inset-x-3 bottom-3 z-30 sm:hidden/);
  });
});
