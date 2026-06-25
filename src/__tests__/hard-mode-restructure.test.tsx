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
const recoveryViewModel = readSource(
  "../lib/recovery/recovery-plan-view-model.ts",
);
const paywall = readSource("../components/billing/Paywall.tsx");

afterEach(() => cleanup());

// ───────────────────────────────────────────────────────────────────────
// 1. Homepage — one CTA, routed into the audit; email/copy honesty
// ───────────────────────────────────────────────────────────────────────

describe("homepage hero restructure + email/copy honesty", () => {
  it("headline leads with sent estimates before new leads", () => {
    expect(homepage).toMatch(/You did the drive\./);
    expect(homepage).toMatch(/Don&apos;t let the quote die in silence/);
    expect(homepage).toMatch(/Before buying another lead/);
  });

it("primary CTA routes to the public audit doorway", () => {
  expect(homepage).toMatch(/href="\/audit"/);
  expect(homepage).toMatch(/Run the free estimate audit/);
});

  it("the decorative See How It Works scroll button is gone", () => {
    // The intentional secondary CTA "See how it works" anchors to a real
    // on-page section (#recovery-system) — it is not a decorative scroll
    // button. The old Title-Case "See How It Works" phrasing is still banned.
    expect(homepage).not.toMatch(/See How It Works/);
    expect(homepage).not.toMatch(/<Button[^>]*variant=["']secondary["']/);
    expect(homepage).toMatch(/See how it works/);
    expect(homepage).toMatch(/href="#recovery-system"/);
  });

  it("subhead explains the ongoing recovery system without a broad auto-send claim", () => {
    expect(homepage).toMatch(/which quiet estimate\s+to follow up first/);
    expect(homepage).toMatch(/low-pressure message to send today/);
    expect(homepage).toMatch(/keep\s+every sent estimate moving/);
    expect(homepage).not.toMatch(/follows\s+up by email automatically/);
  });

  it("trust line and price stay clear", () => {
    expect(homepage).toContain("PAYWALL_PRICE_LABEL");
    expect(homepage).toMatch(/No names/);
    expect(homepage).toMatch(/No phone numbers/);
    expect(homepage).toMatch(/No card/);
    expect(homepage).toMatch(/Result first/);
  });

  it("homepage shows the paid recovery system behind the free audit", () => {
    expect(homepage).toMatch(/The audit is the doorway\. Quote Reclaim is the recovery system\./);
    expect(homepage).toMatch(/Silent Quote Command/);
    expect(homepage).toMatch(/Do not stop after one follow-up\./);
    expect(homepage).toMatch(/Got an open crew day\?/);
    expect(homepage).toMatch(/Mark the wins\. See what came back\./);
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

describe("quote detail command panel (unified next-move source of truth)", () => {
  it("derives the command panel from computeNextMove — the shared single source", () => {
    expect(recoveryViewModel).toMatch(/const move = computeNextMove\(/);
    expect(quoteDetail).toContain("buildRecoveryPlanViewModel");
    expect(quoteDetail).toContain("<CommandActionPanel");
    expect(quoteDetail).toContain("<CommandActionPanel viewModel={viewModel} />");
    expect(quoteDetail).toContain('data-testid="quote-command-panel"');
  });

  it("queued email mode: command panel uses contractor-facing command wording while Quiet Signal keeps the shared move", () => {
    expect(recoveryViewModel).toContain("function buildInstruction");
    expect(recoveryViewModel).toContain("recommendedMove:");
    expect(quoteDetail).toContain("viewModel.currentInstruction");
    expect(quoteDetail).not.toMatch(/Nothing to send by hand/);
  });

  it("dominant action is the existing safe Send today button plus Copy", () => {
    expect(quoteDetail).toMatch(
      /<SendEarlyButton[\s\S]*variant="primary"[\s\S]*size="lg"[\s\S]*fullWidth/,
    );
    expect(quoteDetail).toContain(
      '<CopyButton text={viewModel.copyMessage} label="Copy"',
    );
  });

  it("future follow-ups are collapsed but still rendered in the 5-message plan", () => {
    expect(recoveryViewModel).toContain("5-message recovery plan");
    expect(quoteDetail).toContain('data-followup-collapsed="true"');
    expect(quoteDetail).toContain("<details");
    expect(quoteDetail).toMatch(/viewModel\.sequenceCards\.map/);
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

  it("Day 14 v3 is tightened to one concrete decision-bridge offer", () => {
    expect(SEQUENCE_VARIANTS[14][3](VARS)).toBe(
      "Jane, if the roofing estimate is still worth discussing, I can walk through just the part holding it up. Want me to?",
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

describe("paywall body channel honesty", () => {
  it("frames the message plan without broad auto-send claims", () => {
    expect(paywall).toMatch(/message plan for email, phone, SMS, and WhatsApp/);
    expect(paywall).toMatch(/No guarantee of recovered revenue/);
    expect(paywall).not.toMatch(/follows\s+up by email automatically\./);
    expect(paywall).not.toMatch(/automatically sends|auto-send|sent by\s+SMS|sent by\s+WhatsApp/i);
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
