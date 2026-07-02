/**
 * @vitest-environment happy-dom
 */
import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppThemeProvider } from "@/components/app/AppThemeProvider";
import { ThemeSelector } from "@/components/app/ThemeSelector";

let prefersDark = false;
let mediaListeners: Array<() => void> = [];

beforeEach(() => {
  prefersDark = false;
  mediaListeners = [];
  window.localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      get matches() {
        return prefersDark;
      },
      addEventListener: (_event: string, listener: () => void) => {
        mediaListeners.push(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        mediaListeners = mediaListeners.filter((entry) => entry !== listener);
      },
    })),
  });
});

afterEach(cleanup);

function renderThemeControl() {
  return render(
    <AppThemeProvider>
      <ThemeSelector />
    </AppThemeProvider>,
  );
}

function appRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>("#qr-app-theme-root");
  if (!root) throw new Error("App theme root not rendered");
  return root;
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("authenticated app theme", () => {
  it("defaults to System and resolves the current OS preference", () => {
    renderThemeControl();

    expect((screen.getByLabelText("App theme") as HTMLSelectElement).value).toBe(
      "system",
    );
    expect(appRoot().dataset.appTheme).toBe("light");
    expect(appRoot().dataset.themePreference).toBe("system");
  });

  it("persists Dark and restores it on a remount", async () => {
    const first = renderThemeControl();
    fireEvent.change(screen.getByLabelText("App theme"), {
      target: { value: "dark" },
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("qr:app-theme")).toBe("dark");
      expect(appRoot().dataset.appTheme).toBe("dark");
    });

    first.unmount();
    renderThemeControl();
    expect((screen.getByLabelText("App theme") as HTMLSelectElement).value).toBe(
      "dark",
    );
    expect(appRoot().dataset.appTheme).toBe("dark");
  });

  it("tracks prefers-color-scheme while System is selected", async () => {
    renderThemeControl();
    prefersDark = true;
    mediaListeners.forEach((listener) => listener());

    await waitFor(() => {
      expect(appRoot().dataset.appTheme).toBe("dark");
    });
  });

  it("scopes the provider to the authenticated route group only", () => {
    expect(source("src/app/(app)/layout.tsx")).toContain("<AppThemeProvider>");
    expect(source("src/app/layout.tsx")).not.toContain("AppThemeProvider");
    expect(source("src/app/page.tsx")).not.toContain("ThemeSelector");
    expect(source("src/app/audit/page.tsx")).not.toContain("ThemeSelector");
  });

  it("defines a restrained dark command-center token set", () => {
    const css = source("src/app/globals.css");
    expect(css).toContain('.app-theme-root[data-app-theme="dark"]');
    expect(css).toContain("--qr-bg-canvas: 10 17 13");
    expect(css).toContain("--qr-brand-primary: 91 184 111");
    expect(css).toContain(
      '.app-theme-root[data-app-theme="dark"] .bg-white',
    );
  });
});
