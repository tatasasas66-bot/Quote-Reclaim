/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LogoMark, LogoFull, LogoStacked } from "@/components/brand/Logo";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

afterEach(cleanup);

describe("brand logo variants render valid, accessible SVG", () => {
  it("LogoMark renders an SVG with role=img and the brand title", () => {
    const { container } = render(React.createElement(LogoMark));
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.querySelector("title")?.textContent).toBe("Quote Reclaim");
    // The distinctive mark: a Q bowl (circle) + returning-arrow (line + arrowhead).
    expect(svg?.querySelector("circle")).not.toBeNull();
    expect(svg?.querySelector("polygon")).not.toBeNull();
  });

  it("LogoFull renders the mark title AND the 'Quote Reclaim' wordmark", () => {
    const { container } = render(React.createElement(LogoFull));
    expect(container.querySelector("svg title")?.textContent).toBe("Quote Reclaim");
    expect(container.textContent).toContain("Quote Reclaim");
  });

  it("LogoStacked renders the mark title AND the 'Quote Reclaim' wordmark", () => {
    const { container } = render(React.createElement(LogoStacked));
    expect(container.querySelector("svg title")?.textContent).toBe("Quote Reclaim");
    expect(container.textContent).toContain("Quote Reclaim");
  });

  it("applies a caller className for responsive sizing", () => {
    const { container } = render(
      React.createElement(LogoMark, { className: "h-12 w-12" }),
    );
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("h-12");
  });
});

describe("logo uses design-system tokens, not invented colors", () => {
  const logoSource = readSource("../components/brand/Logo.tsx");

  it("colors come from brand tokens via currentColor", () => {
    expect(logoSource).toContain("currentColor");
    expect(logoSource).toContain("text-brand");
    expect(logoSource).toContain("text-ink-strong");
  });

  it("the React mark hardcodes no hex color", () => {
    expect(logoSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("the wordmark is two-tone (Quote ink-strong / Reclaim brand)", () => {
    expect(logoSource).toContain("text-ink-strong");
    expect(logoSource).toMatch(/text-brand">\s*Reclaim/);
  });

  it("never says 'Bid'", () => {
    expect(logoSource).not.toMatch(/\bBid\b/);
  });
});

describe("favicon icon.svg", () => {
  const icon = readSource("../app/icon.svg");

  it("exists and is the new Q + returning-arrow mark", () => {
    expect(icon).toContain("<svg");
    expect(icon).toContain("<title>Quote Reclaim</title>");
    expect(icon).toContain("<circle");
    expect(icon).toContain("<polygon");
  });

  it("uses the forest-green + near-black hex from the design system", () => {
    expect(icon.toLowerCase()).toContain("#1e5128");
    expect(icon.toLowerCase()).toContain("#0f1115");
  });
});

describe("app header wires the logo to /dashboard", () => {
  const appHeader = readSource("../components/app/AppHeader.tsx");

  it("wraps the wordmark logo in a link to /dashboard", () => {
    expect(appHeader).toMatch(
      /href="\/dashboard"[\s\S]{0,400}<LogoFull/,
    );
  });

  it("layout metadata points the favicon at the brand mark", () => {
    const layout = readSource("../app/layout.tsx");
    expect(layout).toMatch(/icon:\s*"\/icon\.svg"/);
  });
});
