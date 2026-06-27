import {
  getExpectedRecoveryValue,
  getRecoveryWindow,
  getRecoveryWindowLabel,
} from "./recovery-logic";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export type SundayResetCandidate = {
  id: string;
  clientLabel: string;
  amount: number;
  daysQuiet: number;
  outcome: string;
  paused: boolean;
  lastContactAt: string | null;
};

export type SundayResetPick = SundayResetCandidate & {
  recoveryWindow: ReturnType<typeof getRecoveryWindow>;
  recoveryWindowLabel: string;
  expectedRecoveryValue: number;
};

export function pickSundayResetQuote(
  candidates: SundayResetCandidate[],
  nowMs = Date.now(),
): SundayResetPick | null {
  const eligible = candidates
    .filter((quote) => quote.outcome === "pending" && !quote.paused)
    .filter((quote) => {
      if (!quote.lastContactAt) return true;
      const contactedAt = Date.parse(quote.lastContactAt);
      return Number.isNaN(contactedAt) || nowMs - contactedAt >= FIVE_DAYS_MS;
    })
    .map((quote) => {
      const recoveryWindow = getRecoveryWindow(quote.daysQuiet);
      const expectedRecoveryValue = getExpectedRecoveryValue(
        quote.amount,
        quote.daysQuiet,
      );
      const activeWindowBoost =
        recoveryWindow === "warm" || recoveryWindow === "cooling" ? 1.15 : 1;
      return {
        ...quote,
        recoveryWindow,
        recoveryWindowLabel: getRecoveryWindowLabel(recoveryWindow),
        expectedRecoveryValue: expectedRecoveryValue * activeWindowBoost,
      };
    })
    .sort(
      (a, b) =>
        b.expectedRecoveryValue - a.expectedRecoveryValue ||
        b.amount - a.amount ||
        a.daysQuiet - b.daysQuiet,
    );

  return eligible[0] ?? null;
}

export function sundayResetEmail(input: {
  quote: SundayResetPick;
  recoveryPlanUrl: string;
}): { subject: string; body: string } {
  return {
    subject: "Sunday Night Reset: one quote to work this week",
    body: [
      `📌 This week's recovery move: ${input.quote.clientLabel}, $${Math.round(input.quote.amount).toLocaleString("en-US")}, ${input.quote.recoveryWindowLabel}.`,
      "",
      `Text this today: ${input.recoveryPlanUrl}`,
      "",
      "You send every text. Quote Reclaim just hands you the next move.",
      "Nothing is sent to the homeowner from this reminder.",
    ].join("\n"),
  };
}
