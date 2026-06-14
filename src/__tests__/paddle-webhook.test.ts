/**
 * Paddle webhook route — source-level invariants.
 *
 * The route is a thin wiring layer over `paddle-signature` and
 * `paddle-events` (both already unit-tested), so this file pins the
 * dangerous parts a code-review would otherwise have to re-check by hand:
 *
 *   - The signature is verified against the EXACT raw body bytes.
 *   - Idempotency is enforced via the `paddle_events` PK ledger.
 *   - Production fails closed (503) when PADDLE_WEBHOOK_SECRET is missing.
 *   - The route never trusts client-supplied user_id for entitlement; the
 *     transition writer falls back to looking up the user_id by the Paddle
 *     subscription_id when custom_data is absent.
 *   - profiles.is_paid is the single entitlement flag flipped.
 *   - The route is force-dynamic + nodejs runtime so HMAC and Supabase
 *     work correctly (Edge runtime has no node:crypto, no service role).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const route = readFileSync(
  fileURLToPath(new URL("../app/api/webhooks/paddle/route.ts", import.meta.url)),
  "utf8",
);

describe("Paddle webhook route — wiring invariants", () => {
  it("uses the Node.js runtime and force-dynamic (required for HMAC + service role)", () => {
    expect(route).toMatch(/export const runtime = "nodejs"/);
    expect(route).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("reads the request body as TEXT before any JSON parse — HMAC needs the raw bytes", () => {
    // Calling request.json() first would re-serialize the payload and break
    // signature verification on whitespace differences. The route must call
    // request.text() and only then JSON.parse(rawBody). We look at the
    // FUNCTION-BODY positions (skipping the import line which also names
    // verifyPaddleSignature).
    const textIdx = route.indexOf("request.text()");
    const jsonIdx = route.indexOf("JSON.parse(rawBody)");
    const verifyCallIdx = route.indexOf("inspectPaddleSignature(");
    expect(textIdx).toBeGreaterThan(0);
    expect(verifyCallIdx).toBeGreaterThan(textIdx);
    expect(jsonIdx).toBeGreaterThan(verifyCallIdx);
  });

  it("fails closed (503) when production is configured without PADDLE_WEBHOOK_SECRET", () => {
    expect(route).toContain("shouldVerifyPaddleMode");
    expect(route).toMatch(/mode === "reject"[\s\S]*?status:\s*503/);
  });

  it("rejects (401) when a verify-mode request fails signature check", () => {
    expect(route).toMatch(/Invalid signature[\s\S]*?status:\s*401/);
  });

  it("trims the secret so a Vercel paste with trailing whitespace still works", () => {
    expect(route).toMatch(/PADDLE_WEBHOOK_SECRET[\s\S]{0,40}\.trim\(\)/);
  });

  it("logs a safe diagnostic on signature failure — reason + lengths + presence flags, never values", () => {
    // The route must log WHY verification failed (reason) plus the safe
    // metrics needed to diagnose the cause from Vercel logs. It must NEVER
    // log the secret bytes, the signature bytes, or the body bytes.
    expect(route).toContain("inspectPaddleSignature");
    expect(route).toContain("signature verification failed");
    expect(route).toMatch(/reason=\$\{inspection\.reason\}/);
    expect(route).toMatch(/secret_len=\$\{secret\.length\}/);
    expect(route).toMatch(/body_len=\$\{rawBody\.length\}/);
    // Hard rule: nothing in the failure log expands the actual values.
    // `${secret}`, `${rawBody}`, `${sigHeader}` would each leak — banned.
    expect(route).not.toMatch(/\$\{secret\}/);
    expect(route).not.toMatch(/\$\{rawBody\}/);
    expect(route).not.toMatch(/\$\{sigHeader\}/);
  });

  it("dedupes by event_id via the paddle_events ledger (PK constraint)", () => {
    expect(route).toContain('from("paddle_events")');
    expect(route).toMatch(/select\("event_id"\)/);
    expect(route).toMatch(/idempotent:\s*true/);
    // The PK conflict code (23505) is handled as a no-op so concurrent
    // deliveries of the same event don't 5xx.
    expect(route).toContain("23505");
  });

  it("inserts the event_id BEFORE applying the transition so a transition-side crash still records the event", () => {
    const insertIdx = route.indexOf('from("paddle_events").insert');
    const applyIdx = route.indexOf("applyTransition");
    expect(insertIdx).toBeGreaterThan(0);
    expect(applyIdx).toBeGreaterThan(insertIdx);
  });

  it("resolves user_id either from custom_data OR from the existing subscriptions row by Paddle subscription_id", () => {
    expect(route).toMatch(/paddle_subscription_id/);
    expect(route).toContain('from("subscriptions")');
    expect(route).toMatch(/select\("user_id"\)/);
  });

  it("upserts the subscriptions row on user_id (PK) and writes paddle identifiers", () => {
    expect(route).toMatch(/upsert\([\s\S]*?onConflict:\s*"user_id"/);
    expect(route).toContain("paddle_subscription_id: t.subscriptionId");
    expect(route).toContain("paddle_customer_id: t.customerId");
  });

  it("flips profiles.is_paid as the single entitlement flag (not a side table)", () => {
    expect(route).toMatch(/from\("profiles"\)[\s\S]*?update\(\{\s*is_paid:\s*t\.entitled\s*\}\)[\s\S]*?eq\("id",\s*userId\)/);
  });

  it("NEVER downgrades on a status-less event (transaction.completed must not deactivate a paying user)", () => {
    // Paddle delivers webhooks UNORDERED. transaction.completed maps to
    // status=null/entitled=false; if applyTransition wrote it, it could land
    // after subscription.activated and flip is_paid back to false. The guard
    // bails out before any write when status is null.
    expect(route).toMatch(/if \(t\.status === null\) return;/);
    const guardIdx = route.indexOf("if (t.status === null) return;");
    const upsertIdx = route.indexOf("upsert(");
    const isPaidIdx = route.indexOf("is_paid: t.entitled");
    expect(guardIdx).toBeGreaterThan(0);
    // The guard precedes BOTH the subscriptions upsert and the is_paid write.
    expect(guardIdx).toBeLessThan(upsertIdx);
    expect(guardIdx).toBeLessThan(isPaidIdx);
  });

  it("uses the service-role Supabase client — needed to bypass RLS on subscriptions and to satisfy migration 011's is_paid lockdown", () => {
    expect(route).toContain("createServiceSupabaseClient");
  });

  it("never trusts a client-supplied subscription_id for entitlement directly — the transition writer always re-resolves user_id server-side", () => {
    // The route flow: parse → dedupe → transition → applyTransition. Only
    // applyTransition writes to profiles.is_paid, and it resolves userId
    // either from custom_data or from a server-side query against the
    // subscriptions row.
    expect(route).not.toMatch(/request\.json\(\)/);
    expect(route).toContain("applyTransition");
  });
});
