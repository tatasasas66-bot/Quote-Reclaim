import type { ReplyIntent } from "./classify-reply";
import { titleCaseName } from "@/lib/utils/title-case";
import { getProjectNoun } from "@/lib/recovery/recovery-logic";

export type SuggestTone = "success" | "warning" | "neutral" | "danger" | "brand";

export type SuggestedResponse = {
  intent: ReplyIntent;
  /** Reads as "{Name} replied — {label}". */
  label: string;
  /** Short chip text. */
  badgeLabel: string;
  /** Maps to a Badge variant for color-coding. */
  tone: SuggestTone;
  /** Ready-to-send reply for the contractor to copy. Under 300 chars, no exclamation. */
  message: string;
  /** "Why this works" — the research-backed tactic. */
  tactic: string;
};

export type SuggestResponseInput = {
  intent: ReplyIntent;
  trade: string;
  projectType?: string | null;
  estimateAmount?: number | null;
  clientName?: string | null;
};

function firstNameOf(clientName: string | null | undefined): string {
  const titled = titleCaseName((clientName ?? "").trim());
  return titled.split(/\s+/)[0] ?? "";
}

// Keep acronyms (HVAC) intact; lowercase normal trades for natural mid-sentence
// use ("the roofing cost", not "the Roofing cost").
function tradeLabel(trade: string): string {
  const t = trade.trim();
  if (!t) return "the";
  return t === t.toUpperCase() ? t : t.toLowerCase();
}

const META: Record<
  ReplyIntent,
  { label: string; badgeLabel: string; tone: SuggestTone; tactic: string }
> = {
  positive: {
    label: "ready to move",
    badgeLabel: "Interested",
    tone: "success",
    tactic:
      "Momentum close: they're warm, so skip the small talk and go straight to scheduling with two easy options. Hesitation is where warm leads cool off.",
  },
  price_objection: {
    label: "a price concern",
    badgeLabel: "Price concern",
    tone: "warning",
    tactic:
      "Chris Voss tactical empathy: name the hesitation out loud, then re-anchor on value and options instead of dropping your price. Discounting first teaches clients to keep pushing.",
  },
  needs_time: {
    label: "needs more time",
    badgeLabel: "Needs time",
    tone: "neutral",
    tactic:
      "Low-pressure takeaway: giving them room removes the fight, while offering to hold the slot keeps you top of mind without chasing.",
  },
  not_interested: {
    label: "not interested",
    badgeLabel: "Not interested",
    tone: "danger",
    tactic:
      "Graceful close: leaving on good terms protects referrals and keeps the door open if their plans change later.",
  },
  question: {
    label: "a question",
    badgeLabel: "Question",
    tone: "brand",
    tactic:
      "Answer the exact question directly — specifics build trust faster than a pitch. Putting it in writing gives them something concrete to act on.",
  },
};

function buildMessage(input: SuggestResponseInput): string {
  const name = firstNameOf(input.clientName);
  const nameComma = name ? `, ${name}` : "";
  const tl = input.projectType
    ? getProjectNoun(input.trade, input.projectType)
    : tradeLabel(input.trade);

  switch (input.intent) {
    case "positive":
      return `Glad to hear it${nameComma}. I can get you on the schedule — does early next week or later in the week work better? I'll lock it in as soon as you pick.`;
    case "price_objection":
      return `It sounds like the number gave you pause — fair enough. Want me to walk through what's driving the ${tl} cost, or look at phasing the work so it lands easier? No games on price, just the right options.`;
    case "needs_time":
      return `Take the time you need${nameComma}. No pressure from me. Want me to hold your slot a little longer, or just check back next week once you've had a chance to weigh it?`;
    case "not_interested":
      return `Understood${nameComma} — I'll close it out on my end, no hard feelings. If anything changes down the road, you've got my number and the ${tl} quote still stands.`;
    case "question":
      return `Good question. Here's the straight answer: ___ . (Fill in the specifics for the ${tl} scope.) Want me to put that in writing so you've got it on hand?`;
  }
}

/**
 * Map a classified reply intent to a ready-to-send contractor response plus
 * the tactic behind it. Pure and deterministic — the recipient and the reply
 * text live in the DB; this only shapes the contractor's suggested reply.
 */
export function suggestResponse(input: SuggestResponseInput): SuggestedResponse {
  const meta = META[input.intent];
  return {
    intent: input.intent,
    label: meta.label,
    badgeLabel: meta.badgeLabel,
    tone: meta.tone,
    message: buildMessage(input),
    tactic: meta.tactic,
  };
}
