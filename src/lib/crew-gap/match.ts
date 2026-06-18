import {
  describeRecoveryWindow,
  recoveryWindowForDays,
  type RecoveryWindow,
} from "@/lib/audit/silent-quote-audit";
import { tradeLabel } from "@/lib/quotes/quote-display";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";

export type CrewGapQuote = {
  id: string;
  trade: string;
  city: string | null;
  state: string | null;
  estimate_amount: number;
  job_description: string | null;
  days_silent: number;
  quote_sent_at: string | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_opted_out: boolean;
};

export type CrewGapInput = {
  openDate: string;
  crewSize: number;
  jobTypeWanted: string;
  minimumJobValue: number;
  driveRadiusMiles: number;
  note?: string;
};

export type CrewGapUrgencyBand =
  | "missing_date"
  | "past_or_today"
  | "this_week"
  | "next_two_weeks"
  | "later";

export type CrewGapCandidate = {
  quote: CrewGapQuote;
  sourceNumber: number;
  score: number;
  daysSilent: number;
  window: RecoveryWindow;
  windowLabel: string;
  amountFits: boolean;
  jobTypeFits: boolean;
  contactable: boolean;
  goodFit: boolean;
  reasons: string[];
};

export type CrewGapMatchResult = {
  recommendation: CrewGapCandidate | null;
  backupQuotes: CrewGapCandidate[];
  rankedCandidates: CrewGapCandidate[];
  warning: string | null;
  recommendedMessage: string;
  nextThreeMoves: string[];
  urgencyBand: CrewGapUrgencyBand;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_GOOD_FIT_DAYS = 45;

export function matchCrewGap(
  quotes: CrewGapQuote[],
  input: CrewGapInput,
  now: Date = new Date(),
): CrewGapMatchResult {
  const urgencyBand = urgencyBandForOpenDate(input.openDate, now);
  const rankedCandidates = quotes
    .map((quote, index) => scoreQuote(quote, index + 1, input, urgencyBand))
    .filter((candidate) => !candidate.quote.client_opted_out)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.quote.estimate_amount !== a.quote.estimate_amount) {
        return b.quote.estimate_amount - a.quote.estimate_amount;
      }
      return a.sourceNumber - b.sourceNumber;
    });

  const recommendation =
    rankedCandidates.find((candidate) => candidate.goodFit) ?? null;
  const backups = rankedCandidates
    .filter((candidate) => candidate.quote.id !== recommendation?.quote.id)
    .slice(0, 3);

  const warning = recommendation
    ? null
    : rankedCandidates.length === 0
      ? "Add a few quiet quotes first, then Crew Gap Rescue can pick the safest one to reopen."
      : "No good quote fits this crew gap yet. Try lowering the minimum, widening the job type, or adding more recent quiet quotes before sending an open-slot message.";

  return {
    recommendation,
    backupQuotes: backups,
    rankedCandidates,
    warning,
    recommendedMessage: recommendation
      ? buildCrewGapMessage(recommendation.quote, input)
      : "",
    nextThreeMoves: buildNextThreeMoves(input, Boolean(recommendation)),
    urgencyBand,
  };
}

function scoreQuote(
  quote: CrewGapQuote,
  sourceNumber: number,
  input: CrewGapInput,
  urgencyBand: CrewGapUrgencyBand,
): CrewGapCandidate {
  const daysSilent = effectiveDaysSilent(quote);
  const window = recoveryWindowForDays(daysSilent);
  const amount = Number(quote.estimate_amount ?? 0);
  const minimum = Math.max(0, Number(input.minimumJobValue ?? 0));
  const amountFits = minimum <= 0 || amount >= minimum;
  const jobTypeFits = matchesJobType(quote, input.jobTypeWanted);
  const contactable = Boolean(quote.client_email || quote.client_phone);

  const amountScore =
    Math.min(32, (amount / Math.max(minimum || 1, 1)) * 16) +
    Math.min(18, amount / 400);
  const windowScore = recoveryWindowScore(daysSilent, urgencyBand);
  const jobTypeScore = isSpecificJobType(input.jobTypeWanted)
    ? jobTypeFits
      ? 18
      : -18
    : 4;
  const amountPenalty = amountFits ? 0 : -40;
  const contactScore = contactable ? 6 : -8;
  const score =
    amountScore + windowScore + jobTypeScore + amountPenalty + contactScore;

  const goodFit =
    !quote.client_opted_out &&
    amountFits &&
    jobTypeFits &&
    contactable &&
    daysSilent <= MAX_GOOD_FIT_DAYS &&
    daysSilent >= 3;

  return {
    quote,
    sourceNumber,
    score,
    daysSilent,
    window,
    windowLabel: describeRecoveryWindow(daysSilent).label,
    amountFits,
    jobTypeFits,
    contactable,
    goodFit,
    reasons: buildReasons({
      amountFits,
      jobTypeFits,
      contactable,
      daysSilent,
      window,
      urgencyBand,
      specificJobType: isSpecificJobType(input.jobTypeWanted),
    }),
  };
}

function recoveryWindowScore(
  daysSilent: number,
  urgencyBand: CrewGapUrgencyBand,
): number {
  let base = 0;
  if (daysSilent <= 2) base = 12;
  else if (daysSilent <= 14) base = 34;
  else if (daysSilent <= 30) base = 28;
  else if (daysSilent <= 45) base = 16;
  else if (daysSilent <= 60) base = 6;
  else base = -12;

  if (urgencyBand === "this_week" || urgencyBand === "past_or_today") {
    if (daysSilent <= 30 && daysSilent >= 3) return base + 6;
    if (daysSilent > 60) return base - 8;
  }
  return base;
}

function buildReasons(args: {
  amountFits: boolean;
  jobTypeFits: boolean;
  contactable: boolean;
  daysSilent: number;
  window: RecoveryWindow;
  urgencyBand: CrewGapUrgencyBand;
  specificJobType: boolean;
}): string[] {
  const reasons: string[] = [];
  if (args.amountFits) {
    reasons.push("It meets the minimum job value for this crew gap.");
  } else {
    reasons.push("It is below the minimum job value you entered.");
  }

  if (args.window === "warm" || args.window === "cooling") {
    reasons.push("It is still recent enough to reopen without sounding forced.");
  } else if (args.daysSilent <= MAX_GOOD_FIT_DAYS) {
    reasons.push("It is older, but still close enough for one respectful touch.");
  } else {
    reasons.push("It has been quiet long enough that the message needs a softer angle.");
  }

  if (args.specificJobType) {
    reasons.push(
      args.jobTypeFits
        ? "It fits the job type you want for this slot."
        : "It does not clearly match the job type you asked for.",
    );
  }

  if (args.urgencyBand === "this_week" || args.urgencyBand === "past_or_today") {
    reasons.push("The open date is soon, so a warmer quote is safer than a long-cold one.");
  }

  if (args.contactable) {
    reasons.push("It has contact info available for a clean follow-up.");
  }

  return reasons;
}

export function buildCrewGapMessage(
  quote: CrewGapQuote,
  input: Pick<CrewGapInput, "openDate" | "jobTypeWanted">,
): string {
  const firstName = firstNameFrom(quote.client_name);
  const project = projectLabel(quote, input.jobTypeWanted);
  const dateLabel = formatOpenDate(input.openDate);

  if (!dateLabel) {
    return `Hey ${firstName}, are you still thinking about ${project}, or should I close this out for now?`;
  }

  return `Hey ${firstName}, we had an opening come up around ${dateLabel}. If you are still thinking about ${project}, I can check whether that slot fits and reopen the quote details. Want me to take another look?`;
}

function buildNextThreeMoves(
  input: CrewGapInput,
  hasRecommendation: boolean,
): string[] {
  if (!hasRecommendation) {
    return [
      "Add or import more quiet quotes before sending an open-slot message.",
      "Lower the minimum only if the crew gap is more expensive than taking a smaller job.",
      "Use the normal recovery sequence for older quotes that do not fit this slot.",
    ];
  }

  const radius =
    input.driveRadiusMiles > 0
      ? `Confirm the job still fits your ${input.driveRadiusMiles}-mile drive radius before promising the crew day.`
      : "Confirm travel, scope, and crew fit before promising the crew day.";
  return [
    "Send the open-slot message to the best-fit quote first.",
    radius,
    "If there is no reply, move to the first backup quote instead of chasing the same customer twice today.",
  ];
}

function matchesJobType(quote: CrewGapQuote, jobTypeWanted: string): boolean {
  if (!isSpecificJobType(jobTypeWanted)) return true;
  const wanted = normalize(jobTypeWanted);
  const trade = normalize(tradeLabel(quote.trade));
  const description = normalize(quote.job_description ?? "");
  return (
    trade.includes(wanted) ||
    wanted.includes(trade) ||
    description.includes(wanted)
  );
}

function isSpecificJobType(jobTypeWanted: string): boolean {
  const normalized = normalize(jobTypeWanted);
  return normalized !== "" && normalized !== "any" && normalized !== "any job";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function firstNameFrom(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || "there";
}

function projectLabel(
  quote: CrewGapQuote,
  jobTypeWanted: string,
): string {
  const description = (quote.job_description ?? "").trim();
  if (description) return `the ${description}`;
  if (isSpecificJobType(jobTypeWanted)) return `the ${jobTypeWanted.trim()} project`;
  const trade = tradeLabel(quote.trade).toLowerCase();
  return trade ? `the ${trade} project` : "the project";
}

export function urgencyBandForOpenDate(
  openDate: string,
  now: Date = new Date(),
): CrewGapUrgencyBand {
  const days = daysUntil(openDate, now);
  if (days == null) return "missing_date";
  if (days <= 0) return "past_or_today";
  if (days <= 7) return "this_week";
  if (days <= 14) return "next_two_weeks";
  return "later";
}

function daysUntil(openDate: string, now: Date): number | null {
  const date = parseDateOnly(openDate);
  if (!date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - today.getTime()) / MS_PER_DAY);
}

function formatOpenDate(openDate: string): string {
  const date = parseDateOnly(openDate);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(m) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}
