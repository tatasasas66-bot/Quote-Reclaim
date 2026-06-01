/**
 * Quiet Signal — deterministic stall-reason engine.
 *
 * This module is INTENTIONALLY pure data → label. There is no AI call here;
 * no cohort model; no plan swap. The webhook collects engagement signals,
 * the quote page asks computeQuietSignal() for a verdict, and the UI renders
 * the fixed copy below.
 *
 * Architectural rules (cannot be relaxed without product approval):
 *  1. Zero tolerance for false positives. Each specific diagnosis requires
 *     a deterministic, overwhelming signal — not a model's guess.
 *  2. The 0.80 internal confidence gate decides whether a specific diagnosis
 *     is emitted at all. Anything below collapses to normal_silence.
 *  3. Opens are weak corroboration only (Apple Mail Privacy Protection
 *     auto-fires opens). Clicks are reliable. Opens alone can NEVER lift the
 *     verdict to "strong".
 *  4. The UI never renders the numeric confidence. The strength label
 *     ("Early" / "Medium" / "Strong") is the only thing surfaced.
 *  5. No behavioral labels beyond price_uncertainty — you cannot distinguish
 *     "comparison shopping" from "on vacation" using behavior alone.
 *
 * UI vocabulary (locked):
 *   "Likely stall reason" · "Signal strength" · "What we see" · "Best next move".
 * Forbidden vocabulary anywhere in this engine's output:
 *   "Silent because", "% confident", "decoder", "AI diagnosis",
 *   "loss aversion", "reactance", "psychological trigger".
 */

export type StallReason =
  | "price_uncertainty"
  | "decision_pending"
  | "open_question"
  | "lost_interest"
  | "normal_silence";

export type SignalStrength = "early" | "medium" | "strong";

export type ReplyIntentInput =
  | "positive"
  | "price_objection"
  | "needs_time"
  | "not_interested"
  | "question"
  | null;

export type ValueBand =
  | "under_1k"
  | "1k_5k"
  | "5k_15k"
  | "15k_50k"
  | "over_50k";

/** Inputs the rule engine consumes — all derived from existing DB columns. */
export type SilenceSignals = {
  outcome: "pending" | "won" | "closed";
  optedOut: boolean;

  trade: string;
  estimateAmount: number;
  valueBand: ValueBand;
  daysSilent: number;
  followupsSent: number;

  hasReply: boolean;
  replyIntent: ReplyIntentInput;

  // Engagement (from outbound_messages engagement counters, aggregated for
  // the quote). 0/0 means "no webhook data yet" and routes to the calm
  // fallback — that is the correct, safe behavior.
  openCount: number;
  clickCount: number;
};

export type QuietSignal = {
  reason: StallReason;
  /** Title-case label used in "Likely stall reason: <label>". */
  reasonLabel: string;
  strength: SignalStrength;
  /** Bulleted lines for "What we see". Already plain English, no jargon. */
  evidence: string[];
  /** One-line copy for "Best next move". */
  recommendedMove: string;
  /**
   * Day number (1-5) of the recommended follow-up to surface. The button on
   * the card scrolls to that follow-up — we do NOT auto-swap the sequence.
   * Null when the recommendation is to keep the default cadence.
   */
  recommendedFollowupNumber: 1 | 2 | 3 | 4 | 5 | null;
  /**
   * Internal-only. UI MUST NOT render this. Exposed so tests can assert the
   * 0.80 gate behavior precisely without prying into engine internals.
   */
  confidence: number;
};

// ---------------------------------------------------------------------------
// Reason label table (single source of truth — UI imports nothing else)
// ---------------------------------------------------------------------------

const REASON_LABELS: Record<StallReason, string> = {
  price_uncertainty: "Price uncertainty",
  decision_pending: "Still deciding",
  open_question: "Open question",
  lost_interest: "Lost interest",
  normal_silence: "Normal silence",
};

const STRONG_CONFIDENCE = 0.9;
const MEDIUM_CONFIDENCE_GATE = 0.8;

function strengthFromConfidence(confidence: number): SignalStrength {
  if (confidence >= STRONG_CONFIDENCE) return "strong";
  if (confidence >= MEDIUM_CONFIDENCE_GATE) return "medium";
  return "early";
}

// ---------------------------------------------------------------------------
// Evidence sentence builders — fully deterministic, no LLM
// ---------------------------------------------------------------------------

function daysSilentSentence(days: number): string {
  if (days <= 0) return "This estimate was sent today.";
  if (days === 1) return "This estimate has been quiet for 1 day.";
  return `This estimate has been quiet for ${days} days.`;
}

function engagementSentence(opens: number, clicks: number): string {
  if (clicks > 0) {
    return "The customer engaged with the email but has not replied.";
  }
  if (opens > 0) {
    return "The customer opened the email but has not replied.";
  }
  return "There is no engagement on the email yet.";
}

const MID_MARKET_PAUSE_SENTENCE =
  "The amount is in the range where homeowners often pause before deciding.";

// ---------------------------------------------------------------------------
// computeQuietSignal — the only entry point
// ---------------------------------------------------------------------------

/**
 * Returns null when the card should not render at all (won, opted out,
 * positive reply already in hand). All other states return a populated
 * QuietSignal — including the safe fallback.
 */
export function computeQuietSignal(s: SilenceSignals): QuietSignal | null {
  // R0 — Suppress: nothing to diagnose.
  if (s.outcome !== "pending") return null;
  if (s.optedOut) return null;
  if (s.replyIntent === "positive") return null;

  // R1-R4 — Reply-backed diagnoses. The customer told us; this is the
  // strongest possible signal.
  if (s.hasReply && s.replyIntent === "price_objection") {
    return {
      reason: "price_uncertainty",
      reasonLabel: REASON_LABELS.price_uncertainty,
      strength: "strong",
      evidence: [
        "The customer replied and mentioned price.",
        "That is a direct signal — they want options, not a discount.",
      ],
      recommendedMove:
        "Send the options check message. Give them a way to talk through total, timing, or scope without cutting corners.",
      recommendedFollowupNumber: 4,
      confidence: 0.95,
    };
  }

  if (s.hasReply && s.replyIntent === "needs_time") {
    return {
      reason: "decision_pending",
      reasonLabel: REASON_LABELS.decision_pending,
      strength: "strong",
      evidence: [
        "The customer replied and asked for more time.",
        "That usually means they are weighing it, not rejecting it.",
      ],
      recommendedMove:
        "Hold the estimate open and let the schedule check run at Day 3. No need to push.",
      recommendedFollowupNumber: 2,
      confidence: 0.95,
    };
  }

  if (s.hasReply && s.replyIntent === "question") {
    return {
      reason: "open_question",
      reasonLabel: REASON_LABELS.open_question,
      strength: "strong",
      evidence: [
        "The customer replied with a question.",
        "Answering it directly is the highest-leverage next step.",
      ],
      recommendedMove:
        "Open Reply Radar above and send the suggested response that answers their question.",
      recommendedFollowupNumber: null,
      confidence: 0.95,
    };
  }

  if (s.hasReply && s.replyIntent === "not_interested") {
    return {
      reason: "lost_interest",
      reasonLabel: REASON_LABELS.lost_interest,
      strength: "strong",
      evidence: [
        "The customer said they are not moving forward.",
        "Close the estimate respectfully and keep the door open.",
      ],
      recommendedMove:
        "Send the final closeout message. No hard feelings, leave it on good terms.",
      recommendedFollowupNumber: 5,
      confidence: 0.95,
    };
  }

  // R5 — Behavioral price_uncertainty (no reply). All hard prerequisites
  // must be true; missing any one falls through to fallback. This is the
  // only behavioral diagnosis the engine emits — every other "why" needs
  // an explicit signal from the customer.
  if (!s.hasReply) {
    const valueBandOk =
      s.valueBand === "5k_15k" ||
      s.valueBand === "15k_50k" ||
      s.valueBand === "1k_5k";
    const ageOk = s.daysSilent >= 3 && s.daysSilent <= 21;
    const clickedOk = s.clickCount >= 1; // RELIABLE engagement only
    const notOptedOut = !s.optedOut;

    if (valueBandOk && ageOk && clickedOk && notOptedOut) {
      let confidence = 0.82; // baseline once all prerequisites met
      if (s.openCount >= 5) confidence += 0.04; // opens corroborate
      if (s.clickCount >= 2) confidence += 0.06; // multi-click = real interest
      if (confidence > 0.92) confidence = 0.92;

      return {
        reason: "price_uncertainty",
        reasonLabel: REASON_LABELS.price_uncertainty,
        strength: strengthFromConfidence(confidence),
        evidence: [
          daysSilentSentence(s.daysSilent),
          engagementSentence(s.openCount, s.clickCount),
          MID_MARKET_PAUSE_SENTENCE,
        ],
        recommendedMove:
          "Send the options check message. Give them a way to talk through total, timing, or scope without cutting corners.",
        recommendedFollowupNumber: 4,
        confidence,
      };
    }
  }

  // R6 — Safe fallback. Everything else (sparse data, opens-only,
  // wrong-band, too fresh, too stale, mixed signals) lands here.
  return {
    reason: "normal_silence",
    reasonLabel: REASON_LABELS.normal_silence,
    strength: "early",
    evidence: [
      s.daysSilent <= 7
        ? "This estimate is still early in the follow-up window."
        : daysSilentSentence(s.daysSilent),
      "There is not enough engagement or reply history to call a specific stall reason.",
    ],
    recommendedMove: "Keep the default follow-up schedule.",
    recommendedFollowupNumber: null,
    confidence: 0,
  };
}

// ---------------------------------------------------------------------------
// Helper: derive valueBand the same way event-emitter.ts does, so callers
// computing signals don't have to duplicate the table.
// ---------------------------------------------------------------------------

export function valueBandFor(amount: number | null | undefined): ValueBand {
  const v = amount ?? 0;
  if (v < 1_000) return "under_1k";
  if (v < 5_000) return "1k_5k";
  if (v < 15_000) return "5k_15k";
  if (v < 50_000) return "15k_50k";
  return "over_50k";
}
