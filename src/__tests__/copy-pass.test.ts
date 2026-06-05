import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const homepage = readSource("../app/page.tsx");
const dashboard = readSource("../app/(app)/dashboard/page.tsx");
const quoteDetail = readSource("../app/(app)/quotes/[id]/page.tsx");
const recoveryAlert = readSource(
  "../components/dashboard/RecoveryWindowAlert.tsx",
);
const heroMetric = readSource("../components/dashboard/HeroMetric.tsx");
const recoveryReceipt = readSource(
  "../components/dashboard/RecoveryReceipt.tsx",
);
const quoteForm = readSource("../components/quotes/QuoteForm.tsx");
const quoteListItem = readSource("../components/quotes/QuoteListItem.tsx");
// Paywall copy is asserted inside billing.test.ts; we read it through the
// banned-word audit below, not here.
const authShell = readSource("../components/onboarding/AuthShell.tsx");
const authForm = readSource("../components/onboarding/AuthForm.tsx");
const intelligencePanel = readSource(
  "../components/intelligence/IntelligencePanel.tsx",
);
const aiPrompt = readSource("../lib/ai/generate-recovery-plan.ts");
const aiFallbacks = readSource("../lib/ai/fallback-messages.ts");

// ---------------------------------------------------------------------------
// Phase 4 locked copy — landing
// ---------------------------------------------------------------------------

describe("Homepage hero copy (honest conversion rewrite)", () => {
  it("eyebrow is Silent Quote Command", () => {
    expect(homepage).toMatch(/Silent Quote Command/);
    expect(homepage).not.toMatch(/QUOTE RECLAIM · SILENT QUOTE COMMAND/);
  });

  it("uses the loss-framed contractor-labor headline", () => {
    expect(homepage).toMatch(/You did the drive, the takeoff, the math\./);
    expect(homepage).toMatch(/let the money die quiet\./);
  });

  it("subhead is honest about email auto-send (no SMS overclaim)", () => {
    expect(homepage).toMatch(/which silent estimates still have money in/);
    expect(homepage).toMatch(/follows\s+up by email automatically/);
    expect(homepage).toMatch(/drift\s+cold\./);
  });

  it("primary CTA is See What's Sitting Quiet", () => {
    expect(homepage).toMatch(/Sitting Quiet/);
    expect(homepage).not.toMatch(/Find Silent Money/);
  });

  it("secondary CTA is See How It Works (links to the product preview)", () => {
    expect(homepage).toMatch(/<Button[^>]*variant=["']secondary["']/);
    expect(homepage).toMatch(/See How It Works/);
    expect(homepage).toMatch(/href="#how-it-works"/);
    expect(homepage).toMatch(/id="how-it-works"/);
  });

  it("trust line names the audience, the price, and 'Not another CRM'", () => {
    expect(homepage).toMatch(/Built for US home-service contractors\./);
    expect(homepage).toContain("$79/month");
    expect(homepage).toMatch(/Not another\s+CRM\./);
  });

  it("hero section uses py-12 md:py-16 (above-the-fold compression)", () => {
    expect(homepage).toMatch(/py-12 md:py-16/);
  });
});

// ---------------------------------------------------------------------------
// Phase 4 locked copy — dashboard
// ---------------------------------------------------------------------------

describe("Dashboard header (Phase 4.2)", () => {
  it("title is Silent Quote Command", () => {
    expect(dashboard).toMatch(/Silent Quote Command/);
    expect(dashboard).not.toMatch(/Recovery Dashboard/);
  });

  it("subtitle is the desired quiet-estimate command frame", () => {
    expect(dashboard).toMatch(
      /Every quiet estimate has a dollar value, a risk level, and a next\s+move\./,
    );
  });

  it("retains the QUOTE RECLAIM eyebrow", () => {
    expect(dashboard).toMatch(/QUOTE RECLAIM/);
  });
});

// ---------------------------------------------------------------------------
// Recovery Window Alert (Phase 4.3)
// ---------------------------------------------------------------------------

describe("Recovery Window Alert copy (Value Proof v0.5)", () => {
  it("uses the directive 'DO THIS TODAY' eyebrow", () => {
    expect(recoveryAlert).toMatch(/DO THIS TODAY/);
    expect(recoveryAlert).not.toMatch(/RECOVERY WINDOW ALERT/);
  });

  it("headline is the daily command naming the client to work first", () => {
    // "DO THIS TODAY" + "Work {displayName} first." reads as an order.
    expect(recoveryAlert).toMatch(/Work \{displayName\} first\./);
    expect(recoveryAlert).toMatch(/DO THIS TODAY/);
    expect(recoveryAlert).not.toMatch(/Open \{displayName\}/);
    // The pre-polish long-block headlines are gone.
    expect(recoveryAlert).not.toMatch(
      /Start with the highest-value quiet quote that still has a real shot/,
    );
    expect(recoveryAlert).not.toMatch(/before you chase anything new/);
  });

  it("subline reads name · trade · amount · days quiet · urgency", () => {
    expect(recoveryAlert).toMatch(/days quiet/);
    expect(recoveryAlert).toMatch(/\{urgencyLabel\}/);
    expect(recoveryAlert).toMatch(/\{displayName\}/);
  });

  it("derives the urgency label from recoveryPriority", () => {
    expect(recoveryAlert).toMatch(/recoveryPriority\(score\)/);
  });

  it("CTA is 'Work this quote →'", () => {
    expect(recoveryAlert).toMatch(/Work this quote/);
    expect(recoveryAlert).not.toMatch(/Send the next follow-up/);
    expect(recoveryAlert).not.toMatch(/Open Recovery Plan/);
  });

  it("title-cases name and trade defensively at render", () => {
    expect(recoveryAlert).toMatch(/titleCaseName\(clientName\)/);
    expect(recoveryAlert).toMatch(/titleCaseName\(trade\)/);
  });
});

// ---------------------------------------------------------------------------
// Recovery Ledger contrast + v0.4 color discipline
// ---------------------------------------------------------------------------

describe("Recovery Ledger eyebrow contrast + color discipline (v0.4)", () => {
  it("STILL BLEEDING keeps the softer warning/80 token", () => {
    expect(heroMetric).toMatch(/text-warning\/80/);
  });

  it("Recovered-this-month keeps the success token for the won state", () => {
    // The recovered styling now lives in the Recovery Receipt column.
    expect(recoveryReceipt).toMatch(/text-success/);
  });

  it("the value-proof column stays off gold (gold lives only on STILL BLEEDING)", () => {
    expect(heroMetric).not.toMatch(/text-money\/80/);
    expect(recoveryReceipt).not.toMatch(/text-money/);
  });

  it("removes the decorative LIVE LEDGER badge", () => {
    expect(heroMetric).not.toMatch(/live ledger/i);
  });
});

// ---------------------------------------------------------------------------
// Auth copy (Phase 2 + retained)
// ---------------------------------------------------------------------------

describe("Auth copy", () => {
  it("AuthShell title is Start your recovery for both modes", () => {
    expect(authShell).toMatch(/title:\s*"Start your recovery"/);
  });

  it("AuthShell uses Silent Quote Command, not Revenue Recovery OS", () => {
    expect(authShell).toMatch(/Silent Quote Command/);
    expect(authShell).not.toMatch(/Revenue Recovery OS/);
  });

  it("magic-link success keeps secure link as the primary path", () => {
    expect(authForm).toMatch(/Secure link sent\. Open it from your inbox to sign in\./);
    expect(authForm).toMatch(/This link expires shortly and can only be used once\./);
    expect(authForm).not.toMatch(/Link not working\?/);
    expect(authForm).not.toMatch(/6-digit code/);
  });
});

describe("Recovery plan product framing", () => {
  it("QuoteForm no longer promises automatic scheduled follow-ups", () => {
    expect(quoteForm).not.toMatch(/schedule follow-ups automatically/);
    expect(quoteForm).not.toMatch(/We'll send these follow-ups on schedule/);
    expect(quoteForm).not.toMatch(/Approve & Schedule Recovery/);
    expect(quoteForm).toMatch(/Build Recovery Plan/);
    expect(quoteForm).toMatch(/ready to copy or send manually/);
  });

  it("quote detail no longer says 'We'll send these on schedule'", () => {
    expect(quoteDetail).not.toMatch(/We'll send these on schedule/);
    expect(quoteDetail).toMatch(/Your recovery plan is ready/);
  });

  it("visible UI says Recovery Priority, not Recovery Score", () => {
    const visibleUi = [quoteDetail, quoteListItem, authShell].join("\n");
    expect(visibleUi).not.toMatch(/Recovery Score/);
    expect(visibleUi).toMatch(/Recovery Priority/);
  });
});

// ---------------------------------------------------------------------------
// IntelligencePanel locked copy (Phase 7.2)
// ---------------------------------------------------------------------------

describe("IntelligencePanel — Recovery Pattern (mobile polish)", () => {
  it("eyebrow is RECOVERY PATTERN, not PERSONAL RECOVERY DNA", () => {
    expect(intelligencePanel).toMatch(/RECOVERY PATTERN/);
    expect(intelligencePanel).not.toMatch(/PERSONAL RECOVERY DNA/);
  });

  it("uses the premium 'Learning from your first N sequences' headline", () => {
    expect(intelligencePanel).toMatch(/Learning from your first \{unlockAt\} sequences/);
    // The game-like "Unlocks after N" framing is gone.
    expect(intelligencePanel).not.toMatch(/Unlocks after/);
  });

  it("locked progress copy renders the premium 'X of N analyzed.' form", () => {
    expect(intelligencePanel).toMatch(/\{analyzed\} of \{unlockAt\} analyzed/);
    // The "Y to go" countdown is gone.
    expect(intelligencePanel).not.toMatch(/to go/);
  });

  it("unlocked copy reads 'X of X analyzed.'", () => {
    expect(intelligencePanel).toMatch(/\{totalSequences\} of \{totalSequences\} analyzed/);
  });

  it("preview copy is the contractor-native rewrite (no 'framework'/'reply windows' jargon)", () => {
    expect(intelligencePanel).toMatch(
      /which follow-ups work best for your trade/,
    );
    expect(intelligencePanel).toMatch(
      /when quiet quotes are most likely to come back/,
    );
    expect(intelligencePanel).not.toMatch(/strongest framework/);
    expect(intelligencePanel).not.toMatch(/best\s+reply windows/);
  });
});

// ---------------------------------------------------------------------------
// AI system prompt hardening (Phase 4.5)
// ---------------------------------------------------------------------------

describe("AI system prompt — contractor-native voice and labels", () => {
  it("targets a real foreman voice, not a sales coach or AI assistant", () => {
    expect(aiPrompt).toMatch(
      /You write email follow-ups for US home-service contractors/,
    );
    expect(aiPrompt).toMatch(/VOICE/);
    expect(aiPrompt).toMatch(/not a sales coach, not an AI assistant/);
  });

  it("locks the five contractor-native framework labels (plain English, no psychology jargon)", () => {
    expect(aiPrompt).toMatch(/Estimate Check/);
    expect(aiPrompt).toMatch(/Schedule Check/);
    expect(aiPrompt).toMatch(/Close-the-Loop/);
    expect(aiPrompt).toMatch(/Options Check/);
    expect(aiPrompt).toMatch(/Final Closeout/);
  });

  it("no longer exposes the old psychology framework names to the AI", () => {
    expect(aiPrompt).not.toMatch(/Casual Pattern Interrupt/);
    expect(aiPrompt).not.toMatch(/Authority & Status Squeeze/);
    expect(aiPrompt).not.toMatch(/Professional Closeout/);
    expect(aiPrompt).not.toMatch(/Value Re-frame/);
    expect(aiPrompt).not.toMatch(/Final Breakup/);
  });

  it("bans exclamation marks outright", () => {
    expect(aiPrompt).toMatch(/No exclamation marks/);
  });

  it("Day 7 still anchors on close-the-loop with a calm, no-pressure ask", () => {
    expect(aiPrompt).toMatch(/Close-the-Loop/);
    expect(aiPrompt).toMatch(/keep the estimate open or close it out/);
  });
});

// ---------------------------------------------------------------------------
// Fallback messages — Day 7 Takeaway frame (Phase 4.6)
// ---------------------------------------------------------------------------

describe("Fallback messages use the uploaded SMS research sequence", () => {
  it("Day 1 uses Hey + contractor-name pattern interrupt", () => {
    expect(aiFallbacks).toMatch(/Hey \$\{firstName\} — \$\{contractorFirstName\} here/);
  });

  it("Day 3 uses the active-list / schedule framing (no fake slot scarcity)", () => {
    expect(aiFallbacks).toMatch(/lining up the \$\{tradeWord\} schedule/);
    // Polish pass: Day 3 v0 was sharpened from "this on the active list" to
    // "your estimate active"; v2 still carries the "list" framing. Either
    // shape is valid as long as the schedule-check intent is preserved.
    expect(aiFallbacks).toMatch(/active list|estimate active|keep .* on my list/);
    // No fake-scarcity phrases the rewrite outlawed.
    expect(aiFallbacks).not.toMatch(/let the slot go/);
    expect(aiFallbacks).not.toMatch(/locking the schedule today/);
    expect(aiFallbacks).not.toMatch(/releasing it/);
  });

  it("Day 7 carries calm Close-the-Loop variants plus the Voss no-oriented form", () => {
    // The primary calm close-the-loop frames remain (v0 is canonical).
    expect(aiFallbacks).toMatch(/Should I keep \$\{project\} open/);
    expect(aiFallbacks).toMatch(/close it out for now/);
    expect(aiFallbacks).toMatch(/Either way is fine/);
    // v4 is the research-backed Chris Voss "Have you given up on…?" no-oriented
    // form — the single most evidence-backed phrasing for stalled-deal recovery
    // (Never Split the Difference). Documented as a deliberate addition.
    expect(aiFallbacks).toMatch(/Have you given up on \$\{project\}/);
    // The blunt, pressuring "Just need a yes or no" phrasing stays banned.
    expect(aiFallbacks).not.toMatch(/Just need a yes or no/);
  });

  it("no fallback message string literal contains an exclamation mark", () => {
    // Scan only single/double/backtick string literals — JS negation (!t)
    // is allowed in the body, what matters is customer-facing message text.
    const literals = aiFallbacks.match(/`[^`]*`|"[^"]*"|'[^']*'/g) ?? [];
    const offenders = literals.filter((lit) => /!/.test(lit));
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cross-codebase banned word audit
// ---------------------------------------------------------------------------

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));
const AUDIT_EXCLUDE_DIRS = new Set(["__tests__"]);
// AI banned-phrase tables intentionally contain banned phrases as data so
// the generator can reject them. Their presence is correct.
const AUDIT_EXCLUDE_FILES = new Set([
  "lib/ai/validate-message.ts",
  "lib/ai/generate-recovery-plan.ts",
]);

function collectSourceFiles(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const relPath = rel ? `${rel}/${entry}` : entry;
    const s = statSync(full);
    if (s.isDirectory()) {
      if (AUDIT_EXCLUDE_DIRS.has(entry)) continue;
      out.push(...collectSourceFiles(full, relPath));
    } else if (/\.(tsx?|css)$/.test(entry)) {
      if (AUDIT_EXCLUDE_FILES.has(relPath)) continue;
      out.push(full);
    }
  }
  return out;
}

function readAuditableSources(): Array<{ path: string; content: string }> {
  return collectSourceFiles(SRC_ROOT).map((path) => ({
    path,
    content: readFileSync(path, "utf8"),
  }));
}

describe("Already-banned vocabulary stays banned", () => {
  const sources = readAuditableSources();

  it('no source contains the banned word "Bid"', () => {
    const re = /\bBid\b/;
    const hits = sources.filter((s) => re.test(s.content));
    expect(hits.map((h) => h.path)).toEqual([]);
  });

  it('no source contains "Send Now" as UI label', () => {
    const re = /\bSend Now\b/;
    const hits = sources.filter((s) => re.test(s.content));
    expect(hits.map((h) => h.path)).toEqual([]);
  });

  it('no source contains "Design system preview" stub copy', () => {
    const re = /Design system preview/;
    const hits = sources.filter((s) => re.test(s.content));
    expect(hits.map((h) => h.path)).toEqual([]);
  });

  it('no source contains "v0.1" launch-stub copy', () => {
    const re = /\bv0\.1\b/;
    const hits = sources.filter((s) => re.test(s.content));
    expect(hits.map((h) => h.path)).toEqual([]);
  });

  it('no source contains "scaffold" stub copy', () => {
    const re = /\bscaffold\b/i;
    const hits = sources.filter((s) => re.test(s.content));
    expect(hits.map((h) => h.path)).toEqual([]);
  });
});

describe("Marketing-surface SaaS-cliché audit", () => {
  const MARKETING_DIRS = ["app", "components"];
  const sources = readAuditableSources().filter((s) => {
    const rel = s.path.slice(SRC_ROOT.length).replace(/^\/+/, "");
    return MARKETING_DIRS.some((d) => rel.startsWith(d + "/"));
  });

  // SaaS clichés banned outright in marketing copy.
  const banned = [
    "optimize",
    "leverage",
    "productivity",
    "workflow",
    "engagement",
    "pipeline",
    "AI-powered",
  ];

  for (const word of banned) {
    it(`no marketing surface contains "${word}"`, () => {
      const re = new RegExp(`\\b${word.replace(/-/g, "\\-")}\\b`, "i");
      const hits = sources.filter((s) => re.test(s.content));
      if (hits.length > 0) {
        throw new Error(
          `Found "${word}" in:\n${hits.map((h) => `  - ${h.path}`).join("\n")}`,
        );
      }
    });
  }
});
