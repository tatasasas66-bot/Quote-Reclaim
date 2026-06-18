/**
 * @vitest-environment happy-dom
 *
 * /audit cold landing page — funnel + copy guardrails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import * as React from "react";

import AuditPage from "@/app/audit/page";
import {
  AuditCalculatorClient,
  ANALYSIS_STEPS,
  ANALYSIS_STEP_MS_DEFAULT,
  ANALYSIS_STEP_MS_REDUCED,
} from "@/app/audit/AuditCalculatorClient";

function setMatchMedia(reduced: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: reduced && /reduce/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

function fillFirstQuote(amount = "5000", days = "20") {
  fireEvent.change(screen.getByLabelText(/quote #1 amount/i), {
    target: { value: amount },
  });
  if (days) {
    fireEvent.change(screen.getAllByLabelText(/days since you sent it/i)[0], {
      target: { value: days },
    });
  }
}

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const pageSrc = readSource("../app/audit/page.tsx");
const clientSrc = readSource("../app/audit/AuditCalculatorClient.tsx");

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Lightweight + no-auth contract
// ---------------------------------------------------------------------------

describe("/audit is a lightweight, no-auth landing page", () => {
  it("renders the hero (with eyebrow) without requiring auth", () => {
    render(<AuditPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /You already did the work on these quotes\. Don.t let the money go quiet\./i,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/^For home-service contractors$/i)).toBeTruthy();
  });

  it("shows a clearly-labeled EXAMPLE result before the form (not a real case)", () => {
    render(<AuditPage />);
    // The example block is labeled, and tagged 'Sample' so it can't read as
    // real proof / a real customer case study.
    expect(screen.getByText(/Example audit result/i)).toBeTruthy();
    expect(screen.getByText(/^Sample$/i)).toBeTruthy();
    expect(screen.getByText(/\$8,200/)).toBeTruthy();
  });

  it("renders the FAQ (Is this a CRM? / customer names / cost)", () => {
    render(<AuditPage />);
    expect(screen.getByText(/Is this a CRM\?/i)).toBeTruthy();
    expect(screen.getByText(/Do I need customer names\?/i)).toBeTruthy();
    expect(screen.getByText(/What does it cost\?/i)).toBeTruthy();
  });

  it("the page imports NO auth / Supabase / dashboard code", () => {
    expect(pageSrc).not.toMatch(/requireUser/);
    expect(pageSrc).not.toMatch(/supabase/i);
    expect(pageSrc).not.toMatch(/createServerSupabaseClient|createServiceSupabaseClient/);
    expect(pageSrc).not.toMatch(/from "@\/app\/\(app\)\/dashboard/);
    // No nav menu above the fold (brand mark only).
    expect(pageSrc).not.toMatch(/<nav/);
  });

  it("does not query Supabase or read env secrets in the client island", () => {
    expect(clientSrc).not.toMatch(/supabase/i);
    expect(clientSrc).not.toMatch(/SERVICE_ROLE|PADDLE_|WEBHOOK_SECRET/);
  });
});

// ---------------------------------------------------------------------------
// Funnel: value BEFORE signup
// ---------------------------------------------------------------------------

describe("funnel — value first, signup only after the result", () => {
  const SUBMIT = /show me which quote to chase first/i;

  let scrollSpy: ReturnType<typeof vi.fn>;
  let realRaf: typeof window.requestAnimationFrame;

  beforeEach(() => {
    setMatchMedia(false); // normal motion by default
    vi.useFakeTimers(); // default set — paces the analysis setTimeouts
    // happy-dom doesn't implement scrollIntoView — install a spy.
    scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    // Run the on-submit scroll rAF synchronously so it's observable without
    // touching React's scheduler (faking rAF via toFake breaks event dispatch).
    realRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof window.requestAnimationFrame;
  });

  afterEach(() => {
    window.requestAnimationFrame = realRaf;
    vi.useRealTimers();
  });

  function runFullAnalysis() {
    // Advance through every analysis step + the final reveal.
    act(() => {
      vi.advanceTimersByTime(ANALYSIS_STEP_MS_DEFAULT * ANALYSIS_STEPS.length + 1);
    });
  }

  it("does NOT show a validation error on initial load (only after submit)", () => {
    render(<AuditCalculatorClient />);
    expect(
      screen.queryByText(/Enter at least one old quote amount/i),
    ).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the initial primary action is the audit, NOT signup", () => {
    render(<AuditCalculatorClient />);
    expect(screen.getByRole("button", { name: SUBMIT })).toBeTruthy();
    expect(screen.queryByTestId("audit-signup-cta")).toBeNull();
  });

  it("shows the analysis state BEFORE the result", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    // Immediately after submit: analysis visible, result not yet.
    expect(screen.getByTestId("audit-analysis")).toBeTruthy();
    expect(screen.queryByTestId("audit-result")).toBeNull();
    // The first analysis step is visible.
    expect(
      screen.getByTestId("audit-analysis-step").textContent,
    ).toMatch(/Totaling your quiet quotes/i);
    runFullAnalysis();
  });

  it("scrolls to the output container immediately on submit — BEFORE the result", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    // Flush the on-submit rAF (faked) without finishing the analysis.
    act(() => {
      vi.advanceTimersByTime(20);
    });
    // Scroll already happened while the analysis is still running.
    expect(scrollSpy).toHaveBeenCalled();
    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth", block: "start" }),
    );
    expect(screen.getByTestId("audit-analysis")).toBeTruthy();
    expect(screen.queryByTestId("audit-result")).toBeNull();
    runFullAnalysis();
    expect(screen.getByTestId("audit-result")).toBeTruthy();
  });

  it("does NOT do a second scroll when the result reveals (one scroll only)", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    const callsAfterSubmit = scrollSpy.mock.calls.length;
    runFullAnalysis();
    // Result revealed in the same anchored container — no extra scroll.
    expect(scrollSpy.mock.calls.length).toBe(callsAfterSubmit);
  });

  it("uses non-smooth 'auto' scroll under prefers-reduced-motion", () => {
    setMatchMedia(true);
    render(<AuditCalculatorClient />);
    fillFirstQuote();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto", block: "start" }),
    );
    act(() => {
      vi.advanceTimersByTime(
        ANALYSIS_STEP_MS_REDUCED * ANALYSIS_STEPS.length + 50,
      );
    });
  });

  it("analysis state lasts ~3.5s in normal motion (5 steps × ~700ms)", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    // Just before the final tick → still analyzing, result not shown.
    act(() => {
      vi.advanceTimersByTime(
        ANALYSIS_STEP_MS_DEFAULT * ANALYSIS_STEPS.length - 50,
      );
    });
    expect(screen.queryByTestId("audit-result")).toBeNull();
    expect(screen.getByTestId("audit-analysis")).toBeTruthy();
    // Cross the final tick → result revealed.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByTestId("audit-result")).toBeTruthy();
    expect(screen.queryByTestId("audit-analysis")).toBeNull();
    // Sanity-check the spec budget: total ≈ 3.5s, never more than 4s.
    expect(ANALYSIS_STEP_MS_DEFAULT * ANALYSIS_STEPS.length).toBeLessThanOrEqual(
      4000,
    );
    expect(ANALYSIS_STEP_MS_DEFAULT * ANALYSIS_STEPS.length).toBeGreaterThanOrEqual(
      3000,
    );
  });

  it("shortens to ~700-900ms under prefers-reduced-motion", () => {
    setMatchMedia(true);
    render(<AuditCalculatorClient />);
    fillFirstQuote();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    // Past the reduced budget → result shown.
    act(() => {
      vi.advanceTimersByTime(
        ANALYSIS_STEP_MS_REDUCED * ANALYSIS_STEPS.length + 50,
      );
    });
    expect(screen.getByTestId("audit-result")).toBeTruthy();
    const reducedTotal = ANALYSIS_STEP_MS_REDUCED * ANALYSIS_STEPS.length;
    expect(reducedTotal).toBeGreaterThanOrEqual(700);
    expect(reducedTotal).toBeLessThanOrEqual(900);
  });

  it("shows 'Your audit is ready.' + the full restructured result", () => {
    render(<AuditCalculatorClient />);
    fireEvent.change(screen.getByLabelText(/quote #1 amount/i), {
      target: { value: "$8,500" },
    });
    fireEvent.change(screen.getAllByLabelText(/days since you sent it/i)[0], {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/quote #2 amount/i), {
      target: { value: "4000" },
    });
    fireEvent.change(screen.getAllByLabelText(/days since you sent it/i)[1], {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    runFullAnalysis();

    const result = screen.getByTestId("audit-result");
    expect(result.textContent).toMatch(/Your audit is ready/i);
    expect(result.textContent).toContain("$12,500");
    expect(result.textContent).toMatch(/sitting in your quiet quotes/i);
    expect(result.textContent).toMatch(/Start with Quote #/i);

    // Recovery-window labels for Warm + Cooling appear on the right rows.
    const order = screen.getByTestId("audit-follow-up-order");
    expect(order.textContent).toMatch(/Warm/);
    expect(order.textContent).toMatch(/Cooling/);

    // Priority labels show in the ranked list.
    expect(order.textContent).toMatch(/Follow up first/);
    expect(order.textContent).toMatch(/Next backup/);

    // The new explanatory sections render.
    expect(screen.getByTestId("audit-why-order")).toBeTruthy();
    expect(screen.getByTestId("audit-next-moves")).toBeTruthy();
    expect(screen.getByTestId("audit-sequence-preview")).toBeTruthy();
    expect(result.textContent).toMatch(/Send this today\. Keep it short/);
    expect(result.textContent).toMatch(/5-message follow-up sequence/);
    // "This audit shows where to start" + depth-layer body sit BETWEEN the
    // sequence preview and the signup CTA — framing Pro as the next layer.
    const goesDeeper = screen.getByTestId("audit-goes-deeper");
    expect(goesDeeper.textContent).toMatch(/This audit shows where to start\./);
    expect(goesDeeper.textContent).toMatch(
      /Quote Reclaim goes deeper after you save it/,
    );
    expect(goesDeeper.textContent).toMatch(
      /today, in 3 days, and after 7 days/,
    );
    const previewIdx = result.textContent!.indexOf("5-message follow-up sequence");
    const deeperIdx = result.textContent!.indexOf("This audit shows where to start");
    const ctaIdx = result.textContent!.indexOf(
      "Save this audit and run your first 3 quotes free",
    );
    expect(previewIdx).toBeGreaterThan(-1);
    expect(deeperIdx).toBeGreaterThan(previewIdx);
    expect(ctaIdx).toBeGreaterThan(deeperIdx);
  });

  it("renders every entered quote in the follow-up order", () => {
    render(<AuditCalculatorClient />);
    fireEvent.change(screen.getByLabelText(/quote #1 amount/i), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getByLabelText(/quote #2 amount/i), {
      target: { value: "8500" },
    });
    fireEvent.change(screen.getByLabelText(/quote #3 amount/i), {
      target: { value: "4000" },
    });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    runFullAnalysis();

    const order = screen.getByTestId("audit-follow-up-order");
    expect(order.textContent).toContain("Quote #1");
    expect(order.textContent).toContain("Quote #2");
    expect(order.textContent).toContain("Quote #3");
    expect(screen.getByTestId("audit-rank-row-1")).toBeTruthy();
    expect(screen.getByTestId("audit-rank-row-2")).toBeTruthy();
    expect(screen.getByTestId("audit-rank-row-3")).toBeTruthy();
  });

  it("renders the Cold label for a 31+ day quote", () => {
    render(<AuditCalculatorClient />);
    fireEvent.change(screen.getByLabelText(/quote #1 amount/i), {
      target: { value: "6000" },
    });
    fireEvent.change(screen.getAllByLabelText(/days since you sent it/i)[0], {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    runFullAnalysis();
    expect(screen.getByTestId("audit-follow-up-order").textContent).toMatch(
      /Cold/,
    );
  });

  it("keeps Quote #3 warm and first for 2500/10, 5000/12, 7000/5", () => {
    render(<AuditCalculatorClient />);
    fireEvent.change(screen.getByLabelText(/quote #1 amount/i), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getAllByLabelText(/days since you sent it/i)[0], {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/quote #2 amount/i), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getAllByLabelText(/days since you sent it/i)[1], {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText(/quote #3 amount/i), {
      target: { value: "7000" },
    });
    fireEvent.change(screen.getAllByLabelText(/days since you sent it/i)[2], {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    runFullAnalysis();

    const result = screen.getByTestId("audit-result");
    const startHere = screen.getByTestId("audit-start-here");
    const rankOne = screen.getByTestId("audit-rank-row-1");

    expect(startHere.textContent).toMatch(/Start with Quote #3/i);
    expect(screen.getByTestId("audit-start-window-badge").textContent).toMatch(
      /^Warm$/i,
    );
    expect(rankOne.textContent).toMatch(/Quote #3/);
    expect(rankOne.textContent).toMatch(/Warm/);
    expect(result.textContent).not.toMatch(/sent(?:Warm|Cooling|Cold)/i);
    expect(result.textContent).toMatch(/most money at stake/i);
  });

  it("shows the post-value account CTA only after the result appears", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "");
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    // Mid-analysis: no CTA yet.
    expect(screen.queryByTestId("audit-signup-cta")).toBeNull();
    runFullAnalysis();
    const cta = screen.getByTestId("audit-signup-cta");
    expect(cta).toBeTruthy();
    expect(cta.textContent).toMatch(
      /Save this audit and run your first 3 quotes free/i,
    );
    expect(cta.getAttribute("href")).toMatch(/^\/sign-up\?next=/);
  });

  it("shows a friendly validation message ONLY after submitting empty (no analysis)", () => {
    render(<AuditCalculatorClient />);
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    expect(
      screen.getByText(/Enter at least one old quote amount to see your audit\./i),
    ).toBeTruthy();
    expect(screen.queryByTestId("audit-analysis")).toBeNull();
    expect(screen.queryByTestId("audit-result")).toBeNull();
  });

  it("uses the 'Days since you sent it' label, not 'Days silent'", () => {
    render(<AuditCalculatorClient />);
    expect(screen.getAllByLabelText(/days since you sent it/i).length).toBe(3);
    expect(screen.queryByLabelText(/^days silent$/i)).toBeNull();
  });

  it("does not collect any customer name / email / phone field", () => {
    render(<AuditCalculatorClient />);
    expect(screen.queryByLabelText(/^name$/i)).toBeNull();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByLabelText(/phone/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Copy guardrails
// ---------------------------------------------------------------------------

describe("copy guardrails", () => {
  const both = `${pageSrc}\n${clientSrc}`.toLowerCase();

  it("contains no banned hype phrases", () => {
    for (const banned of [
      "guaranteed",
      "ai-powered",
      "hidden profit",
      "pure profit",
      "10x",
      "turn quotes into cash",
      "reclaimable revenue",
      "statistically recoverable",
    ]) {
      expect(both).not.toContain(banned);
    }
  });

  it("uses NO fabricated percentages or fake success-rate claims", () => {
    // No "%" anywhere in the audit UI copy. Real product data doesn't exist
    // yet — we can't claim reply rates, win rates, or odds of any kind.
    expect(clientSrc).not.toMatch(/%/);
    expect(both).not.toMatch(
      /\b(reply rate|win rate|conversion rate|recovery rate|odds|high odds|most replies happen)\b/,
    );
  });

  it("includes the required honest framing phrases", () => {
    // Whitespace-tolerant: JSX wraps these phrases across source lines.
    expect(both).toMatch(/no signup until you see the result/);
    expect(both).toMatch(/no customer names/);
    expect(both).toMatch(/no card/);
    expect(both).toMatch(/not a crm/);
    expect(both).toMatch(/not\s+lead\s+generation/);
  });

  it("uses the upgraded hero + eyebrow + pain line + CTA + trust line", () => {
    expect(pageSrc).toContain("For home-service contractors");
    expect(pageSrc).toContain(
      "You already did the work on these quotes.",
    );
    expect(pageSrc).toContain(
      "Out of your last 10 quotes, how many never replied?",
    );
    expect(clientSrc).toContain("Show me which quote to chase first");
    expect(clientSrc).toContain(
      "First 3 free. No signup until you see the result. No card.",
    );
    expect(clientSrc).toMatch(
      /we don&apos;t need customer names for the\s+audit/,
    );
  });

  it("does not use painter-only copy in the main public funnel", () => {
    expect(both).not.toMatch(
      /\b(for painting contractors|painting quotes|painting quote|painting estimate|old painting quotes|silent painting quotes)\b/,
    );
  });

  it("the example card is clearly a sample (no fake real-customer framing)", () => {
    expect(pageSrc).toContain("Example audit result");
    expect(pageSrc).toMatch(/Sample/);
    // No fake-proof / case-study language.
    expect(pageSrc.toLowerCase()).not.toContain("case study");
    expect(pageSrc.toLowerCase()).not.toContain("real customer");
  });
});

// ---------------------------------------------------------------------------
// Analytics events wired (vendor-agnostic, no new vendor)
// ---------------------------------------------------------------------------

describe("analytics events are wired without adding a vendor in /audit", () => {
  it("fires the four funnel events from the client", () => {
    expect(clientSrc).toContain('track("audit_page_viewed"');
    expect(clientSrc).toContain('track("audit_started"');
    expect(clientSrc).toContain('track("audit_completed"');
    expect(clientSrc).toContain('track("audit_signup_clicked"');
  });

  it("uses the internal vendor-agnostic track helper, not a new SDK import", () => {
    expect(clientSrc).toContain('from "@/lib/analytics/track"');
    // The client must NOT import posthog-js directly (lazy-loaded by the
    // provider in the root layout instead, keeping /audit lightweight).
    expect(clientSrc).not.toMatch(/from ["']posthog-js["']/);
    expect(clientSrc).not.toMatch(/from ["'][^"']*googletagmanager[^"']*["']/);
    expect(clientSrc).not.toMatch(/from ["'][^"']*segment[^"']*["']/);
  });

  it("NEVER sends raw quote dollar amounts (privacy)", () => {
    // The bucketed field replaces a raw 'total'. Anything that would expose
    // the dollar figure verbatim is banned.
    expect(clientSrc).toContain("total_silent_quote_value_bucket");
    expect(clientSrc).toContain("bucketCurrency");
    expect(clientSrc).not.toMatch(/total:\s*audit\.totalSilentQuoteValue/);
    // No customer-identifying field names anywhere in the audit emit.
    expect(clientSrc).not.toMatch(/(client_name|client_email|customer_email|customer_name|phone|address)/i);
  });

  it("attaches captured UTMs to every funnel event", () => {
    expect(clientSrc).toContain('readUtms(window.location.search)');
    // audit_page_viewed, audit_started, audit_completed, audit_signup_clicked
    // each receive `utms` (or the captured set) as the props payload.
    expect(clientSrc).toMatch(/track\("audit_page_viewed", captured\)/);
    expect(clientSrc).toMatch(/track\("audit_started", utms\)/);
    expect(clientSrc).toMatch(/track\("audit_completed",[\s\S]*?\.\.\.utms/);
    expect(clientSrc).toMatch(/track\("audit_signup_clicked", utms\)/);
  });

  it("exposes ONLY the four documented event names — no new events from the analysis state", () => {
    const trackCalls = clientSrc.match(/track\("([a-z_]+)"/g) ?? [];
    const names = new Set(
      trackCalls.map((s) => /track\("([a-z_]+)"/.exec(s)?.[1] ?? ""),
    );
    expect(Array.from(names).sort()).toEqual([
      "audit_completed",
      "audit_page_viewed",
      "audit_signup_clicked",
      "audit_started",
    ]);
  });
});
