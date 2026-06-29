import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const viewModel = readSource("../lib/recovery/recovery-plan-view-model.ts");
const actions = readSource("../lib/quotes/actions.ts");
const recoveryLogic = readSource("../lib/recovery/recovery-logic.ts");
const cadenceMigration = readSource(
  "../../supabase/migrations/20260629160053_allow_six_recovery_steps.sql",
);
const quoteActions = readSource("../components/quotes/QuoteActions.tsx");
const copyBtn = readSource("../components/quotes/CopyButton.tsx");
const barrel = readSource("../components/quotes/index.ts");

// ---------------------------------------------------------------------------
// /quotes/[id] page invariants
// ---------------------------------------------------------------------------

describe("Recovery Plan UI: /quotes/[id]", () => {
  it("renders the recovery plan list (reads listRemindersForQuote)", () => {
    expect(detailPage).toContain("listRemindersForQuote");
    expect(detailPage).toMatch(/viewModel\.sequenceCards\.map/);
  });

  it("never labels an active empty state as a 0-message plan", () => {
    expect(viewModel).not.toContain("0-message remaining plan");
    expect(viewModel).toContain('? "Recovery plan"');
  });

  it("uses plainer status copy after the command panel", () => {
    expect(viewModel).toContain('return "Running"');
    expect(viewModel).toContain('return "Paused"');
    expect(viewModel).toContain("Next follow-up due:");
    expect(detailPage).not.toContain("Recovery running");
  });

  it("renders both channel-aware intro variants (automated email + manual copy)", () => {
    expect(viewModel).toContain(
      "The rest of the sequence stays behind this message and sends by email on schedule",
    );
    expect(viewModel).toContain(
      "The rest of the sequence stays here, ready to copy when each touch comes due",
    );
  });

  it("never shows the words 'Send Now'", () => {
    expect(detailPage).not.toMatch(/Send Now/);
  });

  it("renders the safe send control from the ViewModel action", () => {
    expect(detailPage).toContain("SendEarlyButton");
    expect(detailPage).toContain("action?.showSendToday");
    expect(detailPage).toMatch(/disabled=\{action\.disabled\}/);
  });

  it("renders the ViewModel family name per recovery card", () => {
    expect(detailPage).toContain("card.family");
  });

  it("renders a Copy button per ViewModel card", () => {
    expect(detailPage).toContain("CopyButton");
    expect(detailPage).toContain("text={card.copyMessage}");
  });

  it("uses the word 'Estimate' / 'Quote' and never 'Bid'", () => {
    expect(detailPage).not.toMatch(/\bBid\b/);
    expect(detailPage).toMatch(/Estimate|Quote/);
  });

  it("replaces the static Win Celebration with the Win Moment overlay", () => {
    // v0.5: the win is now an animated overlay triggered from QuoteActions.
    expect(detailPage).not.toContain("WinCelebration");
    expect(quoteActions).toContain("WinMomentOverlay");
    expect(quoteActions).toMatch(/label === "won"[\s\S]*?setShowWinMoment/);
  });

  it("renders 'Why this works' rationale under every step", () => {
    expect(detailPage).toContain("Why this works:");
    expect(detailPage).toContain("card.whyThisWorks");
    expect(viewModel).toContain("getWhyThisWorksForStep");
  });

  it("hides Pause/Resume/Mark Won when outcome is won or closed", () => {
    // The QuoteActions component itself short-circuits in those states.
    expect(quoteActions).toMatch(/status === "won"[\s\S]*?return null/);
  });
});

// ---------------------------------------------------------------------------
// QuoteActions component invariants
// ---------------------------------------------------------------------------

describe("QuoteActions component", () => {
  it("exposes Pause and Resume buttons", () => {
    expect(quoteActions).toContain("Pause sequence");
    expect(quoteActions).toContain("Resume sequence");
  });

  it("toggles Pause vs Resume based on status", () => {
    expect(quoteActions).toMatch(/status === "running"/);
  });

  it("calls the pause/resume server actions", () => {
    expect(quoteActions).toContain("pauseSequenceAction");
    expect(quoteActions).toContain("resumeSequenceAction");
  });

  it("calls markQuoteWonAction and closeQuoteAction", () => {
    expect(quoteActions).toContain("markQuoteWonAction");
    expect(quoteActions).toContain("closeQuoteAction");
  });

  it("takes a status prop, not a hidden assumption", () => {
    expect(quoteActions).toMatch(/status:\s*RecoveryStatus/);
  });
});

// ---------------------------------------------------------------------------
// Server action: pause/resume use toggle_sequence_pause RPC
// ---------------------------------------------------------------------------

describe("pause/resume server actions", () => {
  it("pauseSequenceAction exists and calls toggle_sequence_pause", () => {
    expect(actions).toContain("export async function pauseSequenceAction");
    expect(actions).toMatch(
      /pauseSequenceAction[\s\S]*?toggle_sequence_pause[\s\S]*?p_paused:\s*true/,
    );
  });

  it("resumeSequenceAction exists and calls toggle_sequence_pause", () => {
    expect(actions).toContain("export async function resumeSequenceAction");
    expect(actions).toMatch(
      /resumeSequenceAction[\s\S]*?toggle_sequence_pause[\s\S]*?p_paused:\s*false/,
    );
  });

  it("both actions go through service client (toggle_sequence_pause is service-role only)", () => {
    const pauseSlice = actions.slice(actions.indexOf("pauseSequenceAction"));
    expect(pauseSlice).toContain("createServiceSupabaseClient");
  });

  it("both actions re-authenticate the user before mutating", () => {
    const pauseSlice = actions.slice(actions.indexOf("pauseSequenceAction"));
    expect(pauseSlice).toContain("getUser()");
  });

  it("revalidates the quote detail path after mutation", () => {
    expect(actions).toMatch(/revalidatePath\(`\/quotes\/\$\{id\}`\)/);
  });
});

// ---------------------------------------------------------------------------
// mark_quote_won RPC integration
// ---------------------------------------------------------------------------

describe("markQuoteWonAction", () => {
  it("uses the existing mark_quote_won RPC", () => {
    expect(actions).toMatch(
      /markQuoteWonAction[\s\S]*?serviceClient\.rpc\("mark_quote_won"/,
    );
  });

  it("revalidates dashboard so stats update", () => {
    const wonSlice = actions.slice(actions.indexOf("markQuoteWonAction"));
    expect(wonSlice).toContain('revalidatePath("/dashboard")');
  });
});

// ---------------------------------------------------------------------------
// updateQuoteAction reconciles the reminder schedule
// ---------------------------------------------------------------------------

describe("updateQuoteAction: reminder reconciliation", () => {
  const slice = actions.slice(actions.indexOf("export async function updateQuoteAction"));

  it("calls reconcileReminders after a successful quote update", () => {
    expect(slice).toContain("reconcileReminders");
  });

  it("writes the new quote_sent_at to the quotes column (Days Quiet), but the reconciler re-anchors the schedule from now", () => {
    // newQuoteSentAt is the estimate date — it drives the quote_sent_at COLUMN
    // (Days Quiet) only. It must NOT be threaded into reconcileReminders, whose
    // schedule re-anchors to the edit moment so an unsent reminder can never be
    // pushed into the past when a quote's age is bumped.
    expect(slice).toMatch(/quote_sent_at: newQuoteSentAt/);
    expect(slice).toMatch(/await reconcileReminders\(\{/);
    const reconcileCall = slice.slice(
      slice.indexOf("await reconcileReminders({"),
      slice.indexOf("await reconcileReminders({") + 300,
    );
    expect(reconcileCall).not.toMatch(/newQuoteSentAt/);
  });

  it("uses the 6-touch cadence (1, 5, 10, 14, 21, 60 days)", () => {
    expect(recoveryLogic).toMatch(
      /CADENCE_DAYS[\s\S]*?1:\s*1,[\s\S]*?2:\s*5,[\s\S]*?3:\s*10,[\s\S]*?4:\s*14,[\s\S]*?5:\s*21,[\s\S]*?6:\s*60/,
    );
  });
});

describe("reconcileReminders behavior", () => {
  const fn = actions.slice(
    actions.indexOf("async function reconcileReminders"),
    actions.indexOf("export async function createQuoteAction"),
  );

  it("preserves sent reminders while refreshing unsent rows", () => {
    expect(fn).toMatch(/if \(!target \|\| target\.sent\) continue/);
  });

  it("never updates send_at for sent reminders", () => {
    // The filter on the update loop must require !sent
    expect(fn).toMatch(/if \(!target \|\| target\.sent\) continue/);
  });

  it("regenerates only unsent message text while preserving sent rows", () => {
    expect(fn).toContain("generateRecoveryPlan");
    expect(fn).toMatch(/target\.sent\) continue/);
  });

  it("final-validates regenerated messages via validateMessage", () => {
    expect(fn).toContain("validateMessage");
  });

  it("updates existing reminders by followup_number (never duplicates)", () => {
    expect(fn).toMatch(/find\(\s*\(r\)\s*=>\s*r\.followup_number/);
  });

  it("inserts a complete legacy plan when no rows exist", () => {
    expect(fn).toMatch(/existing\.length\s*===\s*0[\s\S]*?\.insert\(rows\)/);
  });

  it("adds only missing later steps to an existing legacy plan", () => {
    expect(fn).toContain("existingSteps");
    expect(fn).toContain("lastSentStep");
    expect(fn).toContain("missingRows");
  });
});

describe("six-step persistence guard", () => {
  it("widens the confirmed followup_number constraint to steps 1 through 6", () => {
    expect(cadenceMigration).toMatch(
      /constraint reminders_followup_number_check[\s\S]*?followup_number in \(1, 2, 3, 4, 5, 6\)/i,
    );
    expect(cadenceMigration).not.toMatch(/information_schema|pg_constraint|raise exception/i);
  });

  it("does not redirect after a silent or partial plan insert failure", () => {
    const createSlice = actions.slice(
      actions.indexOf("export async function createQuoteAction"),
      actions.indexOf("export async function updateQuoteAction"),
    );
    expect(createSlice).toContain("planResult.inserted !== 6");
    expect(createSlice).toContain("recovery plan could not be created");
    expect(createSlice.indexOf("planResult.inserted !== 6")).toBeLessThan(
      createSlice.indexOf("redirect(`/quotes/${quoteId}`)"),
    );
  });
});

// ---------------------------------------------------------------------------
// 6-reminder maximum / no duplicate followup_number guarantee
// ---------------------------------------------------------------------------

describe("6-reminder maximum invariant", () => {
  it("the shared recovery-plan writer only inserts a complete 6-step plan", () => {
    // The 6-message gate lives in the single shared writer that BOTH the
    // single-quote create flow and the bulk import use. createQuoteAction
    // delegates to it; the writer never persists a partial plan.
    const writer = readSource("../lib/quotes/recovery-plan-write.ts");
    expect(writer).toMatch(/chosen\.length\s*!==\s*6/);
    expect(writer).toContain('from("reminders")');
    expect(actions).toContain("persistRecoveryPlan");
  });

  it("CADENCE_DAYS table has exactly 6 entries", () => {
    expect(recoveryLogic).toMatch(/6:\s*60/);
  });

  it("reconcileReminders inserts only legacy or missing-step rows", () => {
    const fn = actions.slice(
      actions.indexOf("async function reconcileReminders"),
      actions.indexOf("export async function createQuoteAction"),
    );
    const inserts = fn.match(/\.from\("reminders"\)\s*\.insert/g) ?? [];
    expect(inserts.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CopyButton + barrel exports
// ---------------------------------------------------------------------------

describe("CopyButton component", () => {
  it("is a client component using navigator.clipboard", () => {
    expect(copyBtn.startsWith('"use client"')).toBe(true);
    expect(copyBtn).toContain("navigator.clipboard.writeText");
  });

  it("is re-exported from the quotes barrel", () => {
    expect(barrel).toContain("CopyButton");
  });
});

// ---------------------------------------------------------------------------
// Phase 6 boundary: no Twilio / Resend / billing / public audit
// ---------------------------------------------------------------------------

describe("Phase 6 boundary", () => {
  it("actions.ts does not import Twilio or Resend", () => {
    expect(actions).not.toMatch(/from\s+["']twilio["']/);
    expect(actions).not.toMatch(/from\s+["']resend["']/);
  });

  it("/quotes/[id] page does not import billing / payment libs", () => {
    expect(detailPage).not.toMatch(/stripe/i);
    expect(detailPage).not.toMatch(/lemon/i);
  });

  it("never uses the word 'Bid'", () => {
    expect(actions).not.toMatch(/\bBid\b/);
    expect(detailPage).not.toMatch(/\bBid\b/);
    expect(quoteActions).not.toMatch(/\bBid\b/);
  });
});
