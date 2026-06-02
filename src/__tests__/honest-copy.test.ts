import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

// The six user-facing conversion surfaces this rewrite touches.
const SURFACES: Record<string, string> = {
  homepage: readSource("../app/page.tsx"),
  authShell: readSource("../components/onboarding/AuthShell.tsx"),
  dashboard: readSource("../app/(app)/dashboard/page.tsx"),
  recoveryAlert: readSource("../components/dashboard/RecoveryWindowAlert.tsx"),
  quoteDetail: readSource("../app/(app)/quotes/[id]/page.tsx"),
  paywall: readSource("../components/billing/Paywall.tsx"),
};

// ---------------------------------------------------------------------------
// New honest strings render on each surface
// ---------------------------------------------------------------------------

describe("honest conversion copy renders on each surface", () => {
  it("homepage hero uses the loss-framed labor headline + honest email claim", () => {
    expect(SURFACES.homepage).toMatch(/You did the drive, the takeoff, the math\./);
    expect(SURFACES.homepage).toMatch(/let the money die quiet\./);
    expect(SURFACES.homepage).toMatch(/follows\s+up by email automatically/);
  });

  it("sign-in left panel reframes lead-chasing toward sent quotes", () => {
    expect(SURFACES.authShell).toMatch(/The money isn&apos;t always in the next lead\./);
    expect(SURFACES.authShell).toMatch(/drove out,\s+scoped, and sent/);
    expect(SURFACES.authShell).toMatch(/Silent Quote Command for serious contractors\./);
  });

  it("dashboard empty state uses the calm 'nothing to do' frame", () => {
    expect(SURFACES.dashboard).toMatch(/No quiet quotes right now\./);
    expect(SURFACES.dashboard).toMatch(/ranked by\s+dollars, risk, age, and next move/);
    expect(SURFACES.dashboard).toMatch(/View recent quotes/);
  });

  it("Do This Today alert coaches highest-value-first", () => {
    expect(SURFACES.recoveryAlert).toMatch(/DO THIS TODAY/);
    expect(SURFACES.recoveryAlert).toMatch(/Work the highest-value quiet quote first\./);
    expect(SURFACES.recoveryAlert).toMatch(/Work this quote/);
  });

  it("quote detail header sets the Silent Quote Command frame", () => {
    expect(SURFACES.quoteDetail).toMatch(/Silent Quote Command/);
    expect(SURFACES.quoteDetail).toMatch(/This estimate went quiet\./);
    expect(SURFACES.quoteDetail).toMatch(/the next move that makes the most sense/);
  });

  it("paywall uses founding framing + real price math + honest email claim", () => {
    expect(SURFACES.paywall).toMatch(/FOUNDING CONTRACTOR/);
    expect(SURFACES.paywall).toMatch(/Don&apos;t let good quotes die quiet\./);
    expect(SURFACES.paywall).toMatch(/follows\s+up by email automatically/);
    expect(SURFACES.paywall).toMatch(/1\.5% of a single \$5,000 job/);
  });
});

// ---------------------------------------------------------------------------
// $79 price intact on the surfaces that quote it
// ---------------------------------------------------------------------------

describe("$79 price stays intact", () => {
  it("homepage trust line and paywall both state $79/month", () => {
    expect(SURFACES.homepage).toContain("$79/month");
    expect(SURFACES.paywall).toContain("$79/month");
  });

  it("no surface introduces a different price point", () => {
    for (const src of Object.values(SURFACES)) {
      expect(src).not.toMatch(/\$39\b/);
      expect(src).not.toMatch(/\$49\b/);
      expect(src).not.toMatch(/\$99\b/);
      expect(src).not.toMatch(/\$29\b/);
    }
  });
});

// ---------------------------------------------------------------------------
// "follows up by email" — the only true automation claim — is present
// ---------------------------------------------------------------------------

describe("true automation claim is present (email auto-send via Resend)", () => {
  it("homepage and paywall both claim email follow-up", () => {
    expect(SURFACES.homepage).toMatch(/follows\s+up by email/);
    expect(SURFACES.paywall).toMatch(/follows\s+up by email/);
  });

  it("no surface claims SMS auto-send (SMS is not active)", () => {
    for (const [name, src] of Object.entries(SURFACES)) {
      expect(
        /follows up by (text|sms)|texts? (?:them|the customer) automatically|auto-?text/i.test(src),
        `${name} must not claim SMS auto-send`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// BANNED-CONTENT AUDIT (zero customers, zero integrations)
// ---------------------------------------------------------------------------

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));

function collectMarketingSources(): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  function walk(dir: string, rel: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const relPath = rel ? `${rel}/${entry}` : entry;
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__") continue;
        walk(full, relPath);
      } else if (/\.(tsx?|css)$/.test(entry)) {
        out.push({ path: relPath, content: readFileSync(full, "utf8") });
      }
    }
  }
  for (const top of ["app", "components"]) {
    walk(join(SRC_ROOT, top), top);
  }
  return out;
}

const marketingSources = collectMarketingSources();

describe("banned-content audit: no false claims anywhere in the UI", () => {
  // Phrases that would be lies for a product with zero customers and zero
  // third-party integrations. Matched case-insensitively as substrings.
  const BANNED_PHRASES = [
    "trusted by",
    "5 star",
    "5-star",
    "star rating",
    "integrates with",
    "works alongside",
    "ServiceTitan",
    "Jobber",
    "Housecall",
    "ProLine",
    "case study",
    "2 days",
    "recovers itself",
    "recover itself",
    "automatically commands",
    // Invented statistics called out in the integrity constraint.
    "14 hrs",
    "14 hours",
    "$7M",
    "4x growth",
    "10% lift",
    "35%",
  ];

  for (const phrase of BANNED_PHRASES) {
    it(`no marketing surface contains "${phrase}"`, () => {
      const needle = phrase.toLowerCase();
      const hits = marketingSources.filter((s) =>
        s.content.toLowerCase().includes(needle),
      );
      expect(hits.map((h) => h.path)).toEqual([]);
    });
  }

  it("the only percentage in the conversion surfaces is the 1.5% price math", () => {
    for (const [name, src] of Object.entries(SURFACES)) {
      const percents = (src.match(/\d[\d.]*\s?%/g) ?? []).map((p) =>
        p.replace(/\s/g, ""),
      );
      const offenders = percents.filter((p) => p !== "1.5%");
      expect(offenders, `unexpected percentage(s) in ${name}`).toEqual([]);
    }
  });

  it("no conversion-lift percentage claim (e.g. 35%→48%, +10%) appears", () => {
    for (const [name, src] of Object.entries(SURFACES)) {
      expect(
        /\d+%\s*(?:→|->|to)\s*\d+%|\+\s*\d+%|\d+%\s*(?:lift|increase|growth|more|boost)/i.test(
          src,
        ),
        `${name} must not contain a conversion-lift % claim`,
      ).toBe(false);
    }
  });
});
