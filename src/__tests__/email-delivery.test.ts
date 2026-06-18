import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  selectChannel,
  recoveryEmailSubject,
  type DeliveryChannel,
} from "@/lib/messaging/select-channel";
import { sendRecoveryEmail } from "@/lib/messaging/email-provider";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const sendRoute = readSource("../app/api/cron/send/route.ts");
const actions = readSource("../lib/quotes/actions.ts");
const sendBtn = readSource("../components/quotes/SendEarlyButton.tsx");
const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const emailProvider = readSource("../lib/messaging/email-provider.ts");
const envExample = readSource("../../.env.example");

afterEach(() => {
  delete process.env.SMS_ENABLED;
  delete process.env.RESEND_API_KEY;
});

// ---------------------------------------------------------------------------
// selectChannel
// ---------------------------------------------------------------------------

describe("selectChannel", () => {
  it("returns 'email' when client_email is set", () => {
    const result: DeliveryChannel = selectChannel({
      client_email: "jane@example.com",
      client_phone: null,
    });
    expect(result).toBe("email");
  });

  it("prefers email over phone even when both are set", () => {
    const result: DeliveryChannel = selectChannel({
      client_email: "jane@example.com",
      client_phone: "+15555550199",
    });
    expect(result).toBe("email");
  });

  it("returns 'sms' when only client_phone is set AND SMS_ENABLED=true", () => {
    process.env.SMS_ENABLED = "true";
    const result: DeliveryChannel = selectChannel({
      client_email: null,
      client_phone: "+15555550199",
    });
    expect(result).toBe("sms");
  });

  it("returns 'copy' for phone-only quotes when SMS_ENABLED is unset (default)", () => {
    const result: DeliveryChannel = selectChannel({
      client_email: null,
      client_phone: "+15555550199",
    });
    expect(result).toBe("copy");
  });

  it("returns 'copy' for phone-only quotes when SMS_ENABLED=false", () => {
    process.env.SMS_ENABLED = "false";
    const result: DeliveryChannel = selectChannel({
      client_email: null,
      client_phone: "+15555550199",
    });
    expect(result).toBe("copy");
  });

  it("returns 'copy' when neither contact channel is present", () => {
    const result: DeliveryChannel = selectChannel({
      client_email: null,
      client_phone: null,
    });
    expect(result).toBe("copy");
  });

  it("treats whitespace-only contact values as missing", () => {
    expect(selectChannel({ client_email: "   ", client_phone: null })).toBe("copy");
  });
});

// ---------------------------------------------------------------------------
// recoveryEmailSubject
// ---------------------------------------------------------------------------

describe("recoveryEmailSubject", () => {
  it("uses trade in the subject ('Quote' or 'Estimate' framing, never 'Bid')", () => {
    expect(recoveryEmailSubject("Roofing")).toBe(
      "Following up on your Roofing estimate",
    );
    expect(recoveryEmailSubject("HVAC")).toBe(
      "Following up on your HVAC estimate",
    );
  });
});

// ---------------------------------------------------------------------------
// sendRecoveryEmail
// ---------------------------------------------------------------------------

describe("sendRecoveryEmail", () => {
  it("returns ok:false (does not throw) when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendRecoveryEmail({
      to: "jane@example.com",
      subject: "Test",
      body: "Hello",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("RESEND_API_KEY");
    }
  });
});

// ---------------------------------------------------------------------------
// email-provider source invariants
// ---------------------------------------------------------------------------

describe("email-provider source invariants", () => {
  it("uses the verified domain hello@quotereclaim.com as the From address (now centralized in sender-identity)", () => {
    // The verified sending address + brand default moved to sender-identity.ts
    // so the customer-facing display name can vary per contractor while the
    // address (SPF/DKIM/DMARC anchor) never does. email-provider just consumes
    // DEFAULT_FROM and the per-send `from` override.
    const senderIdentity = readSource("../lib/messaging/sender-identity.ts");
    expect(senderIdentity).toContain('"hello@quotereclaim.com"');
    expect(senderIdentity).toContain("Quote Reclaim");
    expect(emailProvider).toContain("DEFAULT_FROM");
  });

  it("imports the Resend SDK", () => {
    expect(emailProvider).toContain('from "resend"');
  });

  it("returns providerMessageId on success (mirrors the SMS contract)", () => {
    expect(emailProvider).toContain("providerMessageId");
  });

  it("never accepts a recipient or body from the client surface (helper takes typed params)", () => {
    expect(emailProvider).toContain("SendEmailParams");
  });
});

// ---------------------------------------------------------------------------
// sendReminderManualEmailAction
// ---------------------------------------------------------------------------

describe("sendReminderManualEmailAction", () => {
  it("is exported from actions.ts", () => {
    expect(actions).toContain(
      "export async function sendReminderManualEmailAction",
    );
  });

  it("re-authenticates user via getUser() before any mutation", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toContain("getUser()");
  });

  it("uses service client for all DB operations", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toContain("createServiceSupabaseClient");
  });

  it("rejects when reminder is already sent", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toMatch(/reminder\.sent[\s\S]*?Already sent/);
  });

  it("rejects when the quote has no client_email on file", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toMatch(/client_email[\s\S]*?No email saved/);
  });

  it("rejects when the client has opted out", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toMatch(/client_opted_out[\s\S]*?opted out/);
  });

  it("rejects when the quote is not pending (won/closed)", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toMatch(/outcome[\s\S]*?pending/);
  });

  it("claims the reminder atomically via claim_reminder_manual RPC", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toContain("claim_reminder_manual");
  });

  it("loads message_text from DB (never trusts client-supplied content)", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toContain("reminder.message_text");
  });

  it("writes an outbound_messages row with channel='email'", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toMatch(
      /from\("outbound_messages"\)\.insert\(\{[\s\S]*?channel:\s*"email"/,
    );
  });

  it("releases the claim on send failure so retry is possible", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toMatch(
      /!emailResult\.ok[\s\S]*?claimed_by:\s*null[\s\S]*?claimed_at:\s*null/,
    );
  });

  it("updates reminders.sent=true + sent_at on success", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toMatch(/sent:\s*true[\s\S]*?sent_at/);
  });

  it("emits a message_sent recovery_event with channel='email'", () => {
    const slice = actions.slice(
      actions.indexOf("sendReminderManualEmailAction"),
    );
    expect(slice).toContain("emitRecoveryEvent");
    expect(slice).toContain('eventType: "message_sent"');
    expect(slice).toContain('channel: "email"');
  });
});

// ---------------------------------------------------------------------------
// Quote creation: email is the primary channel for new reminders
// ---------------------------------------------------------------------------

describe("Quote channel selection", () => {
  it("createQuoteAction prefers email when client_email is present", () => {
    expect(actions).toMatch(
      /const channel:\s*"sms"\s*\|\s*"email"\s*=\s*input\.client_email\s*\?\s*"email"\s*:\s*"sms"/,
    );
  });
});

// ---------------------------------------------------------------------------
// Cron route: email is primary, SMS gated behind SMS_ENABLED
// ---------------------------------------------------------------------------

describe("/api/cron/send: email-primary delivery", () => {
  it("imports the email helper from the messaging library", () => {
    expect(sendRoute).toContain('from "@/lib/messaging/email-provider"');
    expect(sendRoute).toContain("sendRecoveryEmail");
  });

  it("routes the email branch BEFORE the sms branch", () => {
    const emailIdx = sendRoute.indexOf('r.message_type === "email"');
    const smsIdx = sendRoute.indexOf('r.message_type !== "sms"');
    expect(emailIdx).toBeGreaterThan(0);
    expect(smsIdx).toBeGreaterThan(emailIdx);
  });

  it("calls sendRecoveryEmail with recipient + body sourced from the claimed reminder row", () => {
    // recipient is r.recipient_email (joined by claim_due_reminders), body is r.message_text.
    expect(sendRoute).toMatch(
      /sendRecoveryEmail\(\{[\s\S]*?to,[\s\S]*?body:\s*r\.message_text/,
    );
  });

  it("marks email reminder sent only when emailResult.ok", () => {
    expect(sendRoute).toMatch(
      /emailResult\.ok[\s\S]{0,800}from\("reminders"\)\s*\.update\(\{ sent: true,/,
    );
  });

  it("does NOT mark copy-mode reminders sent (no message_type='email' rendering = the cron skips)", () => {
    // A copy-mode reminder has message_type 'sms' but SMS is off; it must
    // hit the sms branch's `!SMS_ENABLED` check and release the claim,
    // never reaching reminders.update sent=true.
    expect(sendRoute).toMatch(/!SMS_ENABLED[\s\S]*?releaseClaim/);
  });
});

describe("/api/cron/send: SMS gated behind SMS_ENABLED (default off)", () => {
  it("defines SMS_ENABLED from process.env", () => {
    expect(sendRoute).toMatch(
      /const SMS_ENABLED\s*=\s*process\.env\.SMS_ENABLED\s*===\s*"true"/,
    );
  });

  it("only resolves the messaging service inside the SMS_ENABLED guard", () => {
    expect(sendRoute).toMatch(
      /if \(SMS_ENABLED\)[\s\S]{0,400}smsProvider = getMessagingService\(\)/,
    );
  });

  it("skips sms rows when SMS_ENABLED is off", () => {
    expect(sendRoute).toMatch(
      /r\.message_type !== "sms"\s*\|\|\s*!SMS_ENABLED/,
    );
  });

  it("records sms_enabled state in cron_runs.metadata for forensics", () => {
    expect(sendRoute).toContain("sms_enabled: SMS_ENABLED");
  });
});

// ---------------------------------------------------------------------------
// SendEarlyButton: channel-aware dispatch
// ---------------------------------------------------------------------------

describe("SendEarlyButton: channel-aware dispatch", () => {
  it("calls sendReminderManualEmailAction for messageType='email'", () => {
    expect(sendBtn).toContain("sendReminderManualEmailAction");
    expect(sendBtn).toMatch(/messageType === "email"/);
  });

  it("still calls sendReminderManualAction (SMS path) for messageType='sms'", () => {
    expect(sendBtn).toContain("sendReminderManualAction");
  });
});

// ---------------------------------------------------------------------------
// Quote detail page: channel-aware intro + Send early hiding
// ---------------------------------------------------------------------------

describe("/quotes/[id]: channel-aware intro copy", () => {
  it("uses the automated email intro when the quote has an email", () => {
    expect(detailPage).toContain(
      "The rest of the sequence stays behind this message and sends by email on schedule",
    );
  });

  it("uses the copy-mode intro when the quote has no email", () => {
    expect(detailPage).toContain(
      "The rest of the sequence stays here, ready to copy when each touch comes due",
    );
  });

  it("passes hasEmail down to RecoveryPlanSection + ReminderCard", () => {
    expect(detailPage).toContain("hasEmail={Boolean(quote.client_email)}");
    expect(detailPage).toMatch(/hasEmail[\s\S]*?ReminderCard/);
  });

  it("hides the send button in copy-only mode (no recipient on the channel)", () => {
    // The render gate folds !hasRecipientForChannel into sendEarlyDisabled,
    // and showSendToday requires !sendEarlyDisabled — so a quote with neither
    // email nor phone renders Copy as the only action.
    expect(detailPage).toContain("showSendToday");
    expect(detailPage).toMatch(
      /hasRecipientForChannel\s*=\s*messageType === "email" \? hasEmail : hasPhone/,
    );
    expect(detailPage).toMatch(/!sendEarlyDisabled &&/);
  });

  it("passes messageType to SendEarlyButton so it picks the right action", () => {
    expect(detailPage).toContain("messageType={messageType}");
  });
});

// ---------------------------------------------------------------------------
// .env.example documents the new vars
// ---------------------------------------------------------------------------

describe(".env.example documents Resend + SMS_ENABLED", () => {
  it("documents RESEND_API_KEY", () => {
    expect(envExample).toMatch(/^RESEND_API_KEY=/m);
  });

  it("documents SMS_ENABLED defaulting to false", () => {
    expect(envExample).toMatch(/^SMS_ENABLED=false/m);
  });
});
