// @vitest-environment happy-dom

import * as React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteForm } from "@/components/quotes/QuoteForm";
import type { ActionResult } from "@/lib/quotes/actions";
import type { QuoteRow } from "@/lib/quotes/repo";

const mocks = vi.hoisted(() => ({
  formState: null as ActionResult | null,
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormState: () => [mocks.formState, vi.fn()],
    useFormStatus: () => ({ pending: false }),
  };
});

const quote: QuoteRow = {
  id: "quote-123",
  user_id: "user-1",
  trade: "Concrete",
  project_type: "Patio",
  city: "",
  state: "",
  estimate_amount: 7200,
  job_description: null,
  days_silent: 12,
  quote_sent_at: "2026-06-18T00:00:00.000Z",
  client_name: "Jane",
  client_email: null,
  client_phone: null,
  client_opted_out: false,
  outcome: "pending",
  won_at: null,
  closed_at: null,
  created_at: "2026-06-18T00:00:00.000Z",
  updated_at: "2026-06-18T00:00:00.000Z",
};

const action = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));
const quoteActionsSource = readFileSync(
  resolve(process.cwd(), "src/lib/quotes/actions.ts"),
  "utf8",
);

beforeEach(() => {
  mocks.formState = null;
  mocks.push.mockReset();
});

afterEach(cleanup);

describe("quote edit redirect", () => {
  it("serializes the changed project type and phone for the update action", () => {
    render(<QuoteForm mode="edit" initial={quote} action={action} />);

    const projectType = screen.getByLabelText(/Project type/i);
    const phone = screen.getByLabelText(/Client phone/i);
    fireEvent.change(projectType, { target: { value: "Driveway" } });
    fireEvent.change(phone, { target: { value: "+16025550123" } });

    const form = projectType.closest("form");
    expect(form).not.toBeNull();
    const formData = new FormData(form!);
    expect(formData.get("project_type")).toBe("Driveway");
    expect(formData.get("client_phone")).toBe("+16025550123");
  });

  it("persists the edited project type, refreshes messages, then reports success", () => {
    const updateSlice = quoteActionsSource.slice(
      quoteActionsSource.indexOf("export async function updateQuoteAction"),
      quoteActionsSource.indexOf("export async function markQuoteWonAction"),
    );
    expect(updateSlice).toContain("project_type: input.project_type || null");
    expect(updateSlice).toContain("projectType: input.project_type");
    expect(updateSlice).toContain("reconcileReminders");
    expect(updateSlice).toMatch(
      /revalidatePath\(`\/quotes\/\$\{id\}`\);[\s\S]*?return \{ ok: true \};/,
    );
  });

  it("navigates to the recovery plan after a successful save", async () => {
    mocks.formState = { ok: true };
    render(<QuoteForm mode="edit" initial={quote} action={action} />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/quotes/quote-123");
    });
  });

  it("keeps validation errors on the edit form without redirecting", () => {
    mocks.formState = {
      ok: false,
      error: "Please fix the highlighted fields",
      fieldErrors: { project_type: ["Project type is too long"] },
    };
    render(<QuoteForm mode="edit" initial={quote} action={action} />);

    expect(screen.getByText("Project type is too long")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
