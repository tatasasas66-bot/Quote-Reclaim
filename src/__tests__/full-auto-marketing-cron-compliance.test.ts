import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/full-auto-marketing/route";
import { LIVE_COMPLIANCE_BLOCK_REASON } from "@/lib/marketing/config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("full-auto marketing cron compliance gate", () => {
  it("stays safely disabled by default without requiring an address", async () => {
    process.env.MARKETING_AUTOMATION_ENABLED = "false";
    delete process.env.COMPLIANCE_POSTAL_ADDRESS;

    const response = await GET(
      new NextRequest("https://example.com/api/cron/full-auto-marketing"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      enabled: false,
      results: [],
    });
  });

  it("refuses enabled cron execution when the address is missing", async () => {
    process.env.MARKETING_AUTOMATION_ENABLED = "true";
    process.env.MARKETING_AUTOMATION_SECRET = "test-secret";
    delete process.env.COMPLIANCE_POSTAL_ADDRESS;

    const response = await GET(
      new NextRequest("https://example.com/api/cron/full-auto-marketing", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      enabled: true,
      dry_run_allowed: true,
      error: LIVE_COMPLIANCE_BLOCK_REASON,
    });
  });

  it("also refuses a whitespace-only address", async () => {
    process.env.MARKETING_AUTOMATION_ENABLED = "true";
    process.env.MARKETING_AUTOMATION_SECRET = "test-secret";
    process.env.COMPLIANCE_POSTAL_ADDRESS = "   ";

    const response = await GET(
      new NextRequest("https://example.com/api/cron/full-auto-marketing", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(409);
  });
});
