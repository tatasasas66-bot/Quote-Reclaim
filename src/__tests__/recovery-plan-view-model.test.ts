import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fallbackMessages } from "@/lib/ai/fallback-messages";
import type { QuoteRow, ReminderRow } from "@/lib/quotes/repo";
import {
  buildRecoveryPlanViewModel,
  type RecoveryPlanViewModel,
} from "@/lib/recovery/recovery-plan-view-model";

const NOW = Date.UTC(2026, 5, 18, 15, 0, 0);
const DAY = 86_400_000;

function quote(daysQuiet: number): QuoteRow {
  return {
    id: `quote-${daysQuiet}`,
    user_id: "user-1",
    trade: "Roofing",
    project_type: "Roof replacement",
    city: "Austin",
    state: "TX",
    estimate_amount: 12_500,
    job_description: "Replace the shingle roof",
    days_silent: daysQuiet,
    quote_sent_at: new Date(NOW - daysQuiet * DAY).toISOString(),
    client_name: "Jordan Lee",
    client_email: "jordan@example.com",
    client_phone: "+15125550110",
    client_opted_out: false,
    outcome: "pending",
    won_at: null,
    closed_at: null,
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
  };
}

function reminders(): ReminderRow[] {
  const plan = fallbackMessages({
    firstName: "Jordan",
    trade: "Roofing",
    projectType: "Roof replacement",
    estimateAmount: 12_500,
  });
  return ([1, 5, 10, 14, 21, 60] as const).map((offset, index) => ({
    id: `reminder-${index + 1}`,
    user_id: "user-1",
    quote_id: "quote",
    followup_number: plan[index]!.followup_number,
    message_type: "email",
    message_text: plan[index]!.message,
    framework_used: plan[index]!.framework,
    cta_type: plan[index]!.cta_type,
    send_at: new Date(NOW + offset * DAY).toISOString(),
    sent: false,
    sent_at: null,
    paused_at: null,
    created_at: new Date(NOW).toISOString(),
  }));
}

function build(daysQuiet: number): RecoveryPlanViewModel {
  return buildRecoveryPlanViewModel({
    quote: quote(daysQuiet),
    reminders: reminders(),
    now: NOW,
  });
}

function expectTopMatchesFirstCard(viewModel: RecoveryPlanViewModel) {
  const first = viewModel.sequenceCards[0];
  expect(first).toBeDefined();
  expect(first?.statusLabel).toBe("Current move");
  expect(first?.family).toBe(viewModel.currentMove);
  expect(first?.scheduledAt).toBe(viewModel.currentScheduledAt);
  expect(first?.scheduledLabel).toBe(viewModel.currentScheduledLabel);
  expect(first?.message).toBe(viewModel.currentMessage);
  expect(first?.whyThisWorks).toBe(viewModel.currentWhyThisWorks);
  expect(first?.copyMessage).toBe(viewModel.copyMessage);
  expect(first?.smsMessage).toBe(viewModel.smsMessage);
  expect(first?.whatsappMessage).toBe(viewModel.whatsappMessage);
}

describe("buildRecoveryPlanViewModel", () => {
  it("Warm, 2 days quiet: the stored Day 1 move leads the six-step plan", () => {
    const viewModel = build(2);

    expect(viewModel.recoveryWindow).toBe("warm");
    expect(viewModel.currentMove).toBe("Decision Friction");
    expect(viewModel.sequenceHeading).toBe("6-message recovery plan");
    expect(viewModel.sequenceCards.map((card) => card.family)).toEqual([
      "Decision Friction",
      "Scope Rescue",
      "Soft Decision Check",
      "Open, Revise, or Close",
      "Clean Closeout",
      "Reopen Later",
    ]);
    expect(viewModel.quietSignal?.signal).toBe("Early");
    expect(viewModel.quietSignal?.stallReason).toBe("Normal early silence");
    expectTopMatchesFirstCard(viewModel);
  });

  it("Cooling age does not replace the queued sequence step", () => {
    const viewModel = build(14);
    const visibleText = [
      viewModel.currentMove,
      viewModel.currentMessage,
      viewModel.currentWhyThisWorks,
      viewModel.sequenceHeading,
      ...viewModel.sequenceCards.flatMap((card) => [
        card.family,
        card.statusLabel,
        card.helperLabel ?? "",
        card.message,
        card.whyThisWorks,
      ]),
      viewModel.quietSignal?.stallReason ?? "",
      viewModel.quietSignal?.signal ?? "",
      viewModel.quietSignal?.recommendedMove ?? "",
    ].join(" ");

    expect(viewModel.recoveryWindow).toBe("cooling");
    expect(viewModel.currentMove).toBe("Decision Friction");
    expect(viewModel.sequenceHeading).toBe("6-message recovery plan");
    expect(viewModel.sequenceCards.map((card) => card.family)).toEqual([
      "Decision Friction",
      "Scope Rescue",
      "Soft Decision Check",
      "Open, Revise, or Close",
      "Clean Closeout",
      "Reopen Later",
    ]);
    expect(visibleText).not.toContain("Estimate Check");
    expectTopMatchesFirstCard(viewModel);
  });

  it("Cold age keeps the actual queued six-step plan intact", () => {
    const viewModel = build(30);

    expect(viewModel.recoveryWindow).toBe("cold");
    expect(viewModel.currentMove).toBe("Decision Friction");
    expect(viewModel.sequenceHeading).toBe("6-message recovery plan");
    expect(viewModel.sequenceCards.map((card) => card.family)).toEqual([
      "Decision Friction",
      "Scope Rescue",
      "Soft Decision Check",
      "Open, Revise, or Close",
      "Clean Closeout",
      "Reopen Later",
    ]);
    expect(JSON.stringify(viewModel.sequenceCards)).not.toContain(
      "Estimate Check",
    );
    expectTopMatchesFirstCard(viewModel);
  });

  it("Closeout age still leaves the one-time Day 60 row visible", () => {
    const viewModel = build(52);

    expect(viewModel.recoveryWindow).toBe("closeout");
    expect(viewModel.currentMove).toBe("Decision Friction");
    expect(viewModel.sequenceHeading).toBe("6-message recovery plan");
    expect(viewModel.sequenceCards).toHaveLength(6);
    expect(
      viewModel.sequenceCards.filter((card) => card.family === "Reopen Later"),
    ).toHaveLength(1);
    expect(JSON.stringify(viewModel.sequenceCards)).not.toContain(
      "Estimate Check",
    );
    expectTopMatchesFirstCard(viewModel);
  });

  it("uses the current message for Copy, SMS, and WhatsApp", () => {
    for (const daysQuiet of [2, 14, 30, 52]) {
      const viewModel = build(daysQuiet);
      expect(viewModel.copyMessage).toBe(viewModel.currentMessage);
      expect(viewModel.smsMessage).toBe(viewModel.currentMessage);
      expect(viewModel.whatsappMessage).toBe(viewModel.currentMessage);
    }
  });

  it("ships all twelve reply paths and window-aware One-Tap choices", () => {
    expect(build(2).replyPlaybook).toHaveLength(12);
    expect(build(2).oneTapOptions).toHaveLength(4);
    expect(build(14).oneTapOptions).toContain("Still comparing");
    expect(build(14).oneTapOptions).toHaveLength(7);
    expect(build(30).oneTapOptions).toHaveLength(4);
    expect(build(52).oneTapOptions).toHaveLength(4);
  });

  it("renders the persisted canonical reminder copy", () => {
    for (const daysQuiet of [2, 14, 30, 52]) {
      const viewModel = build(daysQuiet);
      const messages = [
        viewModel.currentMessage,
        ...viewModel.sequenceCards.map((card) => card.message),
      ].join(" ");
      expect(messages).toContain("roof replacement");
      expect(messages).toContain("active list");
      expect(messages).toContain("60 seconds");
    }
  });

  it("uses only Current move and Queued after current move as visible sequence states", () => {
    const viewModel = build(14);
    expect(viewModel.sequenceCards[0]?.statusLabel).toBe("Current move");
    expect(
      viewModel.sequenceCards.slice(1).every(
        (card) =>
          card.statusLabel === "Queued after current move" &&
          card.helperLabel === "Queued after current move",
      ),
    ).toBe(true);
  });

  it("removes banned contradiction copy from Cooling, Cold, and Closeout views", () => {
    const banned = [
      "Follow-up 1 queued",
      "Estimate Check queued",
      "Queued after Estimate Check",
      "Not enough data",
      "The estimate is still fresh",
      "Any update",
      "Just checking in",
    ];

    for (const daysQuiet of [14, 30, 52]) {
      const serialized = JSON.stringify(build(daysQuiet)).toLowerCase();
      for (const phrase of banned) {
        expect(serialized).not.toContain(phrase.toLowerCase());
      }
    }
  });

  it("keeps raw persisted reminder fields out of the React presentation", () => {
    const page = readFileSync(
      fileURLToPath(
        new URL("../app/(app)/quotes/[id]/page.tsx", import.meta.url),
      ),
      "utf8",
    );
    expect(page).not.toContain(".message_text");
    expect(page).not.toContain(".followup_number");
    expect(page).toContain("viewModel.sequenceCards");
    expect(page).toContain("viewModel.currentMessage");
    expect(page).toContain("viewModel.quietSignal");
    expect(page).toContain("trade={quote.trade}");
    expect(page).toContain("viewModel.replyPlaybook");
  });
});
