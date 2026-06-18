import { recoveryScoreForDays } from "@/lib/quotes/recovery-score";

/**
 * Silent-quote audit — the honest, deterministic math behind the cold /audit
 * landing page. No probability model, no "recoverable revenue" claim. It sums
 * what the contractor already quoted, ranks which quiet quote is worth a touch
 * first (by dollar value, weighted toward the still-pickable age window), and
 * writes one ready-to-send follow-up. Pure + framework-free so it unit-tests
 * without a DOM, a server, or Supabase.
 */

const MAX_AMOUNT_USD = 10_000_000;
const MAX_DAYS = 365;

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type AuditQuoteInput = { amountRaw: string; daysSilentRaw?: string };

export type AuditQuote = {
  /** 1-based position as the contractor entered it (Quote #1, #2, #3). */
  index: number;
  amount: number;
  /** null when the contractor left days-silent blank for this row. */
  daysSilent: number | null;
};

/**
 * Recovery window — a contractor-native label keyed only to days since the
 * estimate was sent. No probability model, no reply-rate claims.
 *
 *   warm    0-14 days  "Follow up while the job is still fresh."
 *   cooling 15-30 days "Still worth chasing, but do it soon."
 *   cold    31+ days   "Needs a softer close-the-loop angle."
 *   unknown null       (contractor skipped the days field)
 */
export type RecoveryWindow = "warm" | "cooling" | "cold" | "unknown";

export function recoveryWindowForDays(
  daysSilent: number | null,
): RecoveryWindow {
  if (daysSilent == null) return "unknown";
  if (daysSilent <= 14) return "warm";
  if (daysSilent <= 30) return "cooling";
  return "cold";
}

export type RecoveryWindowDescriptor = {
  window: RecoveryWindow;
  label: string;
  explanation: string;
};

export function describeRecoveryWindow(
  daysSilent: number | null,
): RecoveryWindowDescriptor {
  const window = recoveryWindowForDays(daysSilent);
  switch (window) {
    case "warm":
      return {
        window,
        label: "Warm",
        explanation: "Follow up while the job is still fresh.",
      };
    case "cooling":
      return {
        window,
        label: "Cooling",
        explanation: "Still worth chasing, but do it soon.",
      };
    case "cold":
      return {
        window,
        label: "Cold",
        explanation: "Needs a softer close-the-loop angle.",
      };
    default:
      return { window, label: "Unknown", explanation: "" };
  }
}

export type PriorityLabel = "Follow up first" | "Next backup" | "Lower priority";

function priorityLabelForRank(rank: number): PriorityLabel {
  if (rank === 1) return "Follow up first";
  if (rank === 2) return "Next backup";
  return "Lower priority";
}

export type RankedAuditQuote = AuditQuote & {
  rank: number;
  windowLabel: string;
  windowExplanation: string;
  window: RecoveryWindow;
  priorityLabel: PriorityLabel;
};

export type NextMove = string;

export type AuditResult = {
  quotes: AuditQuote[];
  /** Same quotes, ranked by score and tagged with window + priority labels. */
  rankedQuotes: RankedAuditQuote[];
  totalSilentQuoteValue: number;
  priority: AuditQuote | null;
  /** Age band for the priority quote (e.g. "AT RISK"), null if no days given. */
  priorityBandLabel: string | null;
  /** Plain-English reason this quote is worth a touch first. */
  priorityReason: string;
  suggestedMessage: string;
  /** 0-2 short "Quote #X vs #Y" lines, dynamic to the entered numbers. */
  whyNotOthers: string[];
  /** The fixed 3-step practical plan shown under the message. */
  nextThreeMoves: NextMove[];
  /** Set when no valid amount was entered; result is otherwise empty. */
  error: string | null;
};

/** Accepts "$8,500", "8500", "8,500.00", " 4000 ". Rejects 0/negative/garbage. */
export function parseQuoteAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s$,]/g, "");
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT_USD) return null;
  return Math.round(n * 100) / 100;
}

/** Optional. Bare integer days, clamped 0–365. Blank/garbage → null. */
export function parseDaysSilent(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return Math.max(0, Math.min(MAX_DAYS, Number(trimmed)));
}

/**
 * How much a quote's age boosts/dampens follow-up priority. Peaks in the
 * "already cooling but still realistic" 7–45 day window — too fresh and the
 * homeowner may still be deciding; too old and the trail is usually cold.
 * Unknown days → neutral (rank on dollars alone).
 *
 * Fresh penalty (days < 7): a small, intentional nudge. We don't punish
 * fresh quotes harshly — a meaningfully bigger fresh quote should still
 * outrank a smaller prime-window one. The 0.9 weight makes "size dominates
 * timing once you're past ~11% bigger" the rule, which matches how a
 * contractor would actually triage by hand.
 */
function followUpWeight(daysSilent: number | null): number {
  if (daysSilent == null) return 1;
  if (daysSilent < 7) return 0.9; // give a fresh quote a small beat — but never a 30% one
  if (daysSilent <= 45) return 1; // prime window
  if (daysSilent <= 90) return 0.6; // cooling hard
  return 0.35; // likely cold
}

/**
 * One ready-to-send follow-up, keyed to the priority quote's age. Takeaway-
 * close style (gives the homeowner an easy yes/close-it-out choice) — never
 * the weak "just checking in". Honest: it offers a message, not an outcome.
 */
export function suggestedMessage(daysSilent: number | null): string {
  if (daysSilent != null && daysSilent > 45) {
    return "I'm about to close out the painting estimate I sent, but wanted to give you first shot before I do — still want to move forward?";
  }
  if (daysSilent != null && daysSilent <= 6) {
    return "Wanted to make sure the painting estimate I sent landed okay — any questions on the scope or the price, or anything you'd want changed?";
  }
  return "Are you still thinking about moving forward, or should I close this out for now?";
}

/**
 * Plain-English reason the priority quote earns the first touch. Honest,
 * contractor-native, and consistent with the on-page Example card — it
 * explains the value + timing tradeoff, never a recovery promise.
 */
export function reasonForPriority(
  priority: AuditQuote,
  quotes: AuditQuote[],
): string {
  const maxAmount = Math.max(...quotes.map((q) => q.amount));
  const isTopValue = priority.amount >= maxAmount;
  const days = priority.daysSilent;
  if (days != null && days < 7) {
    return "It's recent, so a light follow-up now won't feel pushy.";
  }
  if (days != null && days > 45) {
    return "It's the most valuable of the ones going cold — worth one respectful touch before you close it out.";
  }
  if (isTopValue) {
    return "High value and still recent enough to follow up without sounding desperate.";
  }
  return "Recent enough to follow up cleanly, and worth more than the few minutes it takes to send one message.";
}

/**
 * Returns 0-2 short, dynamic insights explaining the ranking — never more.
 * The lines reference quote NUMBERS the contractor entered, never amounts,
 * so the output stays focused on the decision rather than the dollar value.
 */
export function buildWhyNotOthers(ranked: RankedAuditQuote[]): string[] {
  if (ranked.length < 2) return [];
  const out: string[] = [];
  const first = ranked[0];
  const second = ranked[1];

  // Each branch must hold true on the ACTUAL amounts / days before its line
  // can render — never trust the rank alone to justify a value claim. A line
  // like "lower value" is only emitted when the referenced quote really is
  // smaller; "more money at stake" only when the winner really is bigger.
  // The ordering below picks the most specific accurate branch first.

  // 1. Winner is meaningfully bigger AND not penalized by a worse age window —
  //    so calling out the dollar gap is the honest reason.
  if (first.amount >= second.amount * 1.4) {
    out.push(
      `Quote #${second.index} is still worth a follow-up, but Quote #${first.index} has more money at stake.`,
    );
  }
  // 2. Loser is FRESHER (closer to today) AND genuinely SMALLER. Both checks
  //    are required — the old code only checked days, which let a bigger
  //    fresher quote get mislabeled "lower value" and contradict the math.
  else if (
    first.daysSilent != null &&
    second.daysSilent != null &&
    second.daysSilent < first.daysSilent &&
    second.amount < first.amount
  ) {
    out.push(
      `Quote #${second.index} is more recent, but lower value, so it can wait behind the bigger quote.`,
    );
  }
  // 3. Loser is BIGGER but very fresh while the winner sits in the prime
  //    window — the value-but-fresh tradeoff. This is the inverse case of
  //    Branch 2 and must NEVER call the loser "lower value".
  else if (
    second.amount > first.amount &&
    second.daysSilent != null &&
    second.daysSilent < 7 &&
    (first.daysSilent == null || first.daysSilent >= 7)
  ) {
    out.push(
      `Quote #${second.index} is bigger, but it's still fresh enough that a follow-up now could feel rushed.`,
    );
  }
  // 4. Loser is OLDER (deeper in the cooling window) than the winner — value
  //    and freshness both already favor the winner, so the timing angle is
  //    the most honest one.
  else if (
    first.daysSilent != null &&
    second.daysSilent != null &&
    second.daysSilent > first.daysSilent
  ) {
    out.push(
      `Quote #${second.index} has been quiet longer, so a follow-up there is more likely to feel forced.`,
    );
  }
  // 5. Fallback — no specific honest comparison to draw, so just frame
  //    Quote #2 as the backup.
  else {
    out.push(
      `Quote #${second.index} is your backup if Quote #${first.index} stays quiet.`,
    );
  }

  if (ranked.length >= 3) {
    const third = ranked[2];
    if (third.daysSilent != null && third.daysSilent > 30) {
      out.push(
        `Quote #${third.index} is the coldest of the three — leave it for last and use a softer close-out angle.`,
      );
    } else if (
      // "Smallest" must hold against BOTH peers, not just the second row —
      // otherwise a "smallest" claim contradicts the rendered amounts.
      third.amount < first.amount &&
      third.amount < second.amount &&
      third.amount < second.amount * 0.7
    ) {
      out.push(
        `Quote #${third.index} is the smallest of the three, so it sits behind the bigger quotes.`,
      );
    }
  }

  return out.slice(0, 2);
}

/** The fixed 3-step practical plan shown under the suggested message. */
export const NEXT_THREE_MOVES: NextMove[] = [
  "Send this message today.",
  "If there is no reply, follow up again in 3 days.",
  "If it is still silent, close the loop after 7 days.",
];

export function runSilentQuoteAudit(inputs: AuditQuoteInput[]): AuditResult {
  const quotes: AuditQuote[] = [];
  inputs.forEach((input, i) => {
    const amount = parseQuoteAmount(input.amountRaw ?? "");
    if (amount == null) return;
    quotes.push({
      index: i + 1,
      amount,
      daysSilent: parseDaysSilent(input.daysSilentRaw),
    });
  });

  if (quotes.length === 0) {
    return {
      quotes: [],
      rankedQuotes: [],
      totalSilentQuoteValue: 0,
      priority: null,
      priorityBandLabel: null,
      priorityReason: "",
      suggestedMessage: "",
      whyNotOthers: [],
      nextThreeMoves: [],
      error: "Enter at least one old quote amount to see your audit.",
    };
  }

  const totalSilentQuoteValue =
    Math.round(quotes.reduce((sum, q) => sum + q.amount, 0) * 100) / 100;

  // Rank every quote by score = dollars × age weight. The top-ranked entry is
  // the priority recommendation, so the standalone `priority` field and the
  // first row of `rankedQuotes` are always consistent — no place for the UI
  // to disagree with itself.
  const rankedQuotes: RankedAuditQuote[] = quotes
    .map((q) => ({ q, score: q.amount * followUpWeight(q.daysSilent) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.q.amount !== a.q.amount) return b.q.amount - a.q.amount;
      return a.q.index - b.q.index;
    })
    .map(({ q }, i) => {
      const descriptor = describeRecoveryWindow(q.daysSilent);
      return {
        ...q,
        rank: i + 1,
        window: descriptor.window,
        windowLabel: descriptor.label,
        windowExplanation: descriptor.explanation,
        priorityLabel: priorityLabelForRank(i + 1),
      };
    });

  const priority = rankedQuotes[0];
  const priorityBandLabel =
    priority.daysSilent != null
      ? recoveryScoreForDays(priority.daysSilent).label
      : null;

  return {
    quotes,
    rankedQuotes,
    totalSilentQuoteValue,
    priority,
    priorityBandLabel,
    priorityReason: reasonForPriority(priority, quotes),
    suggestedMessage: suggestedMessage(priority.daysSilent),
    whyNotOthers: buildWhyNotOthers(rankedQuotes),
    nextThreeMoves: NEXT_THREE_MOVES,
    error: null,
  };
}

/**
 * Builds the post-result account href, preserving any UTM params the paid ad
 * appended so attribution survives the hop into the existing auth flow. The
 * `next` target is the existing first-3-free onboarding reveal, so a cold
 * visitor who liked the audit lands straight in the product after magic-link
 * sign-in. We never invent an auth system — this is just the existing
 * /sign-up?next= contract with UTMs carried along.
 */
export function buildSignupHref(
  search: string,
  opts: { next?: string } = {},
): string {
  const next = opts.next ?? "/onboarding/reveal";
  const incoming = new URLSearchParams(search ?? "");
  const out = new URLSearchParams();
  out.set("next", next);
  for (const key of UTM_KEYS) {
    const value = incoming.get(key);
    if (value) out.set(key, value);
  }
  return `/sign-up?${out.toString()}`;
}
