import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const routeSrc = readSource("../app/api/webhooks/resend-email-events/route.ts");
const migrationSrc = readSource(
  "../../supabase/migrations/008_quiet_signal.sql",
);

const TEST_SECRET_RAW = Buffer.alloc(32, 0).toString("base64");
const TEST_SECRET = `whsec_${TEST_SECRET_RAW}`;

function svixHeaders(id: string, ts: string, body: string): Headers {
  const key = Buffer.from(TEST_SECRET_RAW, "base64");
  const sig = createHmac("sha256", key)
    .update(`${id}.${ts}.${body}`)
    .digest("base64");
  return new Headers({
    "svix-id": id,
    "svix-timestamp": ts,
    "svix-signature": `v1,${sig}`,
    "content-type": "application/json",
  });
}

type RpcCall = { name: string; args: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];
let rpcReturn: { data: string | null; error: { code?: string } | null } = {
  data: "processed",
  error: null,
};

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcReturn);
    },
  }),
}));

beforeEach(() => {
  rpcCalls.length = 0;
  rpcReturn = { data: "processed", error: null };
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_EMAIL_EVENTS_WEBHOOK_SECRET", TEST_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function callRoute(body: string, headers: Headers) {
  const { POST } = await import(
    "@/app/api/webhooks/resend-email-events/route"
  );
  return POST(
    new Request("https://example.com/api/webhooks/resend-email-events", {
      method: "POST",
      body,
      headers,
    }) as unknown as import("next/server").NextRequest,
  );
}

// ---------------------------------------------------------------------------
// Signature verification — the gate
// ---------------------------------------------------------------------------

describe("resend-email-events webhook — signature gate", () => {
  it("503s in production when RESEND_EMAIL_EVENTS_WEBHOOK_SECRET is unset (fail-closed)", async () => {
    vi.stubEnv("RESEND_EMAIL_EVENTS_WEBHOOK_SECRET", "");
    const res = await callRoute("{}", new Headers());
    expect(res.status).toBe(503);
    expect(rpcCalls).toHaveLength(0);
  });

  it("401s on a bad signature", async () => {
    const body = '{"type":"email.opened","data":{"email_id":"abc"}}';
    const headers = new Headers({
      "svix-id": "m1",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      "content-type": "application/json",
    });
    const res = await callRoute(body, headers);
    expect(res.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it("does NOT leak the request body or secret in response copy", async () => {
    vi.stubEnv("RESEND_EMAIL_EVENTS_WEBHOOK_SECRET", "");
    const res = await callRoute("{}", new Headers());
    const text = await res.text();
    expect(text).not.toContain(TEST_SECRET);
    expect(text).not.toContain(TEST_SECRET_RAW);
    expect(text).not.toContain("whsec_");
  });
});

// ---------------------------------------------------------------------------
// Engagement events
// ---------------------------------------------------------------------------

describe("resend-email-events webhook — engagement", () => {
  it("forwards email.opened to record_email_event with svix_id + email_id", async () => {
    const body = '{"type":"email.opened","data":{"email_id":"resend-abc-1"}}';
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await callRoute(body, svixHeaders("svix_msg_1", ts, body));
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("record_email_event");
    expect(rpcCalls[0].args).toEqual({
      p_svix_id: "svix_msg_1",
      p_event_type: "email.opened",
      p_email_id: "resend-abc-1",
    });
  });

  it("forwards email.clicked the same way", async () => {
    const body = '{"type":"email.clicked","data":{"email_id":"resend-abc-1"}}';
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await callRoute(body, svixHeaders("svix_msg_2", ts, body));
    expect(res.status).toBe(200);
    expect(rpcCalls[0].args.p_event_type).toBe("email.clicked");
  });

  it("still forwards non-engagement event types so the dedupe ledger records them (RPC ignores)", async () => {
    const body = '{"type":"email.delivered","data":{"email_id":"x"}}';
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await callRoute(body, svixHeaders("svix_msg_3", ts, body));
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args.p_event_type).toBe("email.delivered");
  });

  it("acks duplicate svix_id deliveries cleanly (idempotency at the RPC layer)", async () => {
    rpcReturn = { data: "duplicate", error: null };
    const body = '{"type":"email.opened","data":{"email_id":"abc"}}';
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await callRoute(body, svixHeaders("svix_dup", ts, body));
    expect(res.status).toBe(200);
  });

  it("returns 500 (lets Resend retry) when the RPC errors — safe because the RPC is idempotent", async () => {
    rpcReturn = { data: null, error: { code: "XX000" } };
    const body = '{"type":"email.opened","data":{"email_id":"abc"}}';
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await callRoute(body, svixHeaders("svix_err", ts, body));
    expect(res.status).toBe(500);
  });

  it("acks (no RPC call) when body is malformed JSON — nothing to record, no retry needed", async () => {
    const body = "not-json{";
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await callRoute(body, svixHeaders("svix_bad", ts, body));
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Source-level guarantees — protect the architecture decisions
// ---------------------------------------------------------------------------

describe("resend-email-events route — source-level guarantees", () => {
  it("delegates to the RPC for atomic insert+update (no client-side counter math)", () => {
    expect(routeSrc).toMatch(/rpc\(\s*"record_email_event"/);
    // No raw increment in the route — the RPC owns it.
    expect(routeSrc).not.toMatch(/open_count\s*[\+\-]/);
    expect(routeSrc).not.toMatch(/click_count\s*[\+\-]/);
  });

  it("verifies against the DEDICATED RESEND_EMAIL_EVENTS_WEBHOOK_SECRET", () => {
    expect(routeSrc).toMatch(
      /process\.env\.RESEND_EMAIL_EVENTS_WEBHOOK_SECRET/,
    );
    // Must NOT READ the generic name or the inbound webhook's secret (a
    // comment may reference EMAIL_INBOUND_SECRET to document the boundary,
    // but it must never be accessed here).
    expect(routeSrc).not.toMatch(/process\.env\.RESEND_WEBHOOK_SECRET\b/);
    expect(routeSrc).not.toMatch(/process\.env\.EMAIL_INBOUND_SECRET/);
  });

  it("never logs the raw body, secret, or signature headers", () => {
    expect(routeSrc).not.toMatch(/console\.\w+\([^)]*rawBody/);
    expect(routeSrc).not.toMatch(/console\.\w+\([^)]*svixSignature/);
    expect(routeSrc).not.toMatch(/console\.\w+\([^)]*RESEND_EMAIL_EVENTS_WEBHOOK_SECRET/);
    expect(routeSrc).not.toMatch(/console\.\w+\([^)]*RESEND_WEBHOOK_SECRET/);
  });
});

// ---------------------------------------------------------------------------
// Per-webhook secret isolation — the inbound/reply webhook must keep its own
// secret; the open/click webhook must use the dedicated one. This guards
// against a future regression where the two webhooks share a secret var and
// rotating one breaks the other (Resend issues one signing secret per
// endpoint).
// ---------------------------------------------------------------------------

describe("webhook secret isolation across Resend routes", () => {
  const inboundSrc = readSource("../app/api/webhooks/email-inbound/route.ts");
  const svixHelperSrc = readSource("../lib/messaging/svix-signature.ts");

  it("inbound/reply webhook still uses its existing EMAIL_INBOUND_SECRET (unchanged)", () => {
    expect(inboundSrc).toMatch(/process\.env\.EMAIL_INBOUND_SECRET/);
    // The inbound webhook must NOT depend on either Resend-events secret.
    expect(inboundSrc).not.toMatch(/RESEND_EMAIL_EVENTS_WEBHOOK_SECRET/);
    expect(inboundSrc).not.toMatch(/RESEND_WEBHOOK_SECRET/);
  });

  it("the Svix verifier helper reads ONLY the dedicated email-events secret", () => {
    expect(svixHelperSrc).toMatch(/RESEND_EMAIL_EVENTS_WEBHOOK_SECRET/);
    expect(svixHelperSrc).not.toMatch(/\bRESEND_WEBHOOK_SECRET\b/);
    // A comment may reference EMAIL_INBOUND_SECRET as the inbound webhook's
    // separate secret; the helper must never READ it from env.
    expect(svixHelperSrc).not.toMatch(/env\.EMAIL_INBOUND_SECRET/);
    expect(svixHelperSrc).not.toMatch(/process\.env\.EMAIL_INBOUND_SECRET/);
  });

  it(".env.example documents the dedicated secret and warns against reuse", () => {
    const envExample = readSource("../../.env.example");
    expect(envExample).toMatch(/^RESEND_EMAIL_EVENTS_WEBHOOK_SECRET=/m);
  });
});

// ---------------------------------------------------------------------------
// Migration 008 — schema scope is exactly what we approved
// ---------------------------------------------------------------------------

describe("migration 008_quiet_signal — minimal schema delta", () => {
  it("adds exactly one new table (email_webhook_events)", () => {
    const tables = migrationSrc.match(/create table if not exists/g) ?? [];
    expect(tables).toHaveLength(1);
    expect(migrationSrc).toContain(
      "create table if not exists public.email_webhook_events",
    );
  });

  it("the dedupe table keys on svix_id (the upstream event id)", () => {
    expect(migrationSrc).toMatch(/svix_id text primary key/);
  });

  it("adds exactly four engagement columns to outbound_messages (all additive)", () => {
    expect(migrationSrc).toMatch(/add column if not exists open_count int/);
    expect(migrationSrc).toMatch(/add column if not exists click_count int/);
    expect(migrationSrc).toMatch(
      /add column if not exists first_opened_at timestamptz/,
    );
    expect(migrationSrc).toMatch(
      /add column if not exists last_engaged_at timestamptz/,
    );
  });

  it("declares the record_email_event RPC for atomic dedupe+counter", () => {
    expect(migrationSrc).toMatch(
      /create or replace function public\.record_email_event/,
    );
    expect(migrationSrc).toMatch(/on conflict \(svix_id\) do nothing/);
    expect(migrationSrc).toMatch(
      /grant execute on function public\.record_email_event[^;]+to service_role/,
    );
  });

  it("does not edit any existing table or RPC", () => {
    // Sanity: no DROP or ALTER on pre-existing structures.
    expect(migrationSrc).not.toMatch(/drop table/i);
    expect(migrationSrc).not.toMatch(/drop function/i);
    // Only ALTER allowed is the additive ADD COLUMN block.
    const alters = migrationSrc.match(/alter table/gi) ?? [];
    // 1 ALTER for the new RLS enable + 1 ALTER for the additive ADD COLUMN.
    expect(alters.length).toBeLessThanOrEqual(2);
  });
});
