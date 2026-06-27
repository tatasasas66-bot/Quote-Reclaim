import type {
  RankedAuditQuote,
  RecoveryWindow,
} from "@/lib/audit/silent-quote-audit";
import { formatCurrency } from "@/lib/utils/currency";

export const WINDOW_TONES: Record<string, string> = {
  Warm: "border-success/40 bg-success/10 text-success",
  Cooling: "border-warning/40 bg-warning/10 text-warning",
  Cold: "border-danger/40 bg-danger/10 text-danger",
  Closeout: "border-line-strong bg-surface-3 text-ink",
  Unknown: "border-line-subtle bg-surface-2 text-ink-muted",
};

export const WINDOW_DEFINITIONS: Record<string, string> = {
  Warm: "Fresh enough for a direct, low-pressure reopen.",
  Cooling: "Still alive, but waiting makes the restart harder.",
  Cold: "Use a lighter message that removes pressure and asks for clarity.",
  Closeout: "Old enough for a clean closeout that leaves the door open.",
  Unknown: "Add days quiet when you know them for a clearer recovery window.",
};

export function actionForRank(quote: RankedAuditQuote): string {
  if (quote.rank === 1) return "Send today";
  if (quote.rank === 2) return "Work next";
  return quote.window === "closeout" || quote.window === "cold"
    ? "Revive carefully"
    : "Keep behind the first two";
}

export function directiveForWindow(window: RecoveryWindow): string {
  switch (window) {
    case "warm":
      return "Move today";
    case "cooling":
      return "Cooling fast";
    case "cold":
      return "Revive carefully";
    case "closeout":
      return "Close out or revive carefully";
    default:
      return "Still worth one clean move";
  }
}

export type AuditResultCta = {
  headline: string;
  urgency: string;
  button: string;
  href: string;
  daysUntilCold: number;
};

export function appendAuditSignupReason(
  signupHref: string,
  reason: string,
  leadQuote?: number,
): string {
  const separator = signupHref.includes("?") ? "&" : "?";
  const leadQuoteParam =
    leadQuote == null ? "" : `&lead_quote=${encodeURIComponent(leadQuote)}`;
  return `${signupHref}${separator}reason=${encodeURIComponent(reason)}${leadQuoteParam}`;
}

export function buildAuditResultCta(
  quote: RankedAuditQuote,
  signupHref: string,
): AuditResultCta {
  const quoteLabel = `Quote #${quote.index}`;
  const amount = formatCurrency(quote.amount);
  const days = quote.daysSilent;
  const href = appendAuditSignupReason(signupHref, "result-cta", quote.index);

  if (quote.window === "warm") {
    return {
      headline: `Work ${quoteLabel} while it's still Warm.`,
      urgency:
        days == null
          ? `${quoteLabel} is a ${amount} quote and still Warm. Work it before it cools off.`
          : `${quoteLabel} is a ${amount} quote and still Warm at ${days} days quiet. Work it before it cools off.`,
      button: "Save the next move for this quote",
      href,
      daysUntilCold: days == null ? 0 : Math.max(0, 22 - days),
    };
  }

  if (quote.window === "cooling") {
    const daysUntilCold = days == null ? 0 : Math.max(0, 22 - days);
    return {
      headline:
        daysUntilCold > 0
          ? `Don't let ${quoteLabel} go Cold.`
          : `${quoteLabel} is already Cold.`,
      urgency:
        daysUntilCold > 0
          ? `${quoteLabel} is a ${amount} quote in Cooling. It hits Cold in ${daysUntilCold} ${daysUntilCold === 1 ? "day" : "days"}. After that, reopening gets harder.`
          : `${quoteLabel} is a ${amount} quote and already Cold. Reopen it once, cleanly.`,
      button:
        daysUntilCold > 0
          ? "Send me the next move before this quote goes Cold"
          : "Get the clean reopen and closeout move",
      href,
      daysUntilCold,
    };
  }

  if (quote.window === "cold") {
    const daysUntilCloseout =
      days == null ? 0 : Math.max(0, 45 - days);
    return {
      headline: `${quoteLabel} is already Cold. Reopen it once, cleanly.`,
      urgency:
        daysUntilCloseout > 0
          ? `${quoteLabel} is a ${amount} quote at ${days} days quiet. It reaches Closeout in ${daysUntilCloseout} ${daysUntilCloseout === 1 ? "day" : "days"}.`
          : `${quoteLabel} is a ${amount} quote and already Cold. Reopen it once, cleanly.`,
      button: "Get the clean reopen and closeout move",
      href,
      daysUntilCold: 0,
    };
  }

  if (quote.window === "closeout") {
    return {
      headline: "This quote is in Closeout. Reopen once, then stop chasing.",
      urgency:
        days == null
          ? `${quoteLabel} is a ${amount} quote in Closeout. Reopen once respectfully, then close the loop.`
          : `${quoteLabel} is a ${amount} quote at ${days} days quiet. Reopen once respectfully, then close the loop.`,
      button: "Get the respectful closeout move",
      href,
      daysUntilCold: 0,
    };
  }

  return {
    headline: `Save the next move for ${quoteLabel}.`,
    urgency: `${quoteLabel} is a ${amount} quote. Add days quiet for a sharper recovery window.`,
    button: "Save the next move for this quote",
    href,
    daysUntilCold: 0,
  };
}

export function capitalizeDisplayMessage(message: string): string {
  if (!message) return message;
  return message.charAt(0).toUpperCase() + message.slice(1);
}
