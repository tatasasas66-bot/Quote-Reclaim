import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { quoteInputSchema } from "@/lib/quotes/schema";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

// ---------------------------------------------------------------------------
// Zod schema unit tests
// ---------------------------------------------------------------------------

describe("quoteInputSchema", () => {
  const valid = {
    client_name: "Jane Smith",
    trade: "Roofing",
    estimate_amount: 8500,
    days_silent: 5,
    client_email: "jane@example.com",
    client_phone: "",
    city: "Austin",
    state: "TX",
    job_description: "Replace shingles on main roof",
  };

  it("accepts a fully-populated valid input", () => {
    const result = quoteInputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts phone-only contact (no email)", () => {
    const result = quoteInputSchema.safeParse({
      ...valid,
      client_email: "",
      client_phone: "5125551234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when both email and phone are empty", () => {
    const result = quoteInputSchema.safeParse({
      ...valid,
      client_email: "",
      client_phone: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("client_email");
    }
  });

  it("rejects a negative estimate_amount", () => {
    const result = quoteInputSchema.safeParse({ ...valid, estimate_amount: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects days_silent > 365", () => {
    const result = quoteInputSchema.safeParse({ ...valid, days_silent: 400 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-2-letter state code", () => {
    const result = quoteInputSchema.safeParse({ ...valid, state: "TEX" });
    expect(result.success).toBe(false);
  });

  it("coerces state to uppercase", () => {
    const result = quoteInputSchema.safeParse({ ...valid, state: "tx" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.state).toBe("TX");
  });

  it("rejects client_name of empty string", () => {
    const result = quoteInputSchema.safeParse({ ...valid, client_name: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = quoteInputSchema.safeParse({
      ...valid,
      client_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty optional state (stored as empty string)", () => {
    const result = quoteInputSchema.safeParse({ ...valid, state: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.state).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Source-level invariants for actions.ts
// ---------------------------------------------------------------------------

describe("createQuoteAction invariants", () => {
  const source = readSource("../lib/quotes/actions.ts");

  it("uses service client to call check_and_increment_usage RPC", () => {
    expect(source).toContain("check_and_increment_usage");
    expect(source).toContain("createServiceSupabaseClient");
  });

  it("uses user client (not service) to insert the quote row", () => {
    expect(source).toContain('from("quotes")');
    // The quote insert must go through the user client (RLS-gated)
    expect(source).not.toMatch(/serviceClient\s*\.from\("quotes"\)\s*\.insert/);
  });

  it("inserts 3 reminders via service client after quote creation", () => {
    expect(source).toContain('from("reminders")');
    expect(source).toContain("buildReminders");
  });

  it("uses service client for mark_quote_won RPC", () => {
    expect(source).toContain("mark_quote_won");
    // markQuoteWonAction should use the service client for the RPC
    expect(source).toContain("serviceClient.rpc");
  });

  it("never hard-codes a user ID or bypasses auth", () => {
    expect(source).not.toMatch(/user_id\s*[:=]\s*['"][0-9a-f-]{36}['"]/);
  });

  it("redirects to the quote detail page after creation", () => {
    expect(source).toContain('redirect(`/quotes/${');
  });
});

// ---------------------------------------------------------------------------
// Source-level invariants for repo.ts
// ---------------------------------------------------------------------------

describe("repo.ts invariants", () => {
  const source = readSource("../lib/quotes/repo.ts");

  it("filters listPendingQuotes by user_id", () => {
    expect(source).toContain("listPendingQuotes");
    expect(source).toContain('.eq("user_id", userId)');
  });

  it("filters getQuoteById by both id and user_id (prevents cross-tenant reads)", () => {
    const fn = source.slice(source.indexOf("getQuoteById"));
    expect(fn).toContain('.eq("id", id)');
    expect(fn).toContain('.eq("user_id", userId)');
  });

  it("exports ReminderRow type and listRemindersForQuote", () => {
    expect(source).toContain("ReminderRow");
    expect(source).toContain("listRemindersForQuote");
  });
});
