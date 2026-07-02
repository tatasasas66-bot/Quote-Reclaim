// @vitest-environment happy-dom

import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevealClient } from "@/app/(app)/onboarding/reveal/RevealClient";
import { AppThemeProvider } from "@/components/app/AppThemeProvider";
import { researchSequenceMessages } from "@/lib/ai/fallback-messages";
import { AUDIT_HANDOFF_KEY } from "@/lib/onboarding/audit-handoff";

const mocks = vi.hoisted(() => ({
  importQuotes: vi.fn(),
  push: vi.fn(),
  skip: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/onboarding/actions", () => ({
  importSilentQuotesAction: mocks.importQuotes,
  skipOnboardingAction: mocks.skip,
}));

function seedAuditHandoff() {
  window.sessionStorage.setItem(
    AUDIT_HANDOFF_KEY,
    JSON.stringify({
      trade: "concrete",
      quotes: [
        {
          name: "Quote #2",
          amount: 7200,
          daysSilent: 12,
          email: null,
        },
      ],
      priorityIndex: 2,
    }),
  );
}

beforeEach(() => {
  mocks.importQuotes.mockReset();
  mocks.push.mockReset();
  mocks.skip.mockReset();
  window.sessionStorage.clear();
  window.localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  seedAuditHandoff();
  mocks.importQuotes.mockResolvedValue({
    ok: true,
    imported: 1,
    skippedByGate: 0,
    totalSilent: 7200,
    remainingSilent: 0,
    priorityQuoteId: "quote-2",
  });
});

afterEach(cleanup);

function renderReveal() {
  return render(
    <AppThemeProvider>
      <RevealClient isPaid={false} usageCount={0} pendingCount={0} />
    </AppThemeProvider>,
  );
}

describe("audit reveal project type persistence", () => {
  it("submits Concrete and the typed Patio datalist value", async () => {
    renderReveal();

    const projectType = await screen.findByLabelText(/Project type/i);
    fireEvent.change(projectType, { target: { value: "Patio" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save and open the plan →" }),
    );

    await waitFor(() => {
      expect(mocks.importQuotes).toHaveBeenCalledWith(
        expect.objectContaining({
          trade: "Concrete",
          projectType: "Patio",
          origin: "audit",
        }),
      );
      expect(mocks.push).toHaveBeenCalledWith("/quotes/quote-2");
    });

    const sequence = researchSequenceMessages({
      firstName: "there",
      trade: "Concrete",
      projectType: "Patio",
      estimateAmount: 7200,
    });
    expect(Object.values(sequence).join(" ")).toMatch(/patio/i);
    expect(Object.keys(sequence).filter((day) => day === "day60")).toHaveLength(
      1,
    );
  });

  it("allows an intentionally blank project type and keeps copy neutral", async () => {
    renderReveal();

    await screen.findByLabelText(/Project type/i);
    fireEvent.click(
      screen.getByRole("button", { name: "Save and open the plan →" }),
    );

    await waitFor(() => {
      expect(mocks.importQuotes).toHaveBeenCalledWith(
        expect.objectContaining({
          trade: "Concrete",
          projectType: "",
          origin: "audit",
        }),
      );
    });

    const sequence = researchSequenceMessages({
      firstName: "there",
      trade: "Concrete",
      projectType: "",
      estimateAmount: 7200,
    });
    const copy = Object.values(sequence).join(" ");
    expect(copy).toMatch(/\bestimate\b/i);
    expect(copy).not.toMatch(/roof|roofing|driveway/i);
  });
});
