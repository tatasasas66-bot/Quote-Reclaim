import { beforeEach, describe, expect, it, vi } from "vitest";
import { oneTapProjectLabel } from "@/lib/ai/fallback-messages";
import { updateQuoteAction } from "@/lib/quotes/actions";

const mocks = vi.hoisted(() => ({
  quoteUpdate: null as Record<string, unknown> | null,
  reminderRows: [] as Array<Record<string, unknown>>,
  recoveryContext: null as Record<string, unknown> | null,
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "user-1",
            user_metadata: { first_name: "Sam" },
          },
        },
      }),
    },
    from: (table: string) => {
      if (table !== "quotes") throw new Error(`Unexpected table: ${table}`);
      const query = {
        update: vi.fn((payload: Record<string, unknown>) => {
          mocks.quoteUpdate = payload;
          return query;
        }),
        eq: vi.fn(() => query),
        select: vi.fn(() => query),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: "quote-123" },
          error: null,
        }),
      };
      return query;
    },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "reminders") throw new Error(`Unexpected table: ${table}`);
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn(
          async (rows: Array<Record<string, unknown>>) => {
            mocks.reminderRows = rows;
            return { error: null };
          },
        ),
      };
      return query;
    },
  }),
}));

vi.mock("@/lib/ai/generate-recovery-plan", () => ({
  generateRecoveryPlan: vi.fn(
    async (context: Record<string, unknown>) => {
      mocks.recoveryContext = context;
      return [1, 2, 3, 4, 5, 6].map((followupNumber) => ({
        followup_number: followupNumber,
        message: `Follow up about the ${String(context.projectType).toLowerCase()}.`,
        framework: "test",
        cta_type: "reply",
        source: "fallback",
      }));
    },
  ),
}));

vi.mock("@/lib/ai/validate-message", () => ({
  validateMessage: () => ({ ok: true, reasons: [] }),
}));

function editForm() {
  const formData = new FormData();
  formData.set("client_name", "Jane");
  formData.set("trade", "Concrete");
  formData.set("project_type", "Driveway");
  formData.set("estimate_amount", "7200");
  formData.set("days_silent", "12");
  formData.set("client_email", "");
  formData.set("client_phone", "+16025550123");
  formData.set("city", "");
  formData.set("state", "");
  formData.set("job_description", "");
  return formData;
}

beforeEach(() => {
  mocks.quoteUpdate = null;
  mocks.reminderRows = [];
  mocks.recoveryContext = null;
  mocks.revalidatePath.mockReset();
});

describe("updateQuoteAction project type persistence", () => {
  it("persists Driveway and regenerates the unsent plan with the updated noun", async () => {
    const result = await updateQuoteAction("quote-123", null, editForm());

    expect(result).toEqual({ ok: true });
    expect(mocks.quoteUpdate).toEqual(
      expect.objectContaining({
        project_type: "Driveway",
        client_phone: "+16025550123",
      }),
    );
    expect(mocks.recoveryContext).toEqual(
      expect.objectContaining({ projectType: "Driveway" }),
    );
    expect(mocks.reminderRows).toHaveLength(6);
    expect(
      mocks.reminderRows.every((row) =>
        String(row.message_text).includes("driveway"),
      ),
    ).toBe(true);
    expect(oneTapProjectLabel("Concrete", "Driveway")).toBe(
      "the driveway estimate",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/quotes/quote-123");
  });
});
