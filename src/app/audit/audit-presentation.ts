import type {
  RankedAuditQuote,
  RecoveryWindow,
} from "@/lib/audit/silent-quote-audit";

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

export function nextFollowupForWindow(window: RecoveryWindow): string {
  if (window === "closeout") {
    return "Hey, I am closing this estimate out on my side for now. If the project comes back around, reply here and I can reopen the conversation.";
  }

  if (window === "cold") {
    return "Hey, one last note before I close this estimate out: if the project is still alive but the timing changed, reply with a better month and I will leave it there.";
  }

  return "Hey, one last thing before I close the estimate out: is the holdup timing, budget, or scope? One word is enough.";
}
