import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const actions = readSource("../lib/quotes/actions.ts");
const messagingService = readSource("../lib/messaging/service.ts");
const smsProv = readSource("../lib/messaging/sms-provider.ts");
const simProv = readSource("../lib/messaging/simulator-provider.ts");
const types = readSource("../lib/messaging/types.ts");
const sendBtn = readSource("../components/quotes/SendEarlyButton.tsx");
const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const barrel = readSource("../components/quotes/index.ts");

// ---------------------------------------------------------------------------
// sendReminderManualAction
// ---------------------------------------------------------------------------

describe("sendReminderManualAction", () => {
  it("is exported from actions.ts", () => {
    expect(actions).toContain("export async function sendReminderManualAction");
  });

  it("re-authenticates user via getUser() before any mutation", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toContain("getUser()");
  });

  it("uses service client (service-role) for all DB operations", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toContain("createServiceSupabaseClient");
  });

  it("checks reminder.sent before claiming", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/reminder\.sent[\s\S]*?Already sent/);
  });

  it("checks reminder.paused_at before claiming", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/reminder\.paused_at[\s\S]*?paused/i);
  });

  it("calls claim_reminder_manual RPC atomically before sending", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toContain("claim_reminder_manual");
    expect(slice).toContain("p_reminder_id");
    expect(slice).toContain("p_user_id");
  });

  it("rejects when claim returns false (double-send guard)", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/!claimed[\s\S]*?already/i);
  });

  it("checks quote.client_phone exists before sending", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toContain("client_phone");
    expect(slice).toMatch(/No phone number/);
  });

  it("checks quote.client_opted_out", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toContain("client_opted_out");
    expect(slice).toMatch(/opted.out/i);
  });

  it("calls getMessagingService() to send", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toContain("getMessagingService");
  });

  it("inserts a row into outbound_messages", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/from\("outbound_messages"\)[\s\S]*?\.insert/);
  });

  it("records failure_reason in outbound_messages on failure", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toContain("failure_reason");
  });

  it("uses idempotency_key scoped to reminder + user", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/idempotency_key.*manual.*reminderId/);
  });

  it("updates reminders.sent=true and sent_at on success", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/update\(\s*\{[\s\S]*?sent:\s*true[\s\S]*?sent_at/);
  });

  it("revalidatePath for the quote detail page after success", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/revalidatePath\(`\/quotes\/\$\{quote\.id\}`\)/);
  });

  it("releases the claim on send failure so retry is possible", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    // After smsResult.ok === false, claimed_by/claimed_at must be cleared
    // before returning the error, otherwise the reminder is permanently stuck.
    expect(slice).toMatch(
      /!smsResult\.ok[\s\S]*?claimed_by:\s*null[\s\S]*?claimed_at:\s*null[\s\S]*?Send failed/,
    );
  });

  it("does not import Twilio or Resend directly", () => {
    expect(actions).not.toMatch(/from\s+["']twilio["']/);
    expect(actions).not.toMatch(/from\s+["']resend["']/);
  });
});

// ---------------------------------------------------------------------------
// Messaging service abstraction
// ---------------------------------------------------------------------------

describe("messaging service: types.ts", () => {
  it("exports SmsResult union type", () => {
    expect(types).toContain("SmsResult");
    expect(types).toContain("providerMessageId");
  });

  it("exports SmsProvider interface with send method", () => {
    expect(types).toContain("SmsProvider");
    expect(types).toContain("send(");
  });
});

describe("messaging service: service.ts", () => {
  it("returns TwilioSmsProvider when env vars are set", () => {
    expect(messagingService).toContain("TwilioSmsProvider");
    expect(messagingService).toContain("hasTwilioConfig");
  });

  it("throws in production when Twilio config is absent", () => {
    expect(messagingService).toMatch(/NODE_ENV.*production[\s\S]*?throw/);
    expect(messagingService).toContain("Fail closed");
  });

  it("falls back to SimulatorSmsProvider in non-production without keys", () => {
    expect(messagingService).toContain("SimulatorSmsProvider");
  });

  it("never imports Twilio SDK", () => {
    expect(messagingService).not.toMatch(/from\s+["']twilio["']/);
  });
});

describe("messaging service: sms-provider.ts", () => {
  it("uses fetch, not Twilio SDK", () => {
    expect(smsProv).toContain("fetch(url");
    expect(smsProv).not.toMatch(/from\s+["']twilio["']/);
  });

  it("authenticates via Basic auth header", () => {
    expect(smsProv).toContain("Basic");
    expect(smsProv).toContain("Authorization");
  });

  it("returns providerMessageId from Twilio SID on success", () => {
    expect(smsProv).toContain("providerMessageId");
    expect(smsProv).toContain("json.sid");
  });

  it("returns ok:false on HTTP error", () => {
    expect(smsProv).toMatch(/ok:\s*false/);
    expect(smsProv).toContain("response.ok");
  });
});

describe("messaging service: simulator-provider.ts", () => {
  it("generates a sim_ prefixed provider ID", () => {
    expect(simProv).toContain("sim_");
  });

  it("never imports Twilio or real HTTP client", () => {
    expect(simProv).not.toMatch(/from\s+["']twilio["']/);
    expect(simProv).not.toContain("fetch(");
  });

  it("returns ok:true", () => {
    expect(simProv).toMatch(/ok:\s*true/);
  });
});

// ---------------------------------------------------------------------------
// SendEarlyButton component
// ---------------------------------------------------------------------------

describe("SendEarlyButton component", () => {
  it("is a client component", () => {
    expect(sendBtn.startsWith('"use client"')).toBe(true);
  });

  it("calls sendReminderManualAction", () => {
    expect(sendBtn).toContain("sendReminderManualAction");
  });

  it("shows inline sent confirmation on success", () => {
    expect(sendBtn).toMatch(/state.*sent/);
    expect(sendBtn).toMatch(/Sent!/);
  });

  it("shows inline error message on failure", () => {
    expect(sendBtn).toMatch(/state.*error/);
    expect(sendBtn).toContain("role=\"alert\"");
    expect(sendBtn).toContain("text-danger");
  });

  it("shows loading state while sending", () => {
    expect(sendBtn).toContain("pending");
    expect(sendBtn).toContain("loading");
  });

  it("is re-exported from the quotes barrel", () => {
    expect(barrel).toContain("SendEarlyButton");
  });
});

// ---------------------------------------------------------------------------
// /quotes/[id] page: Send early button enabled conditionally
// ---------------------------------------------------------------------------

describe("/quotes/[id] page: Send early wiring", () => {
  it("no longer has sendEarlyDisabled = true (hardcoded off)", () => {
    expect(detailPage).not.toMatch(/sendEarlyDisabled\s*=\s*true/);
  });

  it("computes sendEarlyDisabled from r.sent, r.paused_at, recoveryStatus, hasPhone", () => {
    expect(detailPage).toContain("sendEarlyDisabled");
    expect(detailPage).toContain("r.sent");
    expect(detailPage).toContain("r.paused_at");
    expect(detailPage).toContain("hasPhone");
    expect(detailPage).toContain("recoveryStatus");
  });

  it("passes hasPhone from quote.client_phone down to ReminderCard", () => {
    expect(detailPage).toContain("hasPhone");
    expect(detailPage).toContain("quote.client_phone");
  });

  it("uses SendEarlyButton instead of a hardcoded disabled button", () => {
    expect(detailPage).toContain("SendEarlyButton");
    expect(detailPage).toContain("reminderId={r.id}");
    expect(detailPage).toContain("disabled={sendEarlyDisabled}");
  });

  it("does not render 'Send Now' anywhere", () => {
    expect(detailPage).not.toMatch(/Send Now/);
  });

  it("does not import stripe or billing libs", () => {
    expect(detailPage).not.toMatch(/stripe/i);
    expect(detailPage).not.toMatch(/lemon/i);
  });

  it("never uses the word 'Bid'", () => {
    expect(detailPage).not.toMatch(/\bBid\b/);
    expect(actions).not.toMatch(/\bBid\b/);
  });
});

// ---------------------------------------------------------------------------
// Phase 7 boundary: no auth bypass, no mass targeting
// ---------------------------------------------------------------------------

describe("Phase 7 security invariants", () => {
  it("sendReminderManualAction verifies user_id matches reminder user_id", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/\.eq\("user_id",\s*userId\)/);
  });

  it("sendReminderManualAction verifies quote.outcome === pending before sending", () => {
    const slice = actions.slice(actions.indexOf("sendReminderManualAction"));
    expect(slice).toMatch(/outcome.*pending/);
  });

  it("actions.ts imports getMessagingService from messaging/service", () => {
    expect(actions).toMatch(/from\s+["']@\/lib\/messaging\/service["']/);
  });
});
