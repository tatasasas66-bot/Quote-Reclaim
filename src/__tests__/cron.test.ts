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

  it("sends email via Resend (sendRecoveryEmail helper)", () => {
    expect(sendRoute).toContain("sendRecoveryEmail");
    expect(sendRoute).not.toMatch(/from\s+["']resend["']/);
  });

  it("keeps the Twilio path dormant behind SMS_ENABLED (default off)", () => {
    expect(sendRoute).toContain("getMessagingService");
    expect(sendRoute).not.toMatch(/from\s+["']twilio["']/);
    expect(sendRoute).toMatch(/SMS_ENABLED\s*=\s*process\.env\.SMS_ENABLED\s*===\s*"true"/);
    expect(sendRoute).toMatch(/if \(SMS_ENABLED\)[\s\S]*?smsProvider = getMessagingService\(\)/);
  });

  it("fails closed (503) only when SMS is enabled and Twilio is unavailable", () => {
    // The SMS provider is now resolved INSIDE the `if (SMS_ENABLED)` guard so
    // an email-only deploy never 503s for missing Twilio config.
    expect(sendRoute).toMatch(
      /if \(SMS_ENABLED\)[\s\S]*?smsProvider = getMessagingService\(\)[\s\S]*?catch[\s\S]*?status:\s*503/,
    );
  });

  it("uses the service client", () => {
    expect(sendRoute).toContain("createServiceSupabaseClient");
  });

  it("normalizes the recipient phone before sending SMS", () => {
    expect(sendRoute).toContain("normalizePhone");
  });

  it("routes by message_type: email is primary, sms is the dormant branch", () => {
    expect(sendRoute).toMatch(/r\.message_type === "email"/);
    expect(sendRoute).toMatch(/r\.message_type !== "sms"\s*\|\|\s*!SMS_ENABLED/);
  });

  it("skips email rows with no recipient_email (defensive)", () => {
    expect(sendRoute).toMatch(
      /message_type === "email"[\s\S]*?if \(!to\)[\s\S]*?skipped\+\+/,
    );
  });

  it("skips when the recipient phone is missing/invalid in the sms branch", () => {
    expect(sendRoute).toMatch(/if \(!phone\)[\s\S]*?skipped\+\+/);
  });

  it("inserts a row into outbound_messages with channel=email when sending email", () => {
    expect(sendRoute).toMatch(
      /from\("outbound_messages"\)\s*\.insert\(\{[\s\S]*?channel:\s*"email"[\s\S]*?status:[\s\S]*?emailResult\.ok/,
    );
  });

  it("inserts a row into outbound_messages with channel=sms when sending SMS", () => {
    expect(sendRoute).toMatch(
      /from\("outbound_messages"\)\s*\.insert\(\{[\s\S]*?channel:\s*"sms"[\s\S]*?status:[\s\S]*?smsResult\.ok/,
    );
  });

  it("uses an idempotency_key scoped per reminder + cron run", () => {
    expect(sendRoute).toMatch(
      /idempotency_key:\s*`cron:\$\{r\.reminder_id\}:\$\{cronRunId\}`/,
    );
  });

  it("marks reminder.sent=true only on send success (both branches)", () => {
    expect(sendRoute).toMatch(
      /emailResult\.ok[\s\S]{0,800}from\("reminders"\)\s*\.update\(\{ sent: true,/,
    );
    expect(sendRoute).toMatch(
      /smsResult\.ok[\s\S]{0,800}from\("reminders"\)\s*\.update\(\{ sent: true,/,
    );
  });

  it("releases the claim on send failure so the next run can retry", () => {
    expect(sendRoute).toMatch(/!emailResult\.ok[\s\S]*?releaseClaim/);
    expect(sendRoute).toMatch(/!smsResult\.ok[\s\S]*?releaseClaim/);
    expect(sendRoute).toMatch(
      /releaseClaim[\s\S]*?claimed_by:\s*null[\s\S]*?claimed_at:\s*null/,
    );
  });

  it("releases the claim when the row is skipped (opt-out / bad recipient / wrong-channel)", () => {
    expect(sendRoute).toMatch(/client_opted_out[\s\S]*?releaseClaim/);
    expect(sendRoute).toMatch(/message_type[\s\S]{0,160}releaseClaim/);
  });

  it("emits message_sent recovery_event on success (with provider id as source_event_id)", () => {
    expect(sendRoute).toMatch(/event_type:\s*"message_sent"/);
    expect(sendRoute).toMatch(
      /source_event_id:\s*emailResult\.providerMessageId/,
    );
    expect(sendRoute).toMatch(
      /source_event_id:\s*smsResult\.providerMessageId/,
    );
  });

  it("creates a cron_runs row at start and finalizes it at end", () => {
    expect(sendRoute).toMatch(
      /from\("cron_runs"\)\.insert\(\{[\s\S]*?status:\s*"running"/,
    );
    expect(sendRoute).toContain("finalizeCronRun");
    expect(sendRoute).toMatch(/status:\s*"success"|"partial"|"failed"/);
  });

  it("returns JSON with claimed/sent/failed/skipped/cap_deferred/stale_claims_released", () => {
    expect(sendRoute).toMatch(/claimed:\s*claimed\.length/);
    expect(sendRoute).toMatch(/sent,/);
    expect(sendRoute).toMatch(/failed,/);
    expect(sendRoute).toMatch(/skipped,/);
    expect(sendRoute).toMatch(/cap_deferred/);
    expect(sendRoute).toMatch(/stale_claims_released/);
  });

  it("never uses the word 'Bid'", () => {
    expect(sendRoute).not.toMatch(/\bBid\b/);
  });
});

// ---------------------------------------------------------------------------
// Hardening: stale claim release
// ---------------------------------------------------------------------------

describe("/api/cron/send — stale claim release", () => {
  it("defines a 30-minute stale-claim window", () => {
    expect(sendRoute).toMatch(
      /STALE_CLAIM_MAX_AGE_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/,
    );
  });

  it("calls releaseStaleClaims BEFORE claim_due_reminders", () => {
    expect(sendRoute).toMatch(
      /releaseStaleClaims\([\s\S]*?STALE_CLAIM_MAX_AGE_MS[\s\S]*?\)[\s\S]*?\.rpc\(\s*"claim_due_reminders"/,
    );
  });

  it("only releases stale claims that are older than the cutoff (fresh claims untouched)", () => {
    // The update must use .lt("claimed_at", cutoff) so anything newer than
    // (now - 30 min) is left alone for the still-running cron.
    expect(sendRoute).toMatch(
      /\.lt\("claimed_at",\s*cutoff\)/,
    );
  });

  it("only releases claims for reminders that have not yet been sent", () => {
    expect(sendRoute).toMatch(
      /releaseStaleClaims[\s\S]*?\.eq\("sent",\s*false\)/,
    );
  });

  it("only releases rows that are actually claimed (claimed_by IS NOT NULL)", () => {
    expect(sendRoute).toMatch(/\.not\("claimed_by",\s*"is",\s*null\)/);
  });

  it("computes the cutoff as now() - maxAgeMs (never the other way around)", () => {
    expect(sendRoute).toMatch(/Date\.now\(\)\s*-\s*maxAgeMs/);
  });

  it("clears both claimed_by AND claimed_at on stale release", () => {
    expect(sendRoute).toMatch(
      /releaseStaleClaims[\s\S]*?claimed_by:\s*null[\s\S]*?claimed_at:\s*null/,
    );
  });

  it("records the released count + any release error in cron_runs.metadata", () => {
    expect(sendRoute).toContain("stale_claims_released: staleRelease.released");
    expect(sendRoute).toContain("stale_release_error");
  });
});

// ---------------------------------------------------------------------------
// Hardening: per-user send cap
// ---------------------------------------------------------------------------

describe("/api/cron/send — per-user send cap", () => {
  it("defines a per-user-per-run cap of 5", () => {
    expect(sendRoute).toMatch(
      /PER_USER_SEND_CAP_PER_RUN\s*=\s*5/,
    );
  });

  it("counts attempts per user_id (not per reminder, not per quote)", () => {
    expect(sendRoute).toMatch(/perUserAttempts\s*=\s*new Map<string,\s*number>/);
    expect(sendRoute).toMatch(/perUserAttempts\.get\(r\.user_id\)/);
  });

  it("releases the claim when a user hits the cap (both channels) so the next tick retries", () => {
    expect(sendRoute).toMatch(
      /attempts\s*>=\s*PER_USER_SEND_CAP_PER_RUN[\s\S]*?releaseClaim\(supabase,\s*r\.reminder_id\)/,
    );
  });

  it("does NOT mark cap-released rows as 'failed' (counts them as capDeferred)", () => {
    expect(sendRoute).toMatch(
      /attempts\s*>=\s*PER_USER_SEND_CAP_PER_RUN[\s\S]{0,300}capDeferred\+\+/,
    );
    expect(sendRoute).toMatch(/let capDeferred = 0/);
  });

  it("skip-then-cap order: opt-out and missing recipient do NOT consume the cap (email branch)", () => {
    // Within the email branch, the recipient_email guard comes before the
    // per-user cap so a user with 10 missing-email rows still gets 5 valid sends.
    const optOutIdx = sendRoute.indexOf("if (r.client_opted_out)");
    const emailBranchIdx = sendRoute.indexOf('r.message_type === "email"');
    const noToIdx = sendRoute.indexOf("if (!to)");
    const emailCapIdx = sendRoute.indexOf("attempts >= PER_USER_SEND_CAP_PER_RUN");
    expect(optOutIdx).toBeGreaterThan(0);
    expect(emailBranchIdx).toBeGreaterThan(optOutIdx);
    expect(noToIdx).toBeGreaterThan(emailBranchIdx);
    expect(emailCapIdx).toBeGreaterThan(noToIdx);
  });

  it("skip-then-cap order: bad phone in the sms branch does NOT consume the cap", () => {
    const smsBranchIdx = sendRoute.indexOf('r.message_type !== "sms"');
    const phoneIdx = sendRoute.indexOf("if (!phone)");
    const smsCapIdx = sendRoute.indexOf(
      "attempts >= PER_USER_SEND_CAP_PER_RUN",
      phoneIdx,
    );
    expect(smsBranchIdx).toBeGreaterThan(0);
    expect(phoneIdx).toBeGreaterThan(smsBranchIdx);
    expect(smsCapIdx).toBeGreaterThan(phoneIdx);
  });

  it("increments the per-user counter only on rows that reach the provider", () => {
    // Email branch: incremented before sendRecoveryEmail. The window is wide
    // enough to allow the One-Tap link issuance (a fresh per-send token) to
    // run after the cap reservation and before the send.
    expect(sendRoute).toMatch(
      /perUserAttempts\.set\(r\.user_id,\s*attempts\s*\+\s*1\)[\s\S]{0,1200}sendRecoveryEmail/,
    );
    // SMS branch: incremented just before smsProvider.send. Unchanged.
    expect(sendRoute).toMatch(
      /perUserAttempts\.set\(r\.user_id,\s*attempts\s*\+\s*1\)[\s\S]{0,800}smsProvider\.send/,
    );
  });

  it("counts attempts (not successes) so failed sends still consume cap", () => {
    // The cap is bumped BEFORE we know the send result, so a failure still
    // costs one slot. Comment in the route explains the rationale.
    expect(sendRoute).toMatch(/bounds per-tenant SMS burst/i);
  });

  it("does not let global batch cap masquerade as per-user cap (claim limit is 200)", () => {
    const migration = readSource(
      "../../supabase/migrations/001_core_schema.sql",
    );
    expect(migration).toMatch(/limit 200/);
    // 5 is the per-user, 200 the global. Both should coexist.
    expect(sendRoute).toMatch(/PER_USER_SEND_CAP_PER_RUN\s*=\s*5/);
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

  it("selects one eligible quote with the centralized Sunday Reset logic", () => {
    expect(briefingRoute).toContain("pickSundayResetQuote");
    expect(briefingRoute).toContain('eq("outcome", "pending")');
    expect(briefingRoute).toContain("lastContactAt");
    expect(briefingRoute).toContain("paused");
  });

  it("sends contractor email only and never sends SMS", () => {
    expect(briefingRoute).toContain("sendRecoveryEmail");
    expect(briefingRoute).toContain("profile.email");
    expect(briefingRoute).not.toMatch(/getMessagingService\(\)/);
  });

  it("writes a cron_runs row and finalizes the run", () => {
    expect(briefingRoute).toMatch(
      /from\("cron_runs"\)\.insert\(\{[\s\S]*?status:\s*"running"/,
    );
    expect(briefingRoute).toContain("await finalize(cronRunId, status");
  });

  it("records the Sunday Reset event and UTC schedule without homeowner data", () => {
    expect(briefingRoute).toContain('event: "sunday_reset_sent"');
    expect(briefingRoute).toContain('schedule_timezone: "UTC"');
    expect(briefingRoute).not.toContain("client_phone");
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

describe("Production safety: SMS-enabled production without Twilio never silently simulates", () => {
  it("send route catches the messaging-service throw inside the SMS_ENABLED guard and records a failed run", () => {
    // The fail-closed-503 path applies only when SMS is enabled. Email-only
    // deploys (SMS_ENABLED=false) MUST NOT 503 for missing Twilio config.
    expect(sendRoute).toMatch(
      /if \(SMS_ENABLED\)[\s\S]*?smsProvider = getMessagingService\(\)[\s\S]*?catch[\s\S]*?finalizeCronRun[\s\S]*?"failed"[\s\S]*?status:\s*503/,
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
  // Vercel Hobby plan does not support cron intervals faster than daily.
  // The crons array is intentionally absent so Hobby deployments succeed.
  // To enable automatic scheduling, upgrade to Vercel Pro and add:
  //   { "path": "/api/cron/send", "schedule": "*/15 * * * *" }
  //   { "path": "/api/cron/weekly-briefing", "schedule": "0 13 * * 1" }

  it("registers the contractor-only Sunday Reset once per week", () => {
    const parsed = JSON.parse(vercelConfig);
    expect(parsed.crons).toEqual([
      {
        path: "/api/cron/weekly-briefing",
        schedule: "0 19 * * 0",
      },
    ]);
  });

  it("cron route files still exist in the codebase", () => {
    // Routes are deployable and manually triggerable even without Vercel scheduling
    expect(sendRoute).toContain("export async function GET");
    expect(sendRoute).toContain("export async function POST");
    expect(briefingRoute).toContain("export async function GET");
    expect(briefingRoute).toContain("export async function POST");
  });
});
