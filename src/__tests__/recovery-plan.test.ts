import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const actions = readSource("../lib/quotes/actions.ts");
const quoteActions = readSource("../components/quotes/QuoteActions.tsx");
const copyBtn = readSource("../components/quotes/CopyButton.tsx");
const barrel = readSource("../components/quotes/index.ts");

// ---------------------------------------------------------------------------
// /quotes/[id] page invariants
// ---------------------------------------------------------------------------

describe("Recovery Plan UI: /quotes/[id]", () => {
  it("renders the recovery plan list (reads listRemindersForQuote)", () => {
    expect(detailPage).toContain("listRemindersForQuote");
    expect(detailPage).toMatch(/reminders\.map/);
  });

  it("uses automation-first status copy", () => {
    expect(detailPage).toContain("Recovery running");
    expect(detailPage).toContain("Recovery paused");
    expect(detailPage).toContain("Next follow-up sends");
  });

  it("renders both channel-aware intro variants (automated email + manual copy)", () => {
    // Email channel: automated via Resend on the cron schedule.
    expect(detailPage).toContain(
      "Quote Reclaim sends these follow-ups by email on schedule",
    );
    // Copy mode (no email): contractor sends manually.
    expect(detailPage).toContain("Your recovery plan is ready");
    expect(detailPage).toContain(
      "Copy each message and send it from your phone",
    );
  });

  it("never shows the words 'Send Now'", () => {
    expect(detailPage).not.toMatch(/Send Now/);
  });

  it("renders 'Send early' as a conditionally disabled control", () => {
    // Phase 7+: Send early is rendered via SendEarlyButton, disabled computed from state.
    expect(detailPage).toContain("SendEarlyButton");
    expect(detailPage).toContain("sendEarlyDisabled");
    expect(detailPage).toMatch(/disabled=\{sendEarlyDisabled\}/);
  });

  it("renders the framework name per reminder", () => {
    expect(detailPage).toContain("framework_used");
  });

  it("renders a Copy button per reminder", () => {
    expect(detailPage).toContain("CopyButton");
    expect(detailPage).toContain("text={r.message_text}");
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
    expect(detailPage).toContain("WHY_THIS_WORKS");
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

  it("passes the new quote_sent_at into the reconciler", () => {
    expect(slice).toMatch(/newQuoteSentAt\s*[,:}]/);
  });

  it("uses the 5-touch cadence (1, 3, 7, 14, 30 days)", () => {
    expect(actions).toMatch(
      /CADENCE_DAYS\s*:\s*Record<1 \| 2 \| 3 \| 4 \| 5,\s*number>\s*=\s*\{[\s\S]*?1:\s*1,[\s\S]*?2:\s*3,[\s\S]*?3:\s*7,[\s\S]*?4:\s*14,[\s\S]*?5:\s*30/,
    );
  });
});

describe("reconcileReminders behavior", () => {
  const fn = actions.slice(
    actions.indexOf("async function reconcileReminders"),
    actions.indexOf("export async function createQuoteAction"),
  );

  it("preserves sent reminders (only updates unsent send_at when anySent)", () => {
    expect(fn).toMatch(/anySent[\s\S]*?\.filter\(\(x\)\s*=>\s*!x\.sent\)/);
  });

  it("never updates send_at for sent reminders", () => {
    // The filter on the update loop must require !sent
    expect(fn).toMatch(/\.filter\(\(x\)\s*=>\s*!x\.sent\)/);
  });

  it("regenerates message text only when no reminders are sent", () => {
    expect(fn).toContain("generateRecoveryPlan");
    // The regenerate branch is reached only after the anySent early return
    expect(fn).toMatch(/anySent[\s\S]*?return;[\s\S]*?generateRecoveryPlan/);
  });

  it("final-validates regenerated messages via validateMessage", () => {
    expect(fn).toContain("validateMessage");
  });

  it("updates existing reminders by followup_number (never duplicates)", () => {
    expect(fn).toMatch(/find\(\s*\(r\)\s*=>\s*r\.followup_number/);
  });

  it("only inserts when no rows existed (legacy path)", () => {
    expect(fn).toMatch(/existing\.length\s*===\s*0[\s\S]*?\.insert\(rows\)/);
  });
});

// ---------------------------------------------------------------------------
// 5-reminder maximum / no duplicate followup_number guarantee
// ---------------------------------------------------------------------------

describe("5-reminder maximum invariant", () => {
  it("the shared recovery-plan writer only inserts a complete 5-step plan", () => {
    // The 5-message gate moved into the single shared writer that BOTH the
    // single-quote create flow and the bulk import use. createQuoteAction
    // delegates to it; the writer never persists a partial plan.
    const writer = readSource("../lib/quotes/recovery-plan-write.ts");
    expect(writer).toMatch(/chosen\.length\s*!==\s*5/);
    expect(writer).toContain('from("reminders")');
    expect(actions).toContain("persistRecoveryPlan");
  });

  it("CADENCE_DAYS table has exactly 5 entries: 1, 2, 3, 4, 5", () => {
    const m = actions.match(/CADENCE_DAYS\s*:[^=]*=\s*(\{[^}]*\})/);
    expect(m).not.toBeNull();
    if (m) {
      const literal = m[1];
      const keys = (literal.match(/[12345]:/g) ?? []).length;
      expect(keys).toBe(5);
    }
  });

  it("reconcileReminders never .insert()s into reminders when rows already exist", () => {
    const fn = actions.slice(
      actions.indexOf("async function reconcileReminders"),
      actions.indexOf("export async function createQuoteAction"),
    );
    // Single guarded insert in the legacy (length===0) branch.
    const inserts = fn.match(/\.from\("reminders"\)\s*\.insert/g) ?? [];
    expect(inserts.length).toBe(1);
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
