// @vitest-environment happy-dom

import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ManualMessageActions } from "@/components/quotes/ManualMessageActions";
import { ReplyPlaybook } from "@/components/quotes/ReplyPlaybook";
import type { QuoteRow, ReminderRow } from "@/lib/quotes/repo";
import { TRADES } from "@/lib/utils/normalize";
import {
  buildScopeComparisonMessage,
  getReplyPlaybook,
  getScopeComparisonItems,
} from "@/lib/recovery/recovery-logic";
import { buildRecoveryPlanViewModel } from "@/lib/recovery/recovery-plan-view-model";
import {
  pickSundayResetQuote,
  sundayResetEmail,
} from "@/lib/recovery/sunday-reset";
import { buildRecoveryReportData } from "@/lib/recovery/recovery-report";

afterEach(cleanup);

function source(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

describe("trade-native foundation", () => {
  it("keeps existing trades and adds every requested trade", () => {
    for (const trade of [
      "Concrete",
      "Fencing",
      "Flooring",
      "Windows & Doors",
      "Siding",
      "Drywall",
      "Tree Service",
    ]) {
      expect(TRADES).toContain(trade);
    }
    expect(TRADES).toContain("Roofing");
    expect(TRADES).toContain("HVAC");
  });

  it("builds concrete and fallback scope comparisons without attacking competitors", () => {
    expect(getScopeComparisonItems("Concrete")).toEqual([
      "Demo + haul-off",
      "Base prep",
      "Rebar",
      "Pour",
      "Finish",
      "Cleanup",
    ]);
    expect(getScopeComparisonItems("Plumbing")).toEqual([
      "Scope",
      "Materials",
      "Labor",
      "Cleanup",
      "Timeline",
    ]);
    const message = buildScopeComparisonMessage("Concrete");
    expect(message).toContain("Here's what's included in my estimate");
    expect(message).toContain("are they including Finish?");
    expect(message.toLowerCase()).not.toContain("cheap");
  });
});

describe("Margin Protector", () => {
  it("opens from Still comparing and keeps the template editable and manual", () => {
    render(
      <ReplyPlaybook
        paths={getReplyPlaybook("Concrete")}
        trade="Concrete"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Send scope comparison/i }),
    );

    expect(screen.getByTestId("margin-protector")).toBeTruthy();
    expect(screen.getByText("Demo + haul-off")).toBeTruthy();
    const textarea = screen.getByLabelText(/Edit before sending/i);
    fireEvent.change(textarea, { target: { value: "Edited scope comparison" } });
    expect((textarea as HTMLTextAreaElement).value).toBe(
      "Edited scope comparison",
    );
    expect(screen.getByText(/Nothing sends until you tap send/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open SMS/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open WhatsApp/i })).toBeTruthy();
  });
});

describe("manual channel actions", () => {
  it("encodes the SMS recipient and body without auto-sending", () => {
    render(
      <ManualMessageActions
        message="Price & scope?"
        phone="(555) 123-4567"
        source="test_surface"
      />,
    );
    const sms = screen.getByRole("link", { name: /Open SMS/i });
    const whatsapp = screen.getByRole("link", { name: /Open WhatsApp/i });
    expect(sms.getAttribute("href")).toBe(
      "sms:+15551234567?body=Price%20%26%20scope%3F",
    );
    expect(whatsapp.getAttribute("href")).toBe(
      "https://wa.me/?text=Price%20%26%20scope%3F",
    );
    expect(sms.tagName).toBe("A");
    expect(sms.getAttribute("href")).not.toMatch(/(?:to|phone|recipient)=/i);
  });

  it("keeps the recipient picker fallback when no phone is available", () => {
    render(
      <ManualMessageActions message="Price & scope?" source="test_surface" />,
    );
    expect(
      screen.getByRole("link", { name: /Open SMS/i }).getAttribute("href"),
    ).toBe("sms:?body=Price%20%26%20scope%3F");
  });

  it("makes SMS primary, email the fallback, and copy the no-contact path", () => {
    const phone = buildViewModel({ phone: "5551234567", email: "a@b.com" });
    const email = buildViewModel({ phone: null, email: "a@b.com" });
    const copy = buildViewModel({ phone: null, email: null });

    expect(phone.sequenceScheduleLabel).toContain("· SMS");
    expect(phone.currentInstruction).toContain("Open SMS");
    expect(email.sequenceScheduleLabel).toContain("· EMAIL");
    expect(copy.sequenceScheduleLabel).toContain("· Copy");
    expect(copy.currentInstruction).toContain(
      "Add a phone or email to send faster",
    );
  });
});

describe("Sunday Night Reset", () => {
  it("prefers an active-window quote unless a cold amount is materially larger", () => {
    const pick = pickSundayResetQuote(
      [
        candidate("warm", 4_000, 5),
        candidate("cold", 10_000, 30),
      ],
      Date.parse("2026-06-28T19:00:00.000Z"),
    );
    expect(pick?.id).toBe("warm");
  });

  it("skips paused and recently contacted quotes and sends nothing when empty", () => {
    const now = Date.parse("2026-06-28T19:00:00.000Z");
    expect(
      pickSundayResetQuote(
        [
          { ...candidate("paused", 9_000, 10), paused: true },
          {
            ...candidate("recent", 12_000, 12),
            lastContactAt: "2026-06-26T19:00:00.000Z",
          },
        ],
        now,
      ),
    ).toBeNull();
  });

  it("builds a contractor-only manual reminder", () => {
    const quote = pickSundayResetQuote([candidate("quote-1", 7_500, 12)])!;
    const email = sundayResetEmail({
      quote,
      recoveryPlanUrl:
        "https://www.quotereclaim.com/quotes/quote-1?source=sunday-reset",
    });
    expect(email.body).toContain("You send every text");
    expect(email.body).toContain("One tap. The message is ready.");
  });
});

describe("Recovery Report attribution", () => {
  it("counts only won quotes with a prior sent follow-up as recovered revenue", () => {
    const report = buildRecoveryReportData({
      quotes: [
        reportQuote("recovered", "won", 5_000, "2026-06-20T00:00:00.000Z"),
        reportQuote("unattributed", "won", 9_000, "2026-06-21T00:00:00.000Z"),
        reportQuote("risk", "pending", 4_000, null, 14),
      ],
      reminders: [
        {
          quote_id: "recovered",
          sent: true,
          sent_at: "2026-06-10T00:00:00.000Z",
          paused_at: null,
        },
      ],
      repliesReceivedThisMonth: 2,
      monthStartMs: Date.parse("2026-06-01T00:00:00.000Z"),
      nextMonthStartMs: Date.parse("2026-07-01T00:00:00.000Z"),
      nowMs: Date.parse("2026-06-27T00:00:00.000Z"),
    });

    expect(report.followupsSentThisMonth).toBe(1);
    expect(report.repliesReceivedThisMonth).toBe(2);
    expect(report.jobsBookedThisMonth).toBe(2);
    expect(report.estimatedRecoveredThisMonth).toBe(5_000);
    expect(report.allTimeRecoveredRevenue).toBe(5_000);
    expect(report.quotesStillAtRisk).toBe(1);
    expect(report.messagePerformanceReady).toBe(false);
  });

  it("renders honest empty performance copy and hides the multiple at zero", () => {
    const reportPage = source("../app/(app)/recovery-report/page.tsx");
    expect(reportPage).toContain(
      "Not enough data yet — keep working your quotes. This fills in as you go.",
    );
    expect(reportPage).toContain("subscriptionMultiple != null");
    expect(reportPage).toContain("It is attribution help, not a guarantee");
  });
});

describe("cross-surface guardrails", () => {
  it("adds WhatsApp to audit and keeps the no-signup result flow", () => {
    const auditView = source("../app/audit/AuditResultView.tsx");
    const auditClient = source("../app/audit/AuditCalculatorClient.tsx");
    expect(auditView).toContain("Open in WhatsApp");
    expect(auditView).toContain("Nothing sends until you tap send");
    expect(auditClient).toContain("https://wa.me/?text=");
    expect(auditClient).not.toMatch(/recipient|client_phone/);
  });

  it("tracks safe message fields and never puts phone numbers in analytics", () => {
    const quotePage = source("../app/(app)/quotes/[id]/page.tsx");
    expect(quotePage).toContain("quote_id:");
    expect(quotePage).toContain("message_type:");
    expect(quotePage).toContain("project_noun:");
    expect(quotePage).toContain("recovery_window:");
    expect(quotePage).not.toContain("phone: viewModel.quote.phone");
  });

  it("adds the sharp homeowner-silence positioning without absolute claims", () => {
    const homepage = source("../app/page.tsx");
    expect(homepage).toContain("Sometimes quiet isn't a hard no");
    expect(homepage).toContain("Why do homeowners go quiet after a quote?");
    expect(homepage).not.toContain("homeowners always ghost");
  });
});

function buildViewModel(input: {
  phone: string | null;
  email: string | null;
}) {
  const quote: QuoteRow = {
    id: "quote-1",
    user_id: "user-1",
    trade: "Concrete",
    city: "",
    state: "",
    estimate_amount: 5_000,
    job_description: null,
    days_silent: 12,
    quote_sent_at: "2026-06-15T00:00:00.000Z",
    client_name: "Taylor",
    client_email: input.email,
    client_phone: input.phone,
    client_opted_out: false,
    outcome: "pending",
    won_at: null,
    closed_at: null,
    created_at: "2026-06-15T00:00:00.000Z",
    updated_at: "2026-06-15T00:00:00.000Z",
  };
  const reminder: ReminderRow = {
    id: "reminder-1",
    user_id: "user-1",
    quote_id: "quote-1",
    followup_number: 1,
    message_type: input.email ? "email" : "sms",
    message_text: "Stored copy",
    framework_used: "Decision Friction",
    cta_type: "question",
    send_at: "2026-06-27T17:00:00.000Z",
    sent: false,
    sent_at: null,
    paused_at: null,
    created_at: "2026-06-15T00:00:00.000Z",
  };
  return buildRecoveryPlanViewModel({
    quote,
    reminders: [reminder],
    now: Date.parse("2026-06-27T12:00:00.000Z"),
  });
}

function candidate(id: string, amount: number, daysQuiet: number) {
  return {
    id,
    clientLabel: id,
    amount,
    daysQuiet,
    outcome: "pending",
    paused: false,
    lastContactAt: null,
  };
}

function reportQuote(
  id: string,
  outcome: string,
  amount: number,
  wonAt: string | null,
  daysSilent = 10,
) {
  return {
    id,
    client_name: id,
    trade: "Concrete",
    estimate_amount: amount,
    days_silent: daysSilent,
    quote_sent_at: "2026-06-01T00:00:00.000Z",
    created_at: "2026-06-01T00:00:00.000Z",
    outcome,
    won_at: wonAt,
  };
}
