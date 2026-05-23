import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { requireCronAuth } from "../lib/security/require-cron";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const sendRoute = readSource("../app/api/cron/send/route.ts");
const briefingRoute = readSource("../app/api/cron/weekly-briefing/route.ts");
const cronAuth = readSource("../lib/security/require-cron.ts");
const vercelConfig = readSource("../../vercel.json");

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/cron/send", {
    method: "GET",
    headers,
  });
}

// ---------------------------------------------------------------------------
// requireCronAuth — real behavior
// ---------------------------------------------------------------------------

describe("requireCronAuth", () => {
  it("rejects missing Authorization header (401)", () => {
    const result = requireCronAuth(makeRequest(), {
      NODE_ENV: "test",
      CRON_SECRET: "right",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("rejects literal 'Bearer undefined' (401)", () => {
    const result = requireCronAuth(
      makeRequest({ Authorization: "Bearer undefined" }),
      { NODE_ENV: "test", CRON_SECRET: "right" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("rejects literal 'Bearer null' (401)", () => {
    const result = requireCronAuth(
      makeRequest({ Authorization: "Bearer null" }),
      { NODE_ENV: "test", CRON_SECRET: "right" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("rejects an empty Bearer token (401)", () => {
    const result = requireCronAuth(makeRequest({ Authorization: "Bearer " }), {
      NODE_ENV: "test",
      CRON_SECRET: "right",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("rejects a non-Bearer scheme (401)", () => {
    const result = requireCronAuth(makeRequest({ Authorization: "Basic abc" }), {
      NODE_ENV: "test",
      CRON_SECRET: "right",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("rejects the wrong token (401, length-aware so different lengths fail too)", () => {
    const wrong = requireCronAuth(
      makeRequest({ Authorization: "Bearer wrongvalue" }),
      { NODE_ENV: "test", CRON_SECRET: "right" },
    );
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.status).toBe(401);

    const sameLength = requireCronAuth(
      makeRequest({ Authorization: "Bearer wxong" }),
      { NODE_ENV: "test", CRON_SECRET: "right" },
    );
    expect(sameLength.ok).toBe(false);
  });

  it("accepts the correct token", () => {
    const result = requireCronAuth(
      makeRequest({ Authorization: "Bearer right" }),
      { NODE_ENV: "test", CRON_SECRET: "right" },
    );
    expect(result.ok).toBe(true);
  });

  it("returns 503 in production when CRON_SECRET is missing (fail closed)", () => {
    const result = requireCronAuth(makeRequest(), { NODE_ENV: "production" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  it("allows unauthenticated requests in non-production when CRON_SECRET is unset (dev/test)", () => {
    const result = requireCronAuth(makeRequest(), { NODE_ENV: "test" });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// require-cron source invariants
// ---------------------------------------------------------------------------

describe("require-cron helper invariants", () => {
  it("uses timingSafeEqual for the secret compare", () => {
    expect(cronAuth).toContain("timingSafeEqual");
  });

  it("explicitly rejects literal 'undefined' / 'null' tokens", () => {
    expect(cronAuth).toContain('token === "undefined"');
    expect(cronAuth).toContain('token === "null"');
  });

  it("never logs the secret", () => {
    expect(cronAuth).not.toMatch(/console\.[a-z]+\([^)]*secret/);
    expect(cronAuth).not.toMatch(/console\.[a-z]+\([^)]*CRON_SECRET/);
  });
});

// ---------------------------------------------------------------------------
// /api/cron/send — source-level invariants
// ---------------------------------------------------------------------------

describe("/api/cron/send route", () => {
  it("exports a POST handler and a GET handler (Vercel cron uses GET)", () => {
    expect(sendRoute).toMatch(/export async function GET/);
    expect(sendRoute).toMatch(/export async function POST/);
  });

  it("requires cron auth via requireCronAuth", () => {
    expect(sendRoute).toContain("requireCronAuth");
    expect(sendRoute).toMatch(/if \(!auth\.ok\)/);
  });

  it("calls claim_due_reminders with the cron_run_id", () => {
    expect(sendRoute).toMatch(
      /\.rpc\(\s*"claim_due_reminders"[\s\S]{0,80}p_cron_run_id:\s*cronRunId/,
    );
  });

  it("uses the messaging service (no direct Twilio import)", () => {
    expect(sendRoute).toContain("getMessagingService");
    expect(sendRoute).not.toMatch(/from\s+["']twilio["']/);
  });

  it("fails closed (503) when the messaging service is unavailable in production", () => {
    expect(sendRoute).toMatch(
      /provider = getMessagingService\(\)[\s\S]*?catch[\s\S]*?status:\s*503/,
    );
  });

  it("uses the service client", () => {
    expect(sendRoute).toContain("createServiceSupabaseClient");
  });

  it("normalizes the recipient phone before sending", () => {
    expect(sendRoute).toContain("normalizePhone");
  });

  it("only handles SMS in Phase 10 (email channel skipped)", () => {
    expect(sendRoute).toMatch(/message_type\s*!==\s*"sms"/);
  });

  it("skips when the recipient phone is missing/invalid (defensive)", () => {
    expect(sendRoute).toMatch(/if \(!phone\)[\s\S]*?skipped\+\+/);
  });

  it("inserts a row into outbound_messages with status sent or failed", () => {
    expect(sendRoute).toMatch(
      /from\("outbound_messages"\)\.insert\(\{[\s\S]*?status:[\s\S]*?"sent"[\s\S]*?"failed"/,
    );
  });

  it("uses an idempotency_key scoped per reminder + cron run", () => {
    expect(sendRoute).toMatch(
      /idempotency_key:\s*`cron:\$\{r\.reminder_id\}:\$\{cronRunId\}`/,
    );
  });

  it("marks reminder.sent=true only on success", () => {
    expect(sendRoute).toMatch(
      /smsResult\.ok[\s\S]{0,400}from\("reminders"\)\s*\.update\(\{ sent: true,/,
    );
  });

  it("releases the claim on send failure so the next run can retry", () => {
    expect(sendRoute).toMatch(
      /!smsResult\.ok[\s\S]*?releaseClaim/,
    );
    expect(sendRoute).toMatch(
      /releaseClaim[\s\S]*?claimed_by:\s*null[\s\S]*?claimed_at:\s*null/,
    );
  });

  it("releases the claim when the row is skipped (opt-out, wrong channel, bad phone)", () => {
    // Three branches before the send: opted-out, non-sms, no phone.
    expect(sendRoute).toMatch(/client_opted_out[\s\S]*?releaseClaim/);
    expect(sendRoute).toMatch(/message_type[\s\S]{0,80}releaseClaim/);
  });

  it("emits a message_sent recovery_event on success", () => {
    expect(sendRoute).toMatch(/event_type:\s*"message_sent"/);
    expect(sendRoute).toMatch(/source_event_id:\s*smsResult\.providerMessageId/);
  });

  it("creates a cron_runs row at start and finalizes it at end", () => {
    expect(sendRoute).toMatch(
      /from\("cron_runs"\)\.insert\(\{[\s\S]*?status:\s*"running"/,
    );
    expect(sendRoute).toContain("finalizeCronRun");
    expect(sendRoute).toMatch(/status:\s*"success"|"partial"|"failed"/);
  });

  it("returns JSON with claimed/sent/failed/skipped", () => {
    expect(sendRoute).toMatch(/claimed:\s*claimed\.length/);
    expect(sendRoute).toMatch(/sent,\s*\n?\s*failed,\s*\n?\s*skipped/);
  });

  it("never uses the word 'Bid'", () => {
    expect(sendRoute).not.toMatch(/\bBid\b/);
  });
});

// ---------------------------------------------------------------------------
// /api/cron/weekly-briefing — source-level invariants
// ---------------------------------------------------------------------------

describe("/api/cron/weekly-briefing route", () => {
  it("exports a POST handler and a GET handler", () => {
    expect(briefingRoute).toMatch(/export async function GET/);
    expect(briefingRoute).toMatch(/export async function POST/);
  });

  it("requires cron auth", () => {
    expect(briefingRoute).toContain("requireCronAuth");
    expect(briefingRoute).toMatch(/if \(!auth\.ok\)/);
  });

  it("computes pending count, silent value, recovered this month, next due count", () => {
    expect(briefingRoute).toContain("pending_count");
    expect(briefingRoute).toContain("silent_value");
    expect(briefingRoute).toContain("recovered_this_month");
    expect(briefingRoute).toContain("next_due_count");
  });

  it("does NOT send SMS in Phase 10 (foundation only)", () => {
    expect(briefingRoute).not.toMatch(/getMessagingService\(\)/);
    expect(briefingRoute).not.toMatch(/\.send\(/);
  });

  it("writes a cron_runs row and finalizes status=success on completion", () => {
    expect(briefingRoute).toMatch(
      /from\("cron_runs"\)\.insert\(\{[\s\S]*?status:\s*"running"/,
    );
    expect(briefingRoute).toMatch(/status:\s*"success"/);
  });

  it("leaves a TODO for Phase 11+ SMS delivery", () => {
    expect(briefingRoute).toMatch(/TODO[\s\S]*?Phase 11/);
  });

  it("uses service client", () => {
    expect(briefingRoute).toContain("createServiceSupabaseClient");
  });

  it("never uses the word 'Bid'", () => {
    expect(briefingRoute).not.toMatch(/\bBid\b/);
  });
});

// ---------------------------------------------------------------------------
// Production-safety invariants
// ---------------------------------------------------------------------------

describe("Production safety: production without Twilio never silently simulates", () => {
  it("send route catches the messaging-service throw and records a failed run", () => {
    expect(sendRoute).toMatch(
      /provider = getMessagingService\(\)[\s\S]*?catch[\s\S]*?finalizeCronRun[\s\S]*?"failed"[\s\S]*?status:\s*503/,
    );
  });

  it("send route never instantiates SimulatorSmsProvider directly", () => {
    expect(sendRoute).not.toContain("SimulatorSmsProvider");
  });
});

// ---------------------------------------------------------------------------
// claim_due_reminders contract — RPC enforces opt-out/won/paused/replied filters
// ---------------------------------------------------------------------------

describe("claim_due_reminders SQL contract (smoke test)", () => {
  const migration = readSource(
    "../../supabase/migrations/001_core_schema.sql",
  );

  it("excludes sent / paused / claimed reminders", () => {
    expect(migration).toMatch(/r2\.sent\s*=\s*false/);
    expect(migration).toMatch(/r2\.claimed_by\s+is\s+null/);
    expect(migration).toMatch(/r2\.paused_at\s+is\s+null/);
  });

  it("excludes won/closed quotes (outcome = 'pending')", () => {
    expect(migration).toMatch(/q\.outcome\s*=\s*'pending'/);
  });

  it("excludes opted-out quotes", () => {
    expect(migration).toMatch(/q\.client_opted_out\s*=\s*false/);
  });

  it("excludes quotes that already received an inbound reply", () => {
    expect(migration).toMatch(
      /not exists[\s\S]*?outbound_messages[\s\S]*?status\s*=\s*'replied'/,
    );
  });

  it("uses FOR UPDATE SKIP LOCKED for concurrent-safety", () => {
    expect(migration).toContain("for update skip locked");
  });
});

// ---------------------------------------------------------------------------
// Vercel cron schedule
// ---------------------------------------------------------------------------

describe("vercel.json cron schedule", () => {
  it("declares the send job and weekly-briefing job", () => {
    const parsed = JSON.parse(vercelConfig);
    expect(Array.isArray(parsed.crons)).toBe(true);
    const paths = parsed.crons.map((c: { path: string }) => c.path);
    expect(paths).toContain("/api/cron/send");
    expect(paths).toContain("/api/cron/weekly-briefing");
  });

  it("send job runs at a reasonable frequency (not faster than every 5 minutes)", () => {
    const parsed = JSON.parse(vercelConfig);
    const send = parsed.crons.find(
      (c: { path: string }) => c.path === "/api/cron/send",
    );
    expect(send).toBeDefined();
    // Reject "*/1 * * * *" or "* * * * *" (too aggressive)
    expect(send.schedule).not.toBe("* * * * *");
    expect(send.schedule).not.toBe("*/1 * * * *");
    expect(send.schedule).not.toBe("*/2 * * * *");
  });

  it("weekly-briefing runs once per week", () => {
    const parsed = JSON.parse(vercelConfig);
    const wb = parsed.crons.find(
      (c: { path: string }) => c.path === "/api/cron/weekly-briefing",
    );
    expect(wb).toBeDefined();
    // Day-of-week field (5th) must NOT be '*' (which would mean daily)
    const parts = wb.schedule.split(/\s+/);
    expect(parts.length).toBe(5);
    expect(parts[4]).not.toBe("*");
  });
});
