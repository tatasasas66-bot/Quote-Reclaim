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

describe("Bug 1: text wraps on mobile, no clipping at 360-390px", () => {
  it("QuoteListItem name uses break-words on mobile (truncate only at sm and up)", () => {
    expect(quoteListItem).toMatch(
      /break-words text-xl font-black text-ink-strong sm:truncate/,
    );
  });

  it("QuoteListItem meta line wraps on every viewport", () => {
    expect(quoteListItem).toMatch(/break-words text-sm text-ink-muted/);
    expect(quoteListItem).not.toMatch(/truncate text-sm text-ink-muted/);
  });

  it("QuoteListItem Next-Best-Action value wraps on mobile", () => {
    expect(quoteListItem).toMatch(/break-words text-sm font-black sm:truncate/);
    expect(quoteListItem).not.toMatch(/mt-1 truncate text-sm font-black/);
  });

  it("landing product preview labels wrap instead of truncating", () => {
    expect(homepage).not.toMatch(
      /mt-1 truncate text-xl font-bold text-ink-strong/,
    );
    // Silent Quote Command dashboard: follow-up order labels wrap cleanly.
    expect(homepage).toMatch(/break-words text-xs font-bold text-ink-strong/);
  });

  it("landing preview bodies wrap inside cards on mobile", () => {
    expect(homepage).toMatch(/break-words text-sm leading-6 text-ink-strong/);
    expect(homepage).not.toMatch(/mt-2 max-w-sm text-sm text-ink-muted/);
  });

  it("landing dashboard currency values stay on one line", () => {
    // The big quiet-value number must never wrap.
    expect(homepage).toMatch(/whitespace-nowrap text-2xl font-black text-money/);
  });

  it("AuthShell preview card wraps the Still Bleeding + alert bodies on mobile", () => {
    expect(authShell).toMatch(/mt-1 break-words text-sm text-ink-muted/);
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

describe("Bug 2: sticky add-quote bar no longer covers Jobs Won Back", () => {
  it("dashboard <main> has mobile bottom padding sized for the fixed bar + safe area", () => {
    expect(dashboard).toMatch(
      /pb-\[calc\(6rem\+env\(safe-area-inset-bottom\)\)\]/,
    );
    expect(dashboard).toMatch(/sm:pb-8/);
  });

  it("does not regress the existing horizontal + top spacing", () => {
    expect(dashboard).toMatch(/px-4/);
    expect(dashboard).toMatch(/sm:px-6/);
    expect(dashboard).toMatch(/lg:px-8/);
    expect(dashboard).toMatch(/pt-5/);
  });

  it("'Jobs Won Back' section sits inside the padded main, above the fixed bar", () => {
    const galleryIdx = dashboard.indexOf("<WonJobsGallery");
    const fixedBarIdx = dashboard.indexOf("fixed inset-x-3 bottom-3");
    expect(galleryIdx).toBeGreaterThan(0);
    expect(fixedBarIdx).toBeGreaterThan(galleryIdx);
  });

  it("fixed bar stays mobile-only (sm:hidden)", () => {
    expect(dashboard).toMatch(/fixed inset-x-3 bottom-3 z-30 sm:hidden/);
  });
});
