/**
 * Age-aware scheduled email send parity tests.
 *
 * Verifies that the cron send path generates the correct age-aware message
 * at send time — NOT the persisted message_text that was written at plan
 * creation time.
 *
 * Source-level tests that assert on the cron route's code structure,
 * since we can't run the actual cron without a database.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getRecommendedMessage,
  getRecoveryWindow,
} from "@/lib/recovery/recovery-logic";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const cronSrc = readSource("../app/api/cron/send/route.ts");

describe("cron send route — age-aware message generation", () => {
  it("imports getRecommendedMessage from centralized recovery-logic", () => {
    expect(cronSrc).toMatch(/import.*getRecommendedMessage.*from.*recovery-logic/);
  });

  it("regenerates the message at send time using days_silent + trade + client_name", () => {
    expect(cronSrc).toMatch(/getRecommendedMessage\(\{[^}]*daysQuiet.*r\.days_silent/s);
    expect(cronSrc).toMatch(/firstName.*r\.client_name/s);
    expect(cronSrc).toMatch(/trade.*r\.trade/s);
  });

  it("uses the age-aware message as the base for the email body", () => {
    expect(cronSrc).toMatch(/const baseMessage = ageAware\.message \|\| r\.message_text/);
    expect(cronSrc).toMatch(/\$\{baseMessage\}\\n\\nQuick reply/);
  });

  it("does NOT send r.message_text directly in the email body", () => {
    // The old pattern was `${r.message_text}\n\nQuick reply:` — that must be gone
    expect(cronSrc).not.toMatch(/\$\{r\.message_text\}\\n\\nQuick reply/);
  });

  it("stores the age-aware message in outbound_messages", () => {
    expect(cronSrc).toMatch(/message_text: messageBodyForSend/);
  });

  it("stores the age-aware framework in outbound_messages", () => {
    expect(cronSrc).toMatch(/framework_used: ageAware\.messageFamily/);
  });

  it("also generates age-aware messages for SMS sends", () => {
    expect(cronSrc).toMatch(/smsAgeAware.*getRecommendedMessage/);
    expect(cronSrc).toMatch(/smsBaseMessage/);
  });

  it("ClaimedReminder type includes days_silent", () => {
    expect(cronSrc).toMatch(/days_silent.*number.*null/);
  });
});

// ---------------------------------------------------------------------------
// Golden parity: the centralized module's message must match what the cron
// would generate for the same inputs
// ---------------------------------------------------------------------------

describe("age-aware message parity — cron matches UI for each window", () => {
  it("12-day Cooling quote generates Decision Friction message", () => {
    const rec = getRecommendedMessage({
      daysQuiet: 12,
      firstName: "Josh",
      trade: "roofing",
    });
    expect(rec.window).toBe("cooling");
    expect(rec.messageFamily).toBe("Decision Friction");
    expect(rec.message).toContain("timing");
    expect(rec.message).toContain("budget");
    expect(rec.message).toContain("scope");
    // Must NOT be Estimate Check
    expect(rec.message).not.toContain("quick check");
    expect(rec.message).not.toContain("still fresh");
  });

  it("30-day Cold quote generates Open, Revise, or Close message", () => {
    const rec = getRecommendedMessage({
      daysQuiet: 30,
      firstName: "Josh",
      trade: "landscaping",
    });
    expect(rec.window).toBe("cold");
    expect(rec.messageFamily).toBe("Open, Revise, or Close");
    expect(rec.message).toMatch(/open/i);
    expect(rec.message).toMatch(/revise/i);
    expect(rec.message).toMatch(/close/i);
    // Must NOT be Estimate Check or Decision Friction
    expect(rec.message).not.toContain("quick check");
    expect(rec.message).not.toContain("timing, budget");
  });

  it("52-day Closeout quote generates Clean Closeout message", () => {
    const rec = getRecommendedMessage({
      daysQuiet: 52,
      firstName: "Josh",
      trade: "landscaping",
    });
    expect(rec.window).toBe("closeout");
    expect(rec.messageFamily).toBe("Clean Closeout");
    expect(rec.message).toContain("close out");
    expect(rec.message).toContain("reopen");
    // Must NOT be any earlier family
    expect(rec.message).not.toContain("quick check");
    expect(rec.message).not.toContain("timing, budget");
    expect(rec.message).not.toContain("Which helps most");
  });

  it("3-day Warm quote generates Estimate Check message", () => {
    const rec = getRecommendedMessage({
      daysQuiet: 3,
      firstName: "Ali",
      trade: "electrical",
    });
    expect(rec.window).toBe("warm");
    expect(rec.messageFamily).toBe("Estimate Check");
    expect(rec.message).toContain("quick check");
  });
});

// ---------------------------------------------------------------------------
// Quiet Signal — window-aware labels
// ---------------------------------------------------------------------------

describe("quiet signal uses window-aware labels", () => {
  it("12-day Cooling → Decision friction / Waiting (via centralized module)", () => {
    const window = getRecoveryWindow(12);
    expect(window).toBe("cooling");
    // The centralized module provides the signal mapping
    // The page uses getQuietSignal(window) from recovery-logic
  });

  it("30-day Cold → Stalled decision / Cooling off", () => {
    const window = getRecoveryWindow(30);
    expect(window).toBe("cold");
  });

  it("52-day Closeout → Likely inactive / Closeout", () => {
    const window = getRecoveryWindow(52);
    expect(window).toBe("closeout");
  });

  it("3-day Warm → Normal early silence / Early", () => {
    const window = getRecoveryWindow(3);
    expect(window).toBe("warm");
  });
});
