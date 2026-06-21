/**
 * @vitest-environment happy-dom
 *
 * /audit cold landing page - conversion UX, value-before-signup, and privacy
 * guardrails.
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

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

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
  fireEvent.change(screen.getByLabelText(/estimate #1 amount/i), {
    target: { value: amount },
  });
  if (days) {
    fireEvent.change(screen.getByLabelText(/estimate #1 days quiet/i), {
      target: { value: days },
    });
  }
}

function fillThreeQuotes() {
  fireEvent.change(screen.getByLabelText(/estimate #1 amount/i), {
    target: { value: "2500" },
  });
  fireEvent.change(screen.getByLabelText(/estimate #1 days quiet/i), {
    target: { value: "10" },
  });
  fireEvent.change(screen.getByLabelText(/estimate #2 amount/i), {
    target: { value: "5000" },
  });
  fireEvent.change(screen.getByLabelText(/estimate #2 days quiet/i), {
    target: { value: "12" },
  });
  fireEvent.change(screen.getByLabelText(/estimate #3 amount/i), {
    target: { value: "7000" },
  });
  fireEvent.change(screen.getByLabelText(/estimate #3 days quiet/i), {
    target: { value: "5" },
  });
}

const pageSrc = readSource("../app/audit/page.tsx");
const clientSrc = readSource("../app/audit/AuditCalculatorClient.tsx");

afterEach(cleanup);

describe("/audit static landing page shell", () => {
  it("renders the rebuilt hero and form above the fold", () => {
    render(<AuditPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Before buying another lead, check the estimates you already sent\./i,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Free 60-second estimate audit/i)).toBeTruthy();
    expect(screen.getAllByText(/total quiet estimate value/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("audit-form-card")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Show me which estimate to follow up first/i,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/^No phone$/i)).toBeTruthy();
  });

  it("explains who it is for without making the product painters-only", () => {
    render(<AuditPage />);
    const pageText = document.body.textContent ?? "";
    expect(pageText).toMatch(/home-service contractors/i);
    expect(pageText).toMatch(/painting/i);
    expect(pageText).toMatch(/remodeling/i);
    expect(pageText).toMatch(/roofing/i);
    expect(pageText).toMatch(/HVAC/i);
    expect(pageText).toMatch(/landscaping/i);
  });

  it("keeps the page lightweight: no auth, Supabase, dashboard, billing, or fake support imports", () => {
    expect(pageSrc).not.toMatch(/requireUser/);
    expect(pageSrc).not.toMatch(/supabase/i);
    expect(pageSrc).not.toMatch(/createServerSupabaseClient|createServiceSupabaseClient/);
    expect(pageSrc).not.toMatch(/from "@\/app\/\(app\)\/dashboard/);
    expect(pageSrc).not.toMatch(/PADDLE_|checkout|webhook/i);
    expect(pageSrc).not.toMatch(/phone support|call us|fake/i);
  });

  it("includes lower-page trust, how-it-works, straight-answer, and final CTA sections", () => {
    render(<AuditPage />);
    expect(screen.getByRole("heading", { name: /Clear enough to trust/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /A quick priority check/i })).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: /What contractors usually need to know first/i,
      }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Run the audit$/i })).toBeTruthy();
  });

  it("does not show fake proof or unavailable integrations", () => {
    const both = `${pageSrc}\n${clientSrc}`;
    expect(both).not.toMatch(/trusted by|testimonial|case study|5-star|5 star/i);
    expect(both).not.toMatch(/integrates with|ServiceTitan|Jobber|Housecall/i);
    expect(both).not.toMatch(/automatically sends|guaranteed|10x/i);
  });
});

describe("/audit mobile responsiveness guardrails", () => {
  it("keeps the public shell from using desktop-only widths on mobile", () => {
    expect(pageSrc).toMatch(/max-w-full/);
    expect(pageSrc).toMatch(/min-w-0/);
    expect(pageSrc).toMatch(/break-words/);
    expect(pageSrc).toMatch(/grid-cols-2[\s\S]*sm:grid-cols-4/);
    expect(pageSrc).not.toMatch(/w-\[(?:5|6|7|8|9)\d{2}px\]/);
    expect(pageSrc).not.toMatch(/min-w-\[(?:5|6|7|8|9)\d{2}px\]/);
  });

  it("stacks estimate amount and days quiet fields before the small breakpoint", () => {
    expect(clientSrc).toMatch(
      /grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-\[minmax\(0,1fr\)_minmax\(9rem,0\.55fr\)\]/,
    );
    expect(clientSrc).toMatch(/h-12 w-full max-w-full min-w-0 rounded-lg/);
  });

  it("allows long audit CTAs, examples, and result cards to wrap instead of clipping", () => {
    expect(clientSrc).toMatch(
      /data-testid="audit-submit"[\s\S]{0,160}h-auto min-h-12 whitespace-normal/,
    );
    expect(clientSrc).toMatch(/max-w-full whitespace-normal break-words/);
    expect(clientSrc).toMatch(/data-testid="audit-result"[\s\S]{0,220}max-w-full min-w-0/);
    expect(clientSrc).toMatch(/whitespace-pre-wrap break-words/);
  });
});

describe("audit form - safe to try", () => {
  it("renders exactly estimate amount + days quiet fields for three rows", () => {
    render(<AuditCalculatorClient />);
    expect(screen.getAllByLabelText(/estimate #\d amount/i)).toHaveLength(3);
    expect(screen.getAllByLabelText(/estimate #\d days quiet/i)).toHaveLength(3);
    expect(screen.getByPlaceholderText("3200")).toBeTruthy();
    expect(screen.getByPlaceholderText("14")).toBeTruthy();
    expect(screen.getByPlaceholderText("5800")).toBeTruthy();
    expect(screen.getByPlaceholderText("24")).toBeTruthy();
    expect(screen.getByPlaceholderText("2400")).toBeTruthy();
    expect(screen.getByPlaceholderText("7")).toBeTruthy();
  });

  it("does not collect customer name, phone, email, company, address, or card", () => {
    render(<AuditCalculatorClient />);
    expect(screen.queryByLabelText(/^name$/i)).toBeNull();
    expect(screen.queryByLabelText(/customer/i)).toBeNull();
    expect(screen.queryByLabelText(/phone/i)).toBeNull();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByLabelText(/company/i)).toBeNull();
    expect(screen.queryByLabelText(/address/i)).toBeNull();
    expect(screen.queryByLabelText(/card/i)).toBeNull();
  });

  it("loads sample numbers without showing a signup wall", () => {
    render(<AuditCalculatorClient />);
    fireEvent.click(screen.getByRole("button", { name: /try sample numbers/i }));
    expect(
      (screen.getByLabelText(/estimate #1 amount/i) as HTMLInputElement).value,
    ).toBe("3200");
    expect(
      (screen.getByLabelText(/estimate #2 days quiet/i) as HTMLInputElement).value,
    ).toBe("24");
    expect(screen.queryByTestId("audit-signup-cta")).toBeNull();
  });

  it("shows friendly validation only after submit", () => {
    render(<AuditCalculatorClient />);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    );
    expect(screen.getByRole("alert").textContent).toMatch(
      /Enter an estimate amount/i,
    );
    expect(screen.queryByTestId("audit-result")).toBeNull();
  });

  it("flags invalid days copy without blocking on one valid estimate amount", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "two weeks");
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    );
    expect(screen.getByRole("alert").textContent).toMatch(
      /Use numbers only for days quiet/i,
    );
  });
});

describe("funnel - value before signup", () => {
  let scrollSpy: ReturnType<typeof vi.fn>;
  let realRaf: typeof window.requestAnimationFrame;

  beforeEach(() => {
    setMatchMedia(false);
    vi.useFakeTimers();
    scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
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
    act(() => {
      vi.advanceTimersByTime(ANALYSIS_STEP_MS_DEFAULT * ANALYSIS_STEPS.length + 1);
    });
  }

  it("initial primary action is the audit, not signup", () => {
    render(<AuditCalculatorClient />);
    expect(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    ).toBeTruthy();
    expect(screen.queryByTestId("audit-signup-cta")).toBeNull();
  });

  it("shows analysis before the result and scrolls once to the output", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote();
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    );
    expect(screen.getByTestId("audit-analysis")).toBeTruthy();
    expect(screen.queryByTestId("audit-result")).toBeNull();
    expect(screen.getByTestId("audit-analysis-step").textContent).toMatch(
      /Totaling your quiet estimates/i,
    );
    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth", block: "start" }),
    );
    const callsAfterSubmit = scrollSpy.mock.calls.length;
    runFullAnalysis();
    expect(screen.getByTestId("audit-result")).toBeTruthy();
    expect(scrollSpy.mock.calls.length).toBe(callsAfterSubmit);
  });

  it("uses non-smooth scroll and shorter timing under reduced motion", () => {
    setMatchMedia(true);
    render(<AuditCalculatorClient />);
    fillFirstQuote();
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    );
    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto", block: "start" }),
    );
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

  it("normal analysis lasts roughly 3.5 seconds", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote();
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(
        ANALYSIS_STEP_MS_DEFAULT * ANALYSIS_STEPS.length - 50,
      );
    });
    expect(screen.queryByTestId("audit-result")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByTestId("audit-result")).toBeTruthy();
    expect(ANALYSIS_STEP_MS_DEFAULT * ANALYSIS_STEPS.length).toBe(3500);
  });

  it("shows the full diagnostic result after valid input", () => {
    render(<AuditCalculatorClient />);
    fireEvent.change(screen.getByLabelText(/estimate #1 amount/i), {
      target: { value: "$8,500" },
    });
    fireEvent.change(screen.getByLabelText(/estimate #1 days quiet/i), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/estimate #2 amount/i), {
      target: { value: "4000" },
    });
    fireEvent.change(screen.getByLabelText(/estimate #2 days quiet/i), {
      target: { value: "20" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    );
    runFullAnalysis();

    const result = screen.getByTestId("audit-result");
    expect(result.textContent).toMatch(/Your 60-second estimate audit/i);
    expect(result.textContent).toMatch(/Total quiet estimate value/i);
    expect(result.textContent).toContain("$12,500");
    expect(result.textContent).toMatch(/Follow up this estimate first/i);
    expect(result.textContent).toMatch(/Recovery window/i);
    expect(result.textContent).toMatch(/Why this one first/i);
    expect(result.textContent).toMatch(/Message to send today/i);
    expect(result.textContent).toMatch(/Follow-up order/i);
    expect(result.textContent).toMatch(/Next move/i);
    expect(result.textContent).toMatch(/Save this recovery plan/i);
  });

  it("preserves Estimate #3 as the first warm recommendation for the regression input", () => {
    render(<AuditCalculatorClient />);
    fillThreeQuotes();
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    );
    runFullAnalysis();

    const result = screen.getByTestId("audit-result");
    const startHere = screen.getByTestId("audit-start-here");
    const rankOne = screen.getByTestId("audit-rank-row-1");

    expect(startHere.textContent).toMatch(/Start with Estimate #3/i);
    expect(screen.getByTestId("audit-start-window-badge").textContent).toMatch(
      /^Warm$/i,
    );
    expect(rankOne.textContent).toMatch(/Estimate #3/);
    expect(rankOne.textContent).toMatch(/Warm/);
    expect(result.textContent).not.toMatch(/quiet(?:Warm|Cooling|Cold)/i);
    expect(result.textContent).toMatch(/most money at stake/i);
  });

  it("renders all entered quotes in the follow-up order with contractor actions", () => {
    render(<AuditCalculatorClient />);
    fillThreeQuotes();
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    );
    runFullAnalysis();

    const order = screen.getByTestId("audit-follow-up-order");
    expect(order.textContent).toContain("Estimate #1");
    expect(order.textContent).toContain("Estimate #2");
    expect(order.textContent).toContain("Estimate #3");
    expect(order.textContent).toMatch(/Send today/);
    expect(order.textContent).toMatch(/Follow up next/);
    expect(screen.getByTestId("audit-rank-row-1")).toBeTruthy();
    expect(screen.getByTestId("audit-rank-row-2")).toBeTruthy();
    expect(screen.getByTestId("audit-rank-row-3")).toBeTruthy();
  });

  it("shows the signup CTA only after the result and preserves the auth route", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "");
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    );
    expect(screen.queryByTestId("audit-signup-cta")).toBeNull();
    runFullAnalysis();
    const cta = screen.getByTestId("audit-signup-cta");
    expect(cta.textContent).toMatch(/Save this recovery plan/i);
    expect(cta.getAttribute("href")).toMatch(/^\/sign-up\?next=/);
  });

  it("copy button writes the suggested message when clipboard is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "20");
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which estimate to follow up first/i,
      }),
    );
    runFullAnalysis();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copy$/i }));
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/estimate/i),
    );
    expect(screen.getByRole("button", { name: /Copied/i })).toBeTruthy();
  });
});

describe("copy and positioning guardrails", () => {
  const both = `${pageSrc}\n${clientSrc}`.toLowerCase();

  it("contains no banned hype or fake proof phrases", () => {
    for (const banned of [
      "guaranteed",
      "ai-powered",
      "hidden profit",
      "pure profit",
      "10x",
      "turn quotes into cash",
      "reclaimable revenue",
      "statistically recoverable",
      "trusted by",
      "case study",
      "fake phone",
    ]) {
      expect(both).not.toContain(banned);
    }
  });

  it("does not use fabricated percentages or success-rate claims", () => {
    expect(clientSrc).not.toMatch(/%/);
    expect(both).not.toMatch(
      /\b(reply rate|win rate|conversion rate|recovery rate|odds|high odds|most replies happen)\b/,
    );
  });

  it("uses the required honest framing phrases", () => {
    expect(both).toMatch(/before buying another lead/);
    expect(both).toMatch(/estimates you already sent/);
    expect(both).toMatch(/no customer names/);
    expect(both).toMatch(/no phone numbers/);
    expect(both).toMatch(/no card/);
    expect(both).toMatch(/no signup before result/);
    expect(both).toMatch(/not a crm/);
    expect(both).toMatch(/not lead generation/);
  });

  it("positions as quiet estimate prioritization, not CRM, lead gen, scheduling, or estimate creation", () => {
    expect(both).toMatch(/quiet estimates/);
    expect(both).toMatch(/follow up first/);
    expect(both).toMatch(/message to send today/);
    expect(both).toMatch(/home-service contractors/);
    expect(both).not.toMatch(
      /project management|estimate creation|lead generation software|all-in-one scheduling|dispatch software/,
    );
    expect(both).not.toMatch(/jobber|housecall|servicetitan|integrates with/i);
  });
});

describe("analytics events are preserved without a new vendor", () => {
  it("fires the four documented audit funnel events only", () => {
    expect(clientSrc).toContain('track("audit_page_viewed"');
    expect(clientSrc).toContain('track("audit_started"');
    expect(clientSrc).toContain('track("audit_completed"');
    expect(clientSrc).toContain('track("audit_signup_clicked"');

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

  it("uses the internal track helper, not a new analytics SDK", () => {
    expect(clientSrc).toContain('from "@/lib/analytics/track"');
    expect(clientSrc).not.toMatch(/from ["']posthog-js["']/);
    expect(clientSrc).not.toMatch(/from ["'][^"']*segment[^"']*["']/);
    expect(clientSrc).not.toMatch(/from ["'][^"']*googletagmanager[^"']*["']/);
  });

  it("keeps UTM handling across every funnel event", () => {
    expect(clientSrc).toContain("readUtms(window.location.search)");
    expect(clientSrc).toMatch(/track\("audit_page_viewed", captured\)/);
    expect(clientSrc).toMatch(/track\("audit_started", utms\)/);
    expect(clientSrc).toMatch(/track\("audit_completed",[\s\S]*?\.\.\.utms/);
    expect(clientSrc).toMatch(/track\("audit_signup_clicked", utms\)/);
    expect(clientSrc).toContain("buildSignupHref(window.location.search)");
  });

  it("never sends raw quote values or customer-identifying fields to analytics", () => {
    expect(clientSrc).toContain("total_silent_quote_value_bucket");
    expect(clientSrc).toContain("bucketCurrency");
    expect(clientSrc).not.toMatch(/total:\s*audit\.totalSilentQuoteValue/);
    expect(clientSrc).not.toMatch(/amounts?:\s*rows/);
    expect(clientSrc).not.toMatch(
      /(client_name|client_email|client_phone|customer_email|customer_name|customer_phone|address\s*:)/i,
    );
  });
});
