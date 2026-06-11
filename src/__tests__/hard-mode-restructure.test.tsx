/**
 * @vitest-environment happy-dom
 *
 * HARD MODE restructure — acceptance contract for the visible product
 * transformation: homepage CTA logic + email/copy honesty, reveal copy,
 * dashboard Today/Next-Move zone, Recovery Receipt actual-proof-only,
 * Price-check meter framing, quote-card next action, won-proof placement,
 * quote-detail Next Move banner, and the two follow-up message upgrades.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import { HeroMetric } from "@/components/dashboard/HeroMetric";
import { RecoveryReceipt } from "@/components/dashboard/RecoveryReceipt";
import { SEQUENCE_VARIANTS, type VariantVars } from "@/lib/ai/fallback-messages";
import { validateMessage } from "@/lib/ai/validate-message";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const homepage = readSource("../app/page.tsx");
const revealClient = readSource("../app/(app)/onboarding/reveal/RevealClient.tsx");
const dashboard = readSource("../app/(app)/dashboard/page.tsx");
const heroMetricSrc = readSource("../components/dashboard/HeroMetric.tsx");
const receiptSrc = readSource("../components/dashboard/RecoveryReceipt.tsx");
const meterSrc = readSource("../components/dashboard/PaidForItselfMeter.tsx");
const nbaSrc = readSource("../lib/quotes/next-best-action.ts");
const quoteDetail = readSource("../app/(app)/quotes/[id]/page.tsx");
const paywall = readSource("../components/billing/Paywall.tsx");

afterEach(() => cleanup());

// ───────────────────────────────────────────────────────────────────────
// 1. Homepage — one CTA, routed into the audit; email/copy honesty
// ───────────────────────────────────────────────────────────────────────

describe("homepage hero restructure + email/copy honesty", () => {
  it("headline is the contractor-native you-already-priced pair", () => {
    expect(homepage).toMatch(/You already priced the job\./);
    expect(homepage).toMatch(/Now find the quotes still worth chasing\./);
  });

  it("primary CTA routes straight into the reveal flow (auth gate carries next=)", () => {
    expect(homepage).toMatch(
      /href="\/onboarding\/reveal"[\s\S]{0,200}Run the Free Silent Quote Audit/,
    );
  });

  it("the decorative See How It Works scroll button is gone", () => {
    expect(homepage).not.toMatch(/See How It Works/);
    expect(homepage).not.toMatch(/<Button[^>]*variant=["']secondary["']/);
  });

  it("subhead discloses both email auto-send AND copy fallback (no broad claim)", () => {
    expect(homepage).toMatch(/sent by email when there&apos;s an address/);
    expect(homepage).toMatch(/ready to copy\s+when there isn&apos;t/);
    expect(homepage).not.toMatch(/follows\s+up by email automatically/);
  });

  it("trust line: price + first 3 free + no learning curve differentiator", () => {
    expect(homepage).toContain("$79/month");
    expect(homepage).toMatch(/first 3\s+quotes free, no card needed/);
    expect(homepage).toMatch(/No learning curve\./);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 2. Reveal input — audit framing answers paste/why/saved/no-email
// ───────────────────────────────────────────────────────────────────────

describe("reveal input copy", () => {
  it("eyebrow carries the audit frame end-to-end with the homepage CTA", () => {
    expect(revealClient).toMatch(/Silent Quote Audit/);
    expect(revealClient).not.toMatch(/Find the money sitting quiet/);
  });

  it("body answers what-to-paste, what-happens, is-it-saved, and no-email", () => {
    expect(revealClient).toMatch(/One quote per line\. Name \+ amount is enough/);
    // Tightened: builds the 5-message recovery plan for EVERY row, not just
    // the top 3 — the per-row recovery write was rebuilt in the bulk-import
    // fix to guarantee every imported quote gets its full plan.
    expect(revealClient).toMatch(/builds\s+the 5-message recovery plan for each one\./);
    expect(revealClient).toMatch(/Nothing is saved until you confirm\./);
    expect(revealClient).toMatch(/No email on file\? You still\s+get all 5 messages, ready to copy\./);
  });

  it("keeps the no-email copy-ready promise and the row cap", () => {
    expect(revealClient).toMatch(/No email\?\s*We&apos;ll build copy-ready follow-ups instead\./);
    expect(revealClient).toMatch(/rows per import\./);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 3+4. Dashboard hero — TODAY / NEXT MOVE zone (state-aware, honest)
// ───────────────────────────────────────────────────────────────────────

const HERO_BASE = {
  stillBleeding: 42_500,
  pendingCount: 5,
  atRiskCount: 0,
  recoveredThisMonth: 0,
  jobsWonThisMonth: 0,
  quotesBeingWorked: 5,
  emailFollowupsSent: 4,
  allTimeRecovered: 0,
} as const;

describe("dashboard hero TODAY / NEXT MOVE zone", () => {
  it("names the priority quote and links its plan when one is at risk", () => {
    render(
      React.createElement(HeroMetric, {
        ...HERO_BASE,
        atRiskCount: 2,
        priorityClientName: "khaled hassan",
        priorityQuoteId: "q-123",
      }),
    );
    const zone = screen.getByTestId("today-next-move");
    expect(zone.textContent).toContain("Today");
    expect(zone.textContent).toContain("Khaled Hassan");
    expect(zone.textContent).toMatch(/open the plan and send the next follow-up/i);
    const link = screen.getByRole("link", { name: /Open the plan/i });
    expect(link.getAttribute("href")).toBe("/quotes/q-123");
  });

  it("with nothing at risk it reports the system is working + offers the add action", () => {
    render(React.createElement(HeroMetric, HERO_BASE));
    const zone = screen.getByTestId("today-next-move");
    expect(zone.textContent).toMatch(
      /Recovery is running — follow-ups are scheduled\. No manual\s+move needed today\./,
    );
    const link = screen.getByRole("link", { name: /Add your next quiet quote/i });
    expect(link.getAttribute("href")).toBe("/quotes/new");
  });

  it("renders no TODAY zone on an empty queue (FirstRecoveryCommand owns that state)", () => {
    render(
      React.createElement(HeroMetric, {
        ...HERO_BASE,
        stillBleeding: 0,
        pendingCount: 0,
        quotesBeingWorked: 0,
      }),
    );
    expect(screen.queryByTestId("today-next-move")).toBeNull();
  });

  it("dashboard feeds the zone the same priority quote the DO THIS TODAY alert uses", () => {
    expect(dashboard).toMatch(/priorityClientName=\{priorityQuote\?\.client_name \?\? null\}/);
    expect(dashboard).toMatch(/priorityQuoteId=\{priorityQuote\?\.id \?\? null\}/);
  });

  it("the zone never invents a send time (no fabricated schedule claims)", () => {
    expect(heroMetricSrc).not.toMatch(/sends (at|in) \d|tomorrow at|\d{1,2}:\d{2}/i);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 5+6. Receipt = actual proof only; Meter = potential only. No overlap.
// ───────────────────────────────────────────────────────────────────────

describe("actual vs potential separation", () => {
  it("receipt footer with wins names the honest dollar-back line — never months-paid framing", () => {
    // The receipt is the dollars-only surface now. ROI/months-paid framing
    // lives in exactly two places product-wide (Price Check + Win Moment),
    // never here.
    render(
      React.createElement(RecoveryReceipt, {
        recoveredThisMonth: 8_500,
        jobsWonThisMonth: 1,
        quotesBeingWorked: 3,
        emailFollowupsSent: 2,
        allTimeRecovered: 8_500,
      }),
    );
    expect(
      screen.getByText(/real money back in the door this month/i),
    ).toBeTruthy();
    expect(screen.queryByText(/wins covered/i)).toBeNull();
    expect(screen.queryByText(/months of Quote Reclaim/i)).toBeNull();
  });

  it("meter eyebrow is Price check, framed as potential ('If this one comes back')", () => {
    expect(meterSrc).toMatch(/Price check/);
    expect(meterSrc).not.toMatch(/Pays for itself/i);
    expect(meterSrc).toMatch(/If this one comes back/);
    expect(meterSrc).toMatch(/No\s+promises/);
    expect(meterSrc).toMatch(/size of the opportunity/);
  });

  it("meter never borrows the receipt's actual-proof vocabulary", () => {
    expect(meterSrc).not.toMatch(/recovered for you|Recovered this month/);
    // "wins covered" / "months paid for" no longer live on the receipt either —
    // the receipt is dollars-only and the ROI equation is in Price Check.
  });

  it("receipt never borrows the meter's potential vocabulary", () => {
    expect(receiptSrc).not.toMatch(/If this one comes back|size of the opportunity|Price check/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 7. Quote cards — passive "Let recovery run" is gone product-wide
// ───────────────────────────────────────────────────────────────────────

describe("quote-card next action", () => {
  it("fresh/cooling label is the working-system line, not passive permission", () => {
    expect(nbaSrc).toMatch(/"On schedule — follow-up queued"/);
    expect(nbaSrc).not.toMatch(/return \{ label: "Let recovery run"/);
  });

  it("'Let recovery run' appears nowhere in product source", () => {
    const SRC_ROOT = join(process.cwd(), "src");
    const offenders: string[] = [];
    function walk(dir: string, rel: string) {
      for (const entry of readdirSync(dir)) {
        if (entry === "__tests__") continue;
        const full = join(dir, entry);
        const relPath = rel ? `${rel}/${entry}` : entry;
        if (statSync(full).isDirectory()) walk(full, relPath);
        else if (/\.(tsx?|css)$/.test(entry)) {
          const text = readFileSync(full, "utf8");
          if (/"Let recovery run"|'Let recovery run'|`Let recovery run`/.test(text)) {
            offenders.push(relPath);
          }
        }
      }
    }
    for (const top of ["app", "components", "lib"]) walk(join(SRC_ROOT, top), top);
    expect(offenders).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 8. Jobs Won Back — green proof chip in the aside when wins exist
// ───────────────────────────────────────────────────────────────────────

describe("won-proof placement", () => {
  it("dashboard renders the green chip only when wonTotal > 0", () => {
    expect(dashboard).toMatch(/\{wonTotal > 0 \?\s*\(?\s*<Link[\s\S]{0,120}won-proof-chip/);
    expect(dashboard).toMatch(/won-proof-chip[\s\S]{0,400}text-success/);
  });

  it("the chip links to the gallery anchor and green stays reserved for wins", () => {
    expect(dashboard).toMatch(/href="#recent-quotes"[\s\S]{0,80}won-proof-chip/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 9. Quote detail — NEXT MOVE banner + email/copy honesty
// ───────────────────────────────────────────────────────────────────────

describe("quote detail NEXT MOVE banner (unified next-move source of truth)", () => {
  it("derives the banner from computeNextMove — the shared single source", () => {
    expect(quoteDetail).toMatch(/const move = computeNextMove\(/);
    expect(quoteDetail).toMatch(/move\.kind !== "none" \?/);
  });

  it("queued email mode: nothing to send by hand, never 'send today'", () => {
    expect(quoteDetail).toMatch(/is queued for/);
    expect(quoteDetail).toMatch(/Nothing to send by hand — step in when they reply\./);
  });

  it("due email mode: let it send, or send it today to move now", () => {
    expect(quoteDetail).toMatch(/is due now and queued for\s+email/);
    expect(quoteDetail).toMatch(/You can let it send, or send it today if you want to\s+move now\./);
  });

  it("copy mode owns the manual send explicitly and deep-links the message", () => {
    expect(quoteDetail).toMatch(/is ready to copy\. Send it from\s+your phone or email today\./);
    expect(quoteDetail).toMatch(/#followup-\$\{move\.followupNumber\}/);
    expect(quoteDetail).toMatch(/Jump to the message/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 10. Follow-up sequence — upgraded touches + banned-phrase sweep
// ───────────────────────────────────────────────────────────────────────

const VARS: VariantVars = {
  firstName: "Jane",
  contractorFirstName: "Mike",
  project: "the roofing estimate",
  projectDetail: "the roofing estimate",
  tradeWord: "roofing",
};

describe("follow-up message upgrades", () => {
  it("Day 30 closes neutral — the guilt-adjacent 'No hard feelings' is gone", () => {
    const allDay30 = SEQUENCE_VARIANTS[30].map((b) => b(VARS)).join(" ");
    expect(allDay30).not.toMatch(/No hard feelings/i);
    expect(SEQUENCE_VARIANTS[30][0](VARS)).toContain("All good either way.");
  });

  it("Day 14 v3 is tightened to one concrete offer with an easy yes", () => {
    expect(SEQUENCE_VARIANTS[14][3](VARS)).toBe(
      "Jane, if one part of the roofing estimate is holding things up, I can walk through just that piece. Want me to?",
    );
  });

  it("every variant on every day still passes the validator after the upgrades", () => {
    for (const day of [1, 3, 7, 14, 30] as const) {
      SEQUENCE_VARIANTS[day].forEach((build, i) => {
        const msg = build(VARS);
        const res = validateMessage(msg, {
          firstName: VARS.firstName,
          trade: "Roofing",
          followupNumber: day === 1 ? 1 : day === 3 ? 2 : day === 7 ? 3 : day === 14 ? 4 : 5,
        });
        expect(res.ok, `day ${day} v${i}: ${msg}`).toBe(true);
      });
    }
  });

  it("no weak/banned phrases anywhere in the sequence", () => {
    const all = ([1, 3, 7, 14, 30] as const)
      .flatMap((d) => SEQUENCE_VARIANTS[d].map((b) => b(VARS)))
      .join(" ");
    expect(all).not.toMatch(/just checking in|checking in|touching base|circling back/i);
    expect(all).not.toMatch(/have you given up|last chance|final notice|act now|hurry/i);
    expect(all).not.toMatch(/!/);
    expect(all).not.toMatch(/guarantee/i);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 11. Paywall body — same email/copy honesty applied
// ───────────────────────────────────────────────────────────────────────

describe("paywall body email/copy honesty", () => {
  it("discloses both modes; the broad auto-claim is gone", () => {
    expect(paywall).toMatch(/sent by\s+email when there&apos;s an address/);
    expect(paywall).toMatch(/ready to copy when there\s+isn&apos;t/);
    expect(paywall).not.toMatch(/follows\s+up by email automatically\./);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 13. No regressions on the protected surfaces
// ───────────────────────────────────────────────────────────────────────

describe("protected-surface regression sweep", () => {
  it("free limit stays 3 and reveal still gates per-row", () => {
    const entitlement = readSource("../lib/payments/entitlement.ts");
    expect(entitlement).toContain("FREE_PLAN_LIMIT = 3");
    const onboarding = readSource("../lib/onboarding/actions.ts");
    expect(onboarding).toContain("check_and_increment_usage");
  });

  it("no Lemon references reintroduced on the changed surfaces", () => {
    for (const src of [
      homepage, revealClient, dashboard, heroMetricSrc, receiptSrc, meterSrc,
      quoteDetail, paywall,
    ]) {
      expect(src.toLowerCase()).not.toContain("lemon");
    }
  });

  it("no fake urgency, countdowns, or guarantees on the changed surfaces", () => {
    for (const src of [homepage, revealClient, heroMetricSrc, receiptSrc, meterSrc]) {
      expect(src).not.toMatch(/countdown|expires in|only \d+ left|last chance|limited time/i);
      expect(src).not.toMatch(/\bguarantee/i);
    }
  });
});
