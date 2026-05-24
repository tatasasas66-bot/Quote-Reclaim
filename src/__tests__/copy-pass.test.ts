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

describe("Homepage hero copy (Phase 4.1)", () => {
  it("eyebrow is QUOTE RECLAIM · SILENT QUOTE COMMAND", () => {
    expect(homepage).toMatch(/QUOTE RECLAIM · SILENT QUOTE COMMAND/);
  });

  it("uses the prescribed three-line headline", () => {
    expect(homepage).toMatch(/You sent the quote\./);
    expect(homepage).toMatch(/They went quiet\./);
    expect(homepage).toMatch(/Get the job back\./);
  });

  it("subhead uses silent-money recovery queue framing", () => {
    expect(homepage).toMatch(/turns silent estimates into a recovery queue/);
    expect(homepage).toMatch(/clear\s+next moves, risk signals/);
    expect(homepage).toMatch(/No CRM\. No\s+chasing\. No guessing\./);
  });

  it("primary CTA is Find Silent Money", () => {
    expect(homepage).toMatch(/Find Silent Money/);
  });

  it("secondary CTA is Sign in", () => {
    expect(homepage).toMatch(/<Button[^>]*variant=["']secondary["']/);
  });

  it("trust line uses 3 silent quotes free phrasing", () => {
    expect(homepage).toMatch(
      /Start with 3 silent quotes free\. One recovered job can pay for months\./,
    );
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

describe("Recovery Window Alert copy (Phase 4.3)", () => {
  it("keeps the RECOVERY WINDOW ALERT eyebrow", () => {
    expect(recoveryAlert).toMatch(/RECOVERY WINDOW ALERT/);
  });

  it("headline is 'Don't let this one die.'", () => {
    // JSX escapes the apostrophe as &apos; — match either form.
    expect(recoveryAlert).toMatch(/Don(?:'|&apos;)t let this one die\./);
  });

  it("body uses 'days with no reply' (matches Phase 4 template)", () => {
    expect(recoveryAlert).toMatch(/days with no reply/);
  });

  it("subline uses 'queued. Open the plan or send it early today.'", () => {
    expect(recoveryAlert).toMatch(
      /next follow-up is queued\. Open the plan or send it early today\./,
    );
  });

  it("CTA is 'Open Recovery Plan →'", () => {
    expect(recoveryAlert).toMatch(/Open Recovery Plan/);
  });

  it("title-cases name, trade, and city defensively at render", () => {
    expect(recoveryAlert).toMatch(/titleCaseName\(clientName\)/);
    expect(recoveryAlert).toMatch(/titleCaseName\(trade\)/);
    expect(recoveryAlert).toMatch(/titleCaseName\(city\)/);
  });
});

// ---------------------------------------------------------------------------
// Recovery Ledger (Phase 1.8 contrast rule)
// ---------------------------------------------------------------------------

describe("Recovery Ledger eyebrow contrast (Phase 1.8)", () => {
  it("eyebrows use softer /80 opacity tokens for contrast", () => {
    expect(heroMetric).toMatch(/text-warning\/80/);
    expect(heroMetric).toMatch(/text-success\/80/);
    expect(heroMetric).toMatch(/text-money\/80/);
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

  it("magic-link success uses 'Check your inbox' and the 60-minute expiry", () => {
    expect(authForm).toMatch(/Check your inbox/);
    expect(authForm).toMatch(/expires in 60 minutes/);
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

describe("IntelligencePanel locked state (Phase 7.2)", () => {
  it("eyebrow is PERSONAL RECOVERY DNA", () => {
    expect(intelligencePanel).toMatch(/PERSONAL RECOVERY DNA/);
  });

  it("uses 'Unlocks after N sequences'", () => {
    expect(intelligencePanel).toMatch(/Unlocks after \{unlockAt\} sequences/);
  });

  it("preview copy promises framework + reply windows + trade comparison", () => {
    expect(intelligencePanel).toMatch(/strongest framework/);
    expect(intelligencePanel).toMatch(/best\s+reply windows/);
    expect(intelligencePanel).toMatch(/recovery rate compares to your trade/);
  });
});

// ---------------------------------------------------------------------------
// AI system prompt hardening (Phase 4.5)
// ---------------------------------------------------------------------------

describe("AI system prompt hardening (Phase 4.5)", () => {
  it("instructs the writer to end as a calm professional", () => {
    expect(aiPrompt).toMatch(/calm professional, not a salesperson/);
  });

  it("step 3 must offer a close-the-loop / release the slot", () => {
    expect(aiPrompt).toMatch(/Step 3 specifically MUST offer a clear close-the-loop/);
    expect(aiPrompt).toMatch(/release the slot/);
  });

  it("bans exclamation marks outright", () => {
    expect(aiPrompt).toMatch(/use exclamation marks/);
  });

  it("bans 'just' as a hedge", () => {
    expect(aiPrompt).toMatch(/word "just" as a hedge/);
  });
});

// ---------------------------------------------------------------------------
// Fallback messages — Day 7 Takeaway frame (Phase 4.6)
// ---------------------------------------------------------------------------

describe("Day 7 fallback messages use the Takeaway frame (Phase 4.6)", () => {
  it("HVAC checkIn frees up the install window", () => {
    expect(aiFallbacks).toMatch(/free up the install window/);
  });

  it("Roofing checkIn releases the crew window", () => {
    expect(aiFallbacks).toMatch(/release the crew window/);
  });

  it("Remodeling checkIn frees up the planning slot", () => {
    expect(aiFallbacks).toMatch(/free up the planning slot/);
  });

  it("General Contracting checkIn releases the project window", () => {
    expect(aiFallbacks).toMatch(/release the project window/);
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
