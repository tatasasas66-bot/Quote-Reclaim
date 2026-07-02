/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppHeader } from "@/components/app/AppHeader";
import { AppThemeProvider } from "@/components/app/AppThemeProvider";

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("shared authenticated AppHeader", () => {
  it("keeps the dashboard, report, and existing sign-out route reachable", () => {
    render(
      <AppThemeProvider>
        <AppHeader />
      </AppThemeProvider>,
    );

    expect(
      screen
        .getByRole("link", { name: "Quote Reclaim dashboard" })
        .getAttribute("href"),
    ).toBe("/dashboard");
    expect(
      screen
        .getByRole("link", { name: "Recovery Report" })
        .getAttribute("href"),
    ).toBe("/recovery-report");

    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(signOut.closest("form")?.getAttribute("action")).toBe(
      "/api/auth/sign-out",
    );
    expect(signOut.closest("form")?.getAttribute("method")).toBe("post");
    expect(screen.getByLabelText("App theme")).toBeTruthy();
  });

  it("uses the warm sticky chrome and mobile-safe tap targets", () => {
    const header = source("src/components/app/AppHeader.tsx");
    expect(header).toContain("sticky top-0 z-50");
    expect(header).toContain("border-line-subtle bg-canvas");
    expect(header).toContain("flex w-full flex-wrap");
    expect(header).toMatch(/href="\/recovery-report"[\s\S]*?min-h-10/);
    expect(header).toMatch(/type="submit"[\s\S]*?min-h-10/);
    expect(header).toContain("One quote. One move. Today.");
  });

  it.each([
    "src/app/(app)/dashboard/page.tsx",
    "src/app/(app)/quotes/new/page.tsx",
    "src/app/(app)/quotes/[id]/page.tsx",
    "src/app/(app)/quotes/[id]/edit/page.tsx",
    "src/app/(app)/recovery-report/page.tsx",
    "src/app/(app)/crew-gap/page.tsx",
  ])("renders AppHeader on %s", (path) => {
    expect(source(path)).toContain("<AppHeader");
  });

  it("covers both onboarding and reusable import variants without duplicate headers", () => {
    const reveal = source(
      "src/app/(app)/onboarding/reveal/RevealClient.tsx",
    );
    const importPage = source("src/app/(app)/quotes/import/page.tsx");

    expect(reveal.match(/<AppHeader/g)).toHaveLength(1);
    expect(importPage.match(/<AppHeader/g)).toHaveLength(1);
    expect(reveal).not.toMatch(/<header/);
    expect(importPage).not.toMatch(/<header/);
  });
});
