// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaInstallHint } from "@/components/dashboard/PwaInstallHint";
import { TodaysMoves } from "@/components/dashboard/TodaysMoves";
import type { TodayMove } from "@/lib/recovery/daily-loop";

vi.mock("@/app/(app)/dashboard/actions", () => ({
  recordSmsOpenedAction: vi.fn().mockResolvedValue({ ok: true }),
}));

const STREAK = { count: 4, resetYesterday: false };

function move(index: number, phone: string | null = "+15551234567"): TodayMove {
  return {
    quoteId: `quote-${index}`,
    reminderId: `reminder-${index}`,
    clientName: `Client ${index}`,
    phone,
    amount: 1000 * index,
    windowLabel: "Cooling",
    family: "Decision Friction",
    step: 2,
    message: `Message ${index}`,
    sendAt: "2026-06-28T10:00:00.000Z",
    overdue: false,
    expectedRecoveryValue: 1000 * index,
  };
}

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

describe("compact Today's Moves", () => {
  it("starts the streak with first-move guidance instead of showing 0 days", () => {
    render(
      <TodaysMoves
        moves={[]}
        streak={{ count: 0, resetYesterday: false }}
      />,
    );
    expect(
      screen.getByText("Your recovery streak starts with your first move."),
    ).toBeTruthy();
    expect(screen.queryByText("0-day recovery streak")).toBeNull();
  });

  it("shows a compact success state for zero moves", () => {
    render(<TodaysMoves moves={[]} streak={STREAK} />);
    expect(screen.getByText("No moves due right now.")).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("renders one move", () => {
    render(<TodaysMoves moves={[move(1)]} streak={STREAK} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("renders all three top-ranked moves", () => {
    render(
      <TodaysMoves
        moves={[move(1), move(2), move(3)]}
        streak={STREAK}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText(/more moves? today/i)).toBeNull();
  });

  it("renders only three of four moves until View all moves is used", () => {
    render(
      <TodaysMoves
        moves={[move(1), move(2), move(3), move(4)]}
        streak={STREAK}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("1 more move today")).toBeTruthy();
    expect(screen.queryByText("Client 4")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View all moves" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: "Tap to text Client 4" }),
    ).toBeTruthy();
  });

  it("shows Tap to text for a phone move", () => {
    render(<TodaysMoves moves={[move(1)]} streak={STREAK} />);
    expect(
      screen.getByRole("button", { name: "Tap to text Client 1" }),
    ).toBeTruthy();
  });

  it("shows Copy message and the add-phone hint without a phone", () => {
    render(<TodaysMoves moves={[move(1, null)]} streak={STREAK} />);
    expect(
      screen.getByRole("button", { name: "Copy message for Client 1" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Add a phone number to enable one-tap texting."),
    ).toBeTruthy();
  });

  it("keeps Silent Quote Command reachable by anchor", () => {
    render(<TodaysMoves moves={[move(1)]} streak={STREAK} />);
    expect(
      screen
        .getByRole("link", { name: "Jump to Silent Quote Command" })
        .getAttribute("href"),
    ).toBe("#silent-quote-command");
    expect(
      readFileSync(
        resolve(process.cwd(), "src/app/(app)/dashboard/page.tsx"),
        "utf8",
      ),
    ).toContain('id="silent-quote-command"');
  });
});

describe("PWA install hint", () => {
  it("has a dismiss button and persists dismissal locally", async () => {
    render(<PwaInstallHint />);
    const installEvent = Object.assign(new Event("beforeinstallprompt"), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    });
    window.dispatchEvent(installEvent);

    const dismiss = await screen.findByRole("button", {
      name: "Dismiss Add to Home Screen prompt",
    });
    fireEvent.click(dismiss);

    await waitFor(() => {
      expect(window.localStorage.getItem("qr:pwa-install-dismissed")).toBe("1");
      expect(
        screen.queryByRole("button", {
          name: "Dismiss Add to Home Screen prompt",
        }),
      ).toBeNull();
    });
  });
});
