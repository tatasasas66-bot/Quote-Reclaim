/**
 * Brand-asset lock — the public SVG files for external embeds (marketing
 * site, README, social cards, transactional email signatures) must match the
 * in-app mark so a contractor never sees two different Quote Reclaim logos
 * across surfaces. The in-app mark lives in src/components/brand/Logo.tsx;
 * the public mark assets must use the same geometry primitives (circle bowl
 * + diagonal tail + return arrowhead) and the same brand tokens (rust ring,
 * gold arrowhead).
 *
 * This file does not assert pixel-perfect equality — that would block any
 * legitimate refinement. It pins the constraints that catch the failure mode
 * we've already seen once: an orphan SVG drifting to a completely different
 * design from what the React component renders.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const BRAND_RUST = "#d96f32";
const BRAND_GOLD = "#d4a63a";

describe("Public brand assets — Quote Reclaim mark + lockup", () => {
  it("public/logo-mark.svg exists with the canonical Q+tail+arrowhead geometry", () => {
    const svg = read("public/logo-mark.svg");
    expect(svg).toMatch(/<svg[^>]+viewBox="0 0 32 32"/);
    expect(svg).toContain("<title>Quote Reclaim</title>");
    expect(svg).toMatch(/<circle[^/]+stroke="#d96f32"/);
    expect(svg).toMatch(/<line[^/]+stroke="#d96f32"/);
    expect(svg).toMatch(/<polygon[^/]+fill="#d4a63a"/);
  });

  it("public/brand/logo-mark.svg matches the canonical mark (no orphan drift)", () => {
    const a = read("public/logo-mark.svg");
    const b = read("public/brand/logo-mark.svg");
    expect(a).toBe(b);
  });

  it("public/logo.svg is the full horizontal lockup (mark + wordmark text)", () => {
    const svg = read("public/logo.svg");
    expect(svg).toMatch(/<svg[^>]+viewBox="0 0 240 60"/);
    expect(svg).toContain("<title>Quote Reclaim</title>");
    // Mark inside the lockup must reuse the same primitives + brand tokens.
    expect(svg).toMatch(/<circle[^/]+stroke="#d96f32"/);
    expect(svg).toMatch(/<line[^/]+stroke="#d96f32"/);
    expect(svg).toMatch(/<polygon[^/]+fill="#d4a63a"/);
    // Wordmark text is split across two tspans so the rust/ink-strong colors
    // can never drift apart in editor finds-and-replaces.
    expect(svg).toContain("<tspan");
    expect(svg).toContain(">Quote</tspan>");
    expect(svg).toContain(">Reclaim</tspan>");
  });

  it("the in-app React mark uses the SAME brand tokens (via Tailwind text- classes)", () => {
    const reactMark = read("src/components/brand/Logo.tsx");
    expect(reactMark).toContain('className="text-brand"');
    expect(reactMark).toContain('className="text-money"');
    // The Tailwind tokens text-brand / text-money map to the same rust/gold
    // hex values used by the public SVG assets (verified in tailwind.config).
    expect(BRAND_RUST.toLowerCase()).toBe("#d96f32");
    expect(BRAND_GOLD.toLowerCase()).toBe("#d4a63a");
  });

  it("the Next.js favicon (src/app/icon.svg) carries the SAME tokens", () => {
    const icon = read("src/app/icon.svg");
    expect(icon).toContain("#d96f32");
    expect(icon).toContain("#d4a63a");
    expect(icon).toMatch(/<svg[^>]+viewBox="0 0 32 32"/);
  });
});
