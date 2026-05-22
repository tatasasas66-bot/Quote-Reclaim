import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import {
  shouldVerifyMode,
  verifyTwilioSignature,
} from "../lib/messaging/twilio-signature";
import {
  normalizePhone,
  maskPhone,
  phoneCandidates,
} from "../lib/messaging/phone";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const inboundRoute = readSource(
  "../app/api/webhooks/twilio/inbound/route.ts",
);
const statusRoute = readSource(
  "../app/api/webhooks/twilio/status/route.ts",
);
const sigHelper = readSource("../lib/messaging/twilio-signature.ts");
const phoneHelper = readSource("../lib/messaging/phone.ts");
const actions = readSource("../lib/quotes/actions.ts");

function computeSig(
  token: string,
  url: string,
  params: Record<string, string>,
): string {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  return createHmac("sha1", token).update(data).digest("base64");
}

// ---------------------------------------------------------------------------
// verifyTwilioSignature (real behavior)
// ---------------------------------------------------------------------------

describe("verifyTwilioSignature", () => {
  const token = "test_auth_token_aaaa";
  const url = "https://example.com/api/webhooks/twilio/inbound";
  const params = { Body: "hello", From: "+15551234567", MessageSid: "SM1" };

  it("accepts a correctly computed signature", () => {
    const signature = computeSig(token, url, params);
    expect(
      verifyTwilioSignature({
        authToken: token,
        url,
        formParams: params,
        signature,
      }),
    ).toBe(true);
  });

  it("rejects a bogus signature", () => {
    expect(
      verifyTwilioSignature({
        authToken: token,
        url,
        formParams: params,
        signature: "this-is-not-valid",
      }),
    ).toBe(false);
  });

  it("rejects when params are tampered", () => {
    const signature = computeSig(token, url, params);
    const tampered = { ...params, Body: "evil" };
    expect(
      verifyTwilioSignature({
        authToken: token,
        url,
        formParams: tampered,
        signature,
      }),
    ).toBe(false);
  });

  it("rejects when url is tampered", () => {
    const signature = computeSig(token, url, params);
    expect(
      verifyTwilioSignature({
        authToken: token,
        url: url + "?attack=1",
        formParams: params,
        signature,
      }),
    ).toBe(false);
  });

  it("rejects empty signature or token", () => {
    expect(
      verifyTwilioSignature({
        authToken: "",
        url,
        formParams: params,
        signature: "anything",
      }),
    ).toBe(false);
    expect(
      verifyTwilioSignature({
        authToken: token,
        url,
        formParams: params,
        signature: "",
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldVerifyMode
// ---------------------------------------------------------------------------

describe("shouldVerifyMode", () => {
  it("returns 'verify' in production when token is set", () => {
    expect(
      shouldVerifyMode({ NODE_ENV: "production", TWILIO_AUTH_TOKEN: "x" }),
    ).toBe("verify");
  });

  it("returns 'reject' in production when token is missing (fail closed)", () => {
    expect(shouldVerifyMode({ NODE_ENV: "production" })).toBe("reject");
  });

  it("returns 'verify' in non-production when token is set", () => {
    expect(
      shouldVerifyMode({ NODE_ENV: "development", TWILIO_AUTH_TOKEN: "x" }),
    ).toBe("verify");
  });

  it("returns 'allow-unsigned' in non-production when token absent", () => {
    expect(shouldVerifyMode({ NODE_ENV: "development" })).toBe(
      "allow-unsigned",
    );
    expect(shouldVerifyMode({ NODE_ENV: "test" })).toBe("allow-unsigned");
  });
});

// ---------------------------------------------------------------------------
// Phone helpers
// ---------------------------------------------------------------------------

describe("normalizePhone", () => {
  it("passes through E.164", () => {
    expect(normalizePhone("+15551234567")).toBe("+15551234567");
  });

  it("normalizes US 10-digit to +1", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("555-123-4567")).toBe("+15551234567");
    expect(normalizePhone("5551234567")).toBe("+15551234567");
  });

  it("normalizes 11-digit starting with 1", () => {
    expect(normalizePhone("1-555-123-4567")).toBe("+15551234567");
  });

  it("returns empty for invalid input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("abc")).toBe("");
    expect(normalizePhone("12")).toBe("");
  });
});

describe("maskPhone", () => {
  it("masks all but last 4 digits", () => {
    expect(maskPhone("+15551234567")).toBe("***-***-4567");
    expect(maskPhone("555-123-4567")).toBe("***-***-4567");
  });

  it("returns [unknown] for null/empty", () => {
    expect(maskPhone(null)).toBe("[unknown]");
    expect(maskPhone("")).toBe("[unknown]");
  });

  it("returns [redacted] for too-short input", () => {
    expect(maskPhone("12")).toBe("[redacted]");
  });
});

describe("phoneCandidates", () => {
  it("includes both raw and normalized when they differ", () => {
    const list = phoneCandidates("(555) 123-4567");
    expect(list).toContain("(555) 123-4567");
    expect(list).toContain("+15551234567");
  });

  it("deduplicates when already normalized", () => {
    const list = phoneCandidates("+15551234567");
    expect(list).toEqual(["+15551234567"]);
  });
});

// ---------------------------------------------------------------------------
// Inbound webhook route — source-level invariants
// ---------------------------------------------------------------------------

describe("/api/webhooks/twilio/inbound route", () => {
  it("exports a POST handler", () => {
    expect(inboundRoute).toMatch(/export async function POST/);
  });

  it("verifies the Twilio signature", () => {
    expect(inboundRoute).toContain("verifyTwilioSignature");
    expect(inboundRoute).toContain("shouldVerifyMode");
  });

  it("returns 401 on invalid signature", () => {
    expect(inboundRoute).toMatch(/status:\s*401/);
    expect(inboundRoute).toContain("Invalid signature");
  });

  it("returns 503 when mode is 'reject' (production + missing token)", () => {
    expect(inboundRoute).toMatch(/status:\s*503/);
    expect(inboundRoute).toMatch(/mode === "reject"/);
  });

  it("reads the X-Twilio-Signature header", () => {
    expect(inboundRoute).toContain("X-Twilio-Signature");
  });

  it("uses the service-role client", () => {
    expect(inboundRoute).toContain("createServiceSupabaseClient");
  });

  it("attributes via outbound_messages, NOT by querying quotes by client_phone", () => {
    expect(inboundRoute).toMatch(
      /from\("outbound_messages"\)[\s\S]*?recipient/,
    );
    // The route must never look up quotes by client_phone column directly.
    expect(inboundRoute).not.toMatch(
      /from\("quotes"\)[\s\S]{0,200}\.eq\("client_phone"/,
    );
    expect(inboundRoute).not.toMatch(
      /from\("quotes"\)[\s\S]{0,200}\.ilike\("client_phone"/,
    );
  });

  it("filters outbound to channel='sms' and status in (queued,sent,delivered,replied)", () => {
    expect(inboundRoute).toMatch(/\.eq\("channel",\s*"sms"\)/);
    expect(inboundRoute).toMatch(/queued/);
    expect(inboundRoute).toMatch(/sent/);
    expect(inboundRoute).toMatch(/delivered/);
    expect(inboundRoute).toMatch(/replied/);
  });

  it("picks the newest matching outbound row (order created_at desc, limit 1)", () => {
    expect(inboundRoute).toMatch(
      /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/,
    );
    expect(inboundRoute).toMatch(/\.limit\(1\)/);
  });

  it("returns 200 (empty TwiML) when no outbound row matches", () => {
    expect(inboundRoute).toContain("emptyTwiml");
    expect(inboundRoute).toMatch(/if \(!matched\)[\s\S]*?return emptyTwiml/);
  });

  it("detects STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT", () => {
    expect(inboundRoute).toContain("STOP");
    expect(inboundRoute).toContain("STOPALL");
    expect(inboundRoute).toContain("UNSUBSCRIBE");
    expect(inboundRoute).toContain("CANCEL");
    expect(inboundRoute).toContain("END");
    expect(inboundRoute).toContain("QUIT");
  });

  it("on STOP: sets client_opted_out only for the matched quote/user", () => {
    expect(inboundRoute).toMatch(
      /update\(\{\s*client_opted_out:\s*true\s*\}\)[\s\S]*?\.eq\("id",\s*quote\.id\)[\s\S]*?\.eq\("user_id",\s*quote\.user_id\)/,
    );
  });

  it("on STOP: pauses remaining unsent reminders for the matched quote", () => {
    expect(inboundRoute).toMatch(
      /from\("reminders"\)[\s\S]*?paused_at[\s\S]*?\.eq\("quote_id",\s*quote\.id\)/,
    );
  });

  it("on STOP: emits an 'opt_out' recovery_event with source_event_id", () => {
    expect(inboundRoute).toMatch(
      /event_type:\s*"opt_out"[\s\S]*?source_event_id:\s*messageSid/,
    );
  });

  it("on reply: marks outbound row status='replied'", () => {
    expect(inboundRoute).toMatch(/status:\s*"replied"/);
    expect(inboundRoute).toContain("reply_text");
    expect(inboundRoute).toContain("reply_at");
    expect(inboundRoute).toContain("reply_provider_msg_id");
  });

  it("on reply: pauses unsent reminders for the matched quote", () => {
    expect(inboundRoute).toMatch(
      /paused_at:\s*now[\s\S]*?\.eq\("sent",\s*false\)/,
    );
  });

  it("on reply: emits 'reply_received' event with source_event_id (idempotent)", () => {
    expect(inboundRoute).toMatch(
      /event_type:\s*"reply_received"[\s\S]*?source_event_id:\s*messageSid/,
    );
  });

  it("does not mark the quote as won on reply", () => {
    expect(inboundRoute).not.toMatch(/mark_quote_won/);
    expect(inboundRoute).not.toMatch(/outcome:\s*["']won["']/);
  });

  it("ignores duplicate (23505) recovery_event inserts (idempotency)", () => {
    expect(inboundRoute).toContain("23505");
  });

  it("masks phone numbers in logs (never logs raw From)", () => {
    expect(inboundRoute).toContain("maskPhone");
    // Match: console.log with raw `from` interpolation — should NOT exist.
    expect(inboundRoute).not.toMatch(/console\.log\([^)]*\$\{from\}/);
  });

  it("truncates body before storing as reply_text to bound size", () => {
    expect(inboundRoute).toMatch(/body\.slice\(0,\s*1000\)/);
  });

  it("returns text/xml TwiML response", () => {
    expect(inboundRoute).toContain("text/xml");
    expect(inboundRoute).toContain("<Response></Response>");
  });

  it("does not send additional outbound messages from the inbound handler", () => {
    // Phase 8 boundary: no auto-reply, no STOP confirmation send.
    expect(inboundRoute).not.toMatch(/getMessagingService/);
    expect(inboundRoute).not.toMatch(/\.send\(/);
  });

  it("never uses the word 'Bid'", () => {
    expect(inboundRoute).not.toMatch(/\bBid\b/);
  });
});

// ---------------------------------------------------------------------------
// Status webhook route — source-level invariants
// ---------------------------------------------------------------------------

describe("/api/webhooks/twilio/status route", () => {
  it("exports a POST handler", () => {
    expect(statusRoute).toMatch(/export async function POST/);
  });

  it("verifies the Twilio signature", () => {
    expect(statusRoute).toContain("verifyTwilioSignature");
    expect(statusRoute).toContain("shouldVerifyMode");
  });

  it("returns 401 on invalid signature, 503 on missing-token-in-prod", () => {
    expect(statusRoute).toMatch(/status:\s*401/);
    expect(statusRoute).toMatch(/status:\s*503/);
  });

  it("matches outbound by provider_msg_id = MessageSid (not by recipient)", () => {
    expect(statusRoute).toMatch(
      /\.eq\("provider_msg_id",\s*messageSid\)/,
    );
  });

  it("validates MessageStatus is one of queued/sent/delivered/undelivered/failed", () => {
    expect(statusRoute).toContain("VALID_STATUSES");
    expect(statusRoute).toContain("queued");
    expect(statusRoute).toContain("sent");
    expect(statusRoute).toContain("delivered");
    expect(statusRoute).toContain("undelivered");
    expect(statusRoute).toContain("failed");
  });

  it("never downgrades a row from 'replied' to 'sent' or 'delivered'", () => {
    expect(statusRoute).toContain("precedence");
    expect(statusRoute).toMatch(/precedence\(newStatus\)\s*<=\s*precedence\(matched\.status\)/);
    expect(statusRoute).toMatch(/case "replied":\s*return\s*9/);
  });

  it("sets delivered_at on delivered (and only the first time)", () => {
    expect(statusRoute).toMatch(
      /newStatus === "delivered"[\s\S]*?!matched\.delivered_at[\s\S]*?delivered_at/,
    );
  });

  it("stores failure_reason on failed/undelivered with ErrorCode + ErrorMessage", () => {
    expect(statusRoute).toContain("failure_reason");
    expect(statusRoute).toContain("ErrorCode");
    expect(statusRoute).toContain("ErrorMessage");
    expect(statusRoute).toMatch(
      /newStatus === "failed".*newStatus === "undelivered"/,
    );
  });

  it("emits 'message_delivered' event on delivered with source_event_id (idempotent)", () => {
    expect(statusRoute).toMatch(
      /event_type:\s*"message_delivered"[\s\S]*?source_event_id:\s*messageSid/,
    );
    expect(statusRoute).toContain("23505");
  });

  it("does not emit message_delivered for non-delivered statuses", () => {
    // The event insert must be guarded by newStatus === "delivered"
    expect(statusRoute).toMatch(
      /if \(newStatus === "delivered"\)[\s\S]*?event_type:\s*"message_delivered"/,
    );
  });

  it("returns 200 even when MessageSid is unknown (no mutation, idempotent)", () => {
    expect(statusRoute).toMatch(/if \(!matched\)[\s\S]*?status:\s*200/);
  });

  it("uses the service-role client", () => {
    expect(statusRoute).toContain("createServiceSupabaseClient");
  });

  it("never uses the word 'Bid'", () => {
    expect(statusRoute).not.toMatch(/\bBid\b/);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant attribution safety
// ---------------------------------------------------------------------------

describe("Cross-tenant attribution safety", () => {
  it("inbound route never selects from 'quotes' filtered by client_phone alone", () => {
    // The only quote lookup in the inbound route uses .eq("id", matched.quote_id)
    // AND .eq("user_id", matched.user_id) — both come from the outbound row.
    expect(inboundRoute).toMatch(
      /from\("quotes"\)[\s\S]{0,300}\.eq\("id",\s*matched\.quote_id\)[\s\S]{0,200}\.eq\("user_id",\s*matched\.user_id\)/,
    );
  });

  it("status route never reads quotes by client_phone", () => {
    expect(statusRoute).not.toMatch(/client_phone/);
  });

  it("STOP mutation is scoped to matched quote_id + user_id", () => {
    // Validates that quote update + reminders update both filter by user_id.
    expect(inboundRoute).toMatch(
      /client_opted_out:\s*true[\s\S]*?\.eq\("id",\s*quote\.id\)[\s\S]*?\.eq\("user_id",\s*quote\.user_id\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 7 carryover: phone normalization on outbound
// ---------------------------------------------------------------------------

describe("Phase 7 sendReminderManualAction: normalized phone on outbound", () => {
  it("normalizes phone before calling Twilio", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toContain("normalizePhone");
    expect(slice).toContain("normalizedPhone");
  });

  it("uses the normalized phone in outbound_messages.recipient", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/recipient:\s*normalizedPhone/);
  });

  it("rejects send when the phone cannot be normalized", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/!normalizedPhone[\s\S]*?valid format/);
  });
});

// ---------------------------------------------------------------------------
// twilio-signature helper invariants
// ---------------------------------------------------------------------------

describe("twilio-signature helper invariants", () => {
  it("uses HMAC-SHA1 (Twilio spec)", () => {
    expect(sigHelper).toContain("createHmac");
    expect(sigHelper).toMatch(/sha1/i);
  });

  it("uses timingSafeEqual for comparison (no early-exit timing leak)", () => {
    expect(sigHelper).toContain("timingSafeEqual");
  });

  it("never logs the auth token", () => {
    expect(sigHelper).not.toMatch(/console\.[a-z]+\([^)]*authToken/);
  });

  it("phone helper has no PII leak in logs", () => {
    expect(phoneHelper).not.toMatch(/console\./);
  });
});
