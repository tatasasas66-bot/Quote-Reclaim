import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const homepage = readSource("../app/page.tsx");
const dashboard = readSource("../app/(app)/dashboard/page.tsx");
const recoveryAlert = readSource(
  "../components/dashboard/RecoveryWindowAlert.tsx",
);
const heroMetric = readSource("../components/dashboard/HeroMetric.tsx");
const quoteListItem = readSource("../components/quotes/QuoteListItem.tsx");
const paywall = readSource("../components/billing/Paywall.tsx");
const authShell = readSource("../components/onboarding/AuthShell.tsx");
const authForm = readSource("../components/onboarding/AuthForm.tsx");
const quoteForm = readSource("../components/quotes/QuoteForm.tsx");
const riskLib = readSource("../lib/recovery/risk.ts");
const nbaLib = readSource("../lib/recovery/next-best-action.ts");
const voiceButton = readSource("../components/voice/VoiceButton.tsx");

describe("Homepage copy", () => {
  it("uses the new headline lines", () => {
    expect(homepage).toMatch(/You sent the quote\./);
    expect(homepage).toMatch(/They went quiet\./);
    expect(homepage).toMatch(/Get the job back\./);
  });

  it("uses the new subheadline", () => {
    expect(homepage).toMatch(
      /Quote Reclaim turns silent estimates into a recovery queue/,
    );
    // JSX text can wrap; tolerate any whitespace between phrases.
    expect(homepage).toMatch(/No CRM\.\s+No\s+chasing\.\s+No guessing\./);
  });

  it("uses the Find Silent Money primary CTA", () => {
    expect(homepage).toMatch(/Find Silent Money/);
  });

  it("uses the See how it works secondary CTA", () => {
    expect(homepage).toMatch(/See how it works/);
  });

  it("uses the 3 silent quotes free trust line", () => {
    expect(homepage).toMatch(
      /Start with 3 silent quotes free\. One recovered job can pay for months\./,
    );
  });

  it("does NOT say 3 free recoveries anywhere", () => {
    expect(homepage).not.toMatch(/3 free recoveries/i);
  });
});

describe("Dashboard naming", () => {
  it("title is Silent Quote Command", () => {
    expect(dashboard).toMatch(/Silent Quote Command/);
  });

  it("subtitle uses the dollar value / risk level / next move framing", () => {
    expect(dashboard).toMatch(
      /Every quiet estimate has a dollar value, a risk level, and a next\s+move\./,
    );
  });

  it("queue header uses MONEY SITTING QUIET", () => {
    expect(dashboard).toMatch(/MONEY SITTING QUIET/);
  });

  it("queue subline uses sitting quiet, not sitting silent", () => {
    expect(dashboard).toMatch(/sitting quiet/);
    expect(dashboard).not.toMatch(/sitting silent/);
  });
});

describe("Recovery Ledger card copy", () => {
  it("Still Bleeding subline mentions Money sitting quiet right now", () => {
    expect(heroMetric).toMatch(/Money sitting quiet right now\./);
  });

  it("Recovered This Month subline mentions Jobs won back so far", () => {
    expect(heroMetric).toMatch(/Jobs won back so far/);
  });

  it("All-Time Recovered subline mentions Approx. months paid for", () => {
    // The "s" is templated for singular/plural; check for the surrounding
    // structure rather than a literal "months".
    expect(heroMetric).toMatch(/Approx\. .*month[\s\S]*paid for/);
  });

  it("eyebrow uses softer /80 opacity tokens for contrast against the value", () => {
    expect(heroMetric).toMatch(/text-warning\/80/);
    expect(heroMetric).toMatch(/text-success\/80/);
    expect(heroMetric).toMatch(/text-money\/80/);
  });
});

describe("Recovery Window Alert copy", () => {
  it("keeps the alert eyebrow", () => {
    expect(recoveryAlert).toMatch(/RECOVERY WINDOW ALERT/);
  });

  it("uses the days quiet (not days silent) phrasing in the body template", () => {
    expect(recoveryAlert).toMatch(/days quiet/);
    expect(recoveryAlert).not.toMatch(/days with no reply/);
  });

  it("uses the new subline copy", () => {
    expect(recoveryAlert).toMatch(
      /Open the plan and make the next move before the job disappears\./,
    );
  });

  it("title-cases name, trade, and city defensively at render time", () => {
    expect(recoveryAlert).toMatch(/titleCaseName\(clientName\)/);
    expect(recoveryAlert).toMatch(/titleCaseName\(trade\)/);
    expect(recoveryAlert).toMatch(/titleCaseName\(city\)/);
  });
});

describe("Queue row copy", () => {
  it("uses quiet, not silent in the visible label", () => {
    // The label is templated as `{days} day{...} quiet` so we check for the
    // suffix word as it appears in JSX, and confirm no literal "day silent"
    // phrasing leaked through. (The `effectiveDaysSilent` import keeps the
    // word "Silent" in the symbol — code identifiers don't count.)
    expect(quoteListItem).toMatch(/\bquiet\b/);
    expect(quoteListItem).not.toMatch(/\bday[s]? silent\b/i);
  });

  it("title-cases trade and city for display", () => {
    expect(quoteListItem).toMatch(/titleCaseName\(quote\.trade\)/);
    expect(quoteListItem).toMatch(/titleCaseName\(quote\.city\)/);
  });
});

describe("Paywall copy", () => {
  it("headline uses the Unlock unlimited silent quote recovery copy", () => {
    expect(paywall).toMatch(
      /Unlock unlimited silent quote recovery — \$79\/month/,
    );
  });

  it("body uses 'You've used your 3 free silent quotes.'", () => {
    expect(paywall).toMatch(/used your 3 free silent quotes/);
  });

  it("uses the One won-back job proof line", () => {
    expect(paywall).toMatch(/One won-back job can pay for months\./);
  });

  it("primary CTA is Unlock unlimited recovery", () => {
    expect(paywall).toMatch(/Unlock unlimited recovery/);
  });

  it("does NOT say 3 free recoveries", () => {
    expect(paywall).not.toMatch(/3 free recoveries/i);
  });

  it("does NOT advertise discounts or alternate plans", () => {
    expect(paywall).not.toMatch(/\$39\b|\$49\b|founding|coupon|discount/i);
  });
});

describe("Auth copy", () => {
  it("uses Start your recovery as the auth title for both modes", () => {
    expect(authShell).toMatch(/title:\s*"Start your recovery"/);
  });

  it("sign-up subtitle uses 3 silent quotes free", () => {
    expect(authShell).toMatch(/3 silent quotes free\./);
  });

  it("magic link success uses Check your inbox + 60 minute expiry", () => {
    expect(authForm).toMatch(/Check your inbox/);
    expect(authForm).toMatch(/expires in 60 minutes/);
  });
});

describe("Risk level labels", () => {
  it("warm renders as FRESH", () => {
    expect(riskLib).toMatch(/case "warm":\s*\n?\s*return "FRESH"/);
  });

  it("cold renders as AT RISK", () => {
    expect(riskLib).toMatch(/case "cold":\s*\n?\s*return "AT RISK"/);
  });

  it("hot renders as CRITICAL", () => {
    expect(riskLib).toMatch(/case "hot":\s*\n?\s*return "CRITICAL"/);
  });

  it("never references Recovery Score in user-facing label code", () => {
    expect(riskLib).not.toMatch(/Recovery Score/i);
  });
});

describe("Next Best Action copy", () => {
  it("uses Open the plan when phone is available", () => {
    expect(nbaLib).toMatch(/"Open the plan"/);
  });

  it("uses Close the loop for critical state", () => {
    expect(nbaLib).toMatch(/"Close the loop"/);
  });

  it("uses Copy the next message when no phone is saved", () => {
    expect(nbaLib).toMatch(/"Copy the next message"/);
  });

  it("no longer suggests Send early in NBA labels", () => {
    expect(nbaLib).not.toMatch(/"Send early"/);
  });

  it("does not contain Send Now", () => {
    expect(nbaLib).not.toMatch(/Send Now/i);
  });
});

describe("Trade dropdown is locked to the 6 enum values", () => {
  it("QuoteForm uses a native <select> with TRADES options", () => {
    expect(quoteForm).toMatch(/<select/);
    expect(quoteForm).toMatch(/TRADES\.map/);
    expect(quoteForm).toMatch(/Choose a trade/);
  });

  it("never offers a free-text 'Other' trade option", () => {
    expect(quoteForm).not.toMatch(/value="other"|>Other</i);
  });
});

describe("State dropdown is locked to US 2-letter codes", () => {
  it("QuoteForm uses a US_STATES dropdown", () => {
    expect(quoteForm).toMatch(/US_STATES\.map/);
    expect(quoteForm).toMatch(/Select state/);
  });
});

describe("Google OAuth is hidden by default", () => {
  // AuthForm uses GOOGLE_AUTH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true"
  // and gates the entire block. Verified by the existing static-NEXT_PUBLIC suite.
  it("gates the Google block on the feature flag", () => {
    expect(authForm).toMatch(/!magicSent\s*&&\s*GOOGLE_AUTH_ENABLED/);
  });
});

describe("Voice button copy", () => {
  it("uses Add by voice", () => {
    expect(voiceButton).toMatch(/Add by voice/);
  });

  it("hint uses the days quiet example", () => {
    expect(voiceButton).toMatch(/eight days quiet/);
  });
});

// ---------------------------------------------------------------------------
// Cross-codebase banned word audit
// ---------------------------------------------------------------------------

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));

// Files we deliberately exclude from the audit:
//  - The AI banned-phrase tables literally contain banned phrases as data
//    so the generator can reject them. Their presence is correct.
//  - Test files reference these terms to assert their absence.
//  - The cleanup doc shows examples of historical strings.
const AUDIT_EXCLUDE_DIRS = new Set(["__tests__"]);
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

describe("Banned aggressive-language audit (UI/marketing)", () => {
  const sources = readAuditableSources();

  // Word boundary patterns chosen to avoid hitting innocuous neighbors:
  //  - "force" → exclude Next.js "force-dynamic" via negative lookbehind on -
  //  - "panic" → bare word
  //  - "brutal" → bare word
  //  - "ruthless" → bare word
  //  - "dirty work" → exact phrase
  //  - "artificial scarcity" / "psychological trigger" → exact phrase
  const patterns: Array<{ label: string; re: RegExp }> = [
    { label: "force (as UI verb)", re: /\bforce\b(?!-dynamic|-cache)/i },
    { label: "panic", re: /\bpanic\b/i },
    { label: "dirty work", re: /\bdirty work\b/i },
    { label: "brutal", re: /\bbrutal\b/i },
    { label: "ruthless", re: /\bruthless\b/i },
    { label: "artificial scarcity", re: /\bartificial scarcity\b/i },
    { label: "psychological trigger", re: /\bpsychological trigger\b/i },
  ];

  for (const { label, re } of patterns) {
    it(`no UI/marketing surface contains "${label}"`, () => {
      const hits = sources.filter((s) => re.test(s.content));
      if (hits.length > 0) {
        throw new Error(
          `Found "${label}" in:\n${hits.map((h) => `  - ${h.path}`).join("\n")}`,
        );
      }
    });
  }
});

describe("Banned SaaS-cliché audit (marketing copy only)", () => {
  // Restrict this audit to user-facing pages and components, where the
  // marketing voice lives. Library files (ai/messaging/security/etc.) may
  // legitimately use words like "pipeline" or "workflow" as engineering
  // jargon and don't reach the UI.
  const MARKETING_DIRS = ["app", "components"];

  const sources = readAuditableSources().filter((s) => {
    const rel = s.path.slice(SRC_ROOT.length).replace(/^\/+/, "");
    return MARKETING_DIRS.some((d) => rel.startsWith(d + "/"));
  });

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

  // CRM is special-cased: the homepage uses "No CRM" as anti-positioning per
  // the spec ("No CRM. No chasing. No guessing."). Any positive use ("as a
  // CRM", "our CRM", "the CRM") is still a regression.
  it('CRM appears only in anti-positioning ("No CRM"), never as a positive descriptor', () => {
    const positiveCrm =
      /\b(?:as\s+a|our|the|your|like\s+a|just\s+another)\s+CRM\b/i;
    const hits = sources.filter((s) => positiveCrm.test(s.content));
    if (hits.length > 0) {
      throw new Error(
        `Positive CRM mention in:\n${hits.map((h) => `  - ${h.path}`).join("\n")}`,
      );
    }
  });
});

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
});
