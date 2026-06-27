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
import {
  buildAuditResultCta,
  capitalizeDisplayMessage,
} from "@/app/audit/audit-presentation";
import { runSilentQuoteAudit } from "@/lib/audit/silent-quote-audit";

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
  fireEvent.change(screen.getByLabelText(/quote #1 amount/i), {
    target: { value: amount },
  });
  if (days) {
    fireEvent.change(screen.getByLabelText(/quote #1 days quiet/i), {
      target: { value: days },
    });
  }
}

function fillThreeQuotes() {
  fireEvent.change(screen.getByLabelText(/quote #1 amount/i), {
    target: { value: "2500" },
  });
  fireEvent.change(screen.getByLabelText(/quote #1 days quiet/i), {
    target: { value: "10" },
  });
  fireEvent.change(screen.getByLabelText(/quote #2 amount/i), {
    target: { value: "5000" },
  });
  fireEvent.change(screen.getByLabelText(/quote #2 days quiet/i), {
    target: { value: "12" },
  });
  fireEvent.change(screen.getByLabelText(/quote #3 amount/i), {
    target: { value: "7000" },
  });
  fireEvent.change(screen.getByLabelText(/quote #3 days quiet/i), {
    target: { value: "5" },
  });
}

const pageSrc = readSource("../app/audit/page.tsx");
const clientSrc = readSource("../app/audit/AuditCalculatorClient.tsx");
const resultSrc = readSource("../app/audit/AuditResultView.tsx");
const replySrc = readSource("../app/audit/AuditReplyPlaybook.tsx");
const orderSrc = readSource("../app/audit/AuditFollowUpOrder.tsx");
const faqSrc = readSource("../app/audit/AuditFaq.tsx");
const presentationSrc = readSource("../app/audit/audit-presentation.ts");
const allAuditSrc = [
  pageSrc,
  clientSrc,
  resultSrc,
  replySrc,
  orderSrc,
  faqSrc,
  presentationSrc,
].join("\n");

afterEach(cleanup);

describe("/audit static landing page shell", () => {
  it("renders the rebuilt hero and form above the fold", () => {
    render(<AuditPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Find the old quote worth texting before you buy another lead\./i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Silent Quote Recovery Diagnostic/i),
    ).toBeTruthy();
    expect(screen.getAllByText(/money still quiet/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("audit-form-card")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Show me which quote to text first/i,
      }),
    ).toBeTruthy();
    expect(screen.getAllByText(/No phone numbers/i).length).toBeGreaterThan(0);
  });

  it("uses contractor-native sunk-cost and lead-buying language", () => {
    render(<AuditPage />);
    const pageText = document.body.textContent ?? "";
    expect(pageText).toMatch(/home-service contractors/i);
    expect(pageText).toMatch(/drove out/i);
    expect(pageText).toMatch(/measured it/i);
    expect(pageText).toMatch(/priced/i);
    expect(pageText).toMatch(/buying another lead/i);
    expect(pageText).toMatch(/sent folder/i);
  });

  it("keeps the page lightweight: no auth, Supabase, dashboard, billing, or fake support imports", () => {
    expect(pageSrc).not.toMatch(/requireUser/);
    expect(pageSrc).not.toMatch(/supabase/i);
    expect(pageSrc).not.toMatch(/createServerSupabaseClient|createServiceSupabaseClient/);
    expect(pageSrc).not.toMatch(/from "@\/app\/\(app\)\/dashboard/);
    expect(pageSrc).not.toMatch(/PADDLE_|checkout|webhook/i);
    expect(pageSrc).not.toMatch(/phone support|call us|fake/i);
  });

  it("includes the pain reframe and simple process before the result", () => {
    render(<AuditPage />);
    expect(
      screen.getByRole("heading", {
        name: /Follow-up feels like rejection/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: /One quote\. One message\. One next move\./i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: /3 quiet quotes in\. One first move out\./i,
      }),
    ).toBeTruthy();
  });

  it("does not show fake proof or unavailable integrations", () => {
    const both = allAuditSrc;
    expect(both).not.toMatch(/trusted by|testimonial|case study|5-star|5 star/i);
    expect(both).not.toMatch(/integrates with|ServiceTitan|Jobber|Housecall/i);
    expect(both).not.toMatch(/automatically sends|guaranteed|10x/i);
  });
});

describe("/audit mobile responsiveness guardrails", () => {
  it("keeps the public shell from using desktop-only widths on mobile", () => {
    expect(pageSrc).toMatch(/max-w-\[100dvw\]/);
    expect(pageSrc).toMatch(/overflow-x-hidden/);
    expect(pageSrc).toMatch(/min-w-0/);
    expect(pageSrc).toMatch(/break-words/);
    expect(pageSrc).toMatch(/grid-cols-2[\s\S]*sm:grid-cols-4/);
    expect(pageSrc).not.toMatch(/w-\[(?:5|6|7|8|9)\d{2}px\]/);
    expect(pageSrc).not.toMatch(/min-w-\[(?:5|6|7|8|9)\d{2}px\]/);
  });

  it("keeps quote amount and days quiet fields responsive", () => {
    expect(clientSrc).toMatch(
      /grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-\[minmax\(0,1fr\)_minmax\(8rem,0\.6fr\)\] lg:grid-cols-1/,
    );
    expect(clientSrc).toMatch(/h-12 w-full max-w-full min-w-0 rounded-lg/);
  });

  it("allows long audit CTAs, examples, and result cards to wrap instead of clipping", () => {
    expect(clientSrc).toMatch(
      /data-testid="audit-submit"[\s\S]{0,180}h-auto min-h-14 whitespace-normal/,
    );
    expect(clientSrc).toMatch(/max-w-full whitespace-normal break-words/);
    expect(resultSrc).toMatch(
      /data-testid="audit-result"[\s\S]{0,240}max-w-full min-w-0/,
    );
    expect(resultSrc).toMatch(/whitespace-pre-wrap break-words/);
  });
});

describe("audit form - safe to try", () => {
  it("renders exactly quote amount + days quiet fields for three rows", () => {
    render(<AuditCalculatorClient />);
    expect(screen.getAllByLabelText(/quote #\d amount/i)).toHaveLength(3);
    expect(screen.getAllByLabelText(/quote #\d days quiet/i)).toHaveLength(3);
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
    fireEvent.click(screen.getByRole("button", { name: /load sample quotes/i }));
    expect(
      (screen.getByLabelText(/quote #1 amount/i) as HTMLInputElement).value,
    ).toBe("3200");
    expect(
      (screen.getByLabelText(/quote #2 days quiet/i) as HTMLInputElement).value,
    ).toBe("24");
    expect(screen.queryByTestId("audit-signup-cta")).toBeNull();
  });

  it("updates the live quiet-money total and recovery windows before submit", () => {
    render(<AuditCalculatorClient />);
    fillThreeQuotes();
    expect(screen.getByTestId("audit-live-total").textContent).toContain(
      "$14,500",
    );
    expect(screen.getAllByText(/^Warm$/i).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("audit-result")).toBeNull();
  });

  it("shows every existing recovery window badge live before submit", () => {
    render(<AuditCalculatorClient />);
    const amount = screen.getByLabelText(/quote #1 amount/i);
    const days = screen.getByLabelText(/quote #1 days quiet/i);
    fireEvent.change(amount, { target: { value: "5000" } });

    for (const [dayValue, label] of [
      ["5", "Warm"],
      ["14", "Cooling"],
      ["30", "Cold"],
      ["60", "Closeout"],
    ]) {
      fireEvent.change(days, { target: { value: dayValue } });
      expect(screen.getByText(new RegExp(`^${label}$`, "i"))).toBeTruthy();
    }
  });

  it("reminds partial entries that one quote is enough", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "14");
    expect(
      screen.getByText(
        /One quote is enough for a recovery move\. Two or three make the ranking sharper\./i,
      ),
    ).toBeTruthy();
  });

  it("shows friendly validation only after submit", () => {
    render(<AuditCalculatorClient />);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
    expect(screen.getByRole("alert").textContent).toMatch(
      /Enter at least one quiet quote to see your first move/i,
    );
    expect(screen.queryByTestId("audit-result")).toBeNull();
  });

  it("flags invalid days copy without blocking on one valid estimate amount", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "two weeks");
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
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
        name: /show me which quote to text first/i,
      }),
    ).toBeTruthy();
    expect(screen.queryByTestId("audit-signup-cta")).toBeNull();
  });

  it("shows analysis before the result and scrolls once to the output", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote();
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
    expect(screen.getByTestId("audit-analysis")).toBeTruthy();
    expect(screen.queryByTestId("audit-result")).toBeNull();
    expect(screen.getByTestId("audit-analysis-step").textContent).toMatch(
      /Counting the money still quiet/i,
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
        name: /show me which quote to text first/i,
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
        name: /show me which quote to text first/i,
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
    fireEvent.change(screen.getByLabelText(/quote #1 amount/i), {
      target: { value: "$8,500" },
    });
    fireEvent.change(screen.getByLabelText(/quote #1 days quiet/i), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/quote #2 amount/i), {
      target: { value: "4000" },
    });
    fireEvent.change(screen.getByLabelText(/quote #2 days quiet/i), {
      target: { value: "20" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
    runFullAnalysis();

    const result = screen.getByTestId("audit-result");
    expect(result.textContent).toMatch(/Your 60-second estimate audit/i);
    expect(result.textContent).toMatch(/Money still quiet/i);
    expect(result.textContent).toContain("$12,500");
    expect(result.textContent).toMatch(/The first quote to reopen/i);
    expect(result.textContent).toMatch(/Recovery window/i);
    expect(result.textContent).toMatch(/Why this one first/i);
    expect(result.textContent).toMatch(/What the silence probably means/i);
    expect(result.textContent).toMatch(/Message to send today/i);
    expect(result.textContent).toMatch(/Next follow-up order/i);
    expect(result.textContent).toMatch(/If they reply/i);
    expect(result.textContent).toMatch(/What happens after today's text/i);
    expect(result.textContent).toMatch(/Don't let Quote #1 go Cold/i);
    expect(screen.getByTestId("audit-reply-playbook")).toBeTruthy();
    expect(screen.getByTestId("audit-product-preview")).toBeTruthy();
  });

  it("shows one reply branch fully and locks the other four behind the same free signup path", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "14");
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
    runFullAnalysis();

    const freeBranch = screen.getByTestId("audit-reply-free");
    expect(freeBranch.textContent).toMatch(/Still interested/i);
    expect(freeBranch.textContent).toMatch(/don't over-talk it/i);
    expect(freeBranch.textContent).toMatch(/here's the link to pick back up/i);

    for (const id of [
      "price-concern",
      "bad-timing",
      "need-to-talk",
      "went-another-way",
    ]) {
      const locked = screen.getByTestId(`audit-reply-locked-${id}`);
      expect(locked.getAttribute("href")).toContain("reason=reply-branches");
    }
    expect(screen.queryByText(/Clarify scope before discounting/i)).toBeNull();
    expect(screen.getByTestId("audit-reply-unlock-cta").textContent).toMatch(
      /Unlock all 5 replies/i,
    );
  });

  it("keeps the cadence visible but replaces the full day-3 message with a teaser", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "14");
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
    runFullAnalysis();

    const moves = screen.getByTestId("audit-next-moves");
    expect(moves.textContent).toMatch(/Send today/i);
    expect(moves.textContent).toMatch(/Day 3 follow-up/i);
    expect(moves.textContent).toMatch(/Day 7 closeout/i);
    expect(moves.textContent).toMatch(/It's 2 sentences/i);
    expect(moves.textContent).not.toMatch(
      /one last thing before I close the estimate out/i,
    );
    expect(screen.getByTestId("audit-follow-up-unlock").getAttribute("href")).toContain(
      "reason=follow-up",
    );
  });

  it("opens the hard FAQ objections and adds the missing questions after the product preview", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "14");
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
    runFullAnalysis();

    const faq = screen.getByTestId("audit-faq");
    const crm = screen.getByText("Is this another CRM?").closest("details");
    const every = screen
      .getByText("Will every old quote come back?")
      .closest("details");
    expect((crm as HTMLDetailsElement).open).toBe(true);
    expect((every as HTMLDetailsElement).open).toBe(true);
    expect(faq.textContent).toMatch(/What if I only have one quiet estimate/i);
    expect(faq.textContent).toMatch(/What happens after the free audit/i);
    expect(faq.textContent).toMatch(/Why not just buy more leads/i);
    expect(
      screen.getByTestId("audit-product-preview").compareDocumentPosition(faq) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      faq.compareDocumentPosition(screen.getByTestId("audit-goes-deeper")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("uses count-aware intro copy for one, two, and three quotes", () => {
    const cases = [
      {
        fill: () => fillFirstQuote("5000", "14"),
        expected: /You entered one quiet quote/i,
      },
      {
        fill: () => {
          fillFirstQuote("5000", "14");
          fireEvent.change(screen.getByLabelText(/quote #2 amount/i), {
            target: { value: "3500" },
          });
          fireEvent.change(screen.getByLabelText(/quote #2 days quiet/i), {
            target: { value: "9" },
          });
        },
        expected: /You entered two quiet quotes/i,
      },
      {
        fill: fillThreeQuotes,
        expected: /It turns three quiet quotes into one next action/i,
      },
    ];

    for (const testCase of cases) {
      const view = render(<AuditCalculatorClient />);
      testCase.fill();
      fireEvent.click(
        screen.getByRole("button", {
          name: /show me which quote to text first/i,
        }),
      );
      runFullAnalysis();
      expect(screen.getByTestId("audit-result-intro").textContent).toMatch(
        testCase.expected,
      );
      view.unmount();
    }
  });

  it("preserves Quote #3 as the first warm recommendation for the regression input", () => {
    render(<AuditCalculatorClient />);
    fillThreeQuotes();
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
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
    expect(startHere.textContent).toMatch(/5 days quiet/i);
    expect(startHere.textContent).toMatch(/Warm/i);
    expect(result.textContent).toMatch(/still fresh/i);
  });

  it("renders all entered quotes in the follow-up order with contractor actions", () => {
    render(<AuditCalculatorClient />);
    fillThreeQuotes();
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
    runFullAnalysis();

    const order = screen.getByTestId("audit-follow-up-order");
    expect(order.textContent).toContain("Quote #1");
    expect(order.textContent).toContain("Quote #2");
    expect(order.textContent).toContain("Quote #3");
    expect(order.textContent).toMatch(/Send today/);
    expect(order.textContent).toMatch(/Work next/);
    expect(screen.getByTestId("audit-rank-row-1")).toBeTruthy();
    expect(screen.getByTestId("audit-rank-row-2")).toBeTruthy();
    expect(screen.getByTestId("audit-rank-row-3")).toBeTruthy();
  });

  it("shows the signup CTA only after the result and preserves the auth route", () => {
    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "");
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
    expect(screen.queryByTestId("audit-signup-cta")).toBeNull();
    runFullAnalysis();
    const cta = screen.getByTestId("audit-signup-cta");
    expect(cta.textContent).toMatch(/Save the next move for this quote/i);
    expect(cta.getAttribute("href")).toMatch(/^\/sign-up\?next=/);
    expect(cta.getAttribute("href")).toContain("reason=result-cta");
    expect(cta.getAttribute("href")).toContain("lead_quote=1");
  });

  it("capitalizes the displayed message while copying the original text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "20");
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
    runFullAnalysis();

    const displayed = screen.getByTestId("audit-display-message").textContent ?? "";
    expect(displayed.charAt(0)).toBe(displayed.charAt(0).toUpperCase());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy message/i }));
    });
    const copiedMessage = String(writeText.mock.calls[0]?.[0]);
    expect(copiedMessage).toMatch(/estimate/i);
    expect(copiedMessage.charAt(0)).toBe(copiedMessage.charAt(0).toUpperCase());
    expect(screen.getByRole("button", { name: /Copied/i })).toBeTruthy();
  });

  it("opens the SMS app with only the original message body and no recipient", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<AuditCalculatorClient />);
    fillFirstQuote("5000", "20");
    fireEvent.click(
      screen.getByRole("button", {
        name: /show me which quote to text first/i,
      }),
    );
    runFullAnalysis();

    fireEvent.click(screen.getByRole("button", { name: /Open in SMS/i }));
    expect(open).toHaveBeenCalledTimes(1);
    const smsUrl = String(open.mock.calls[0]?.[0]);
    expect(smsUrl).toMatch(/^sms:\?&body=/);
    expect(smsUrl).not.toMatch(/(?:to|phone|recipient)=/i);
    open.mockRestore();
  });
});

describe("audit result CTA window math", () => {
  it("uses the priority quote number, amount, window, and days until Cold", () => {
    const audit = runSilentQuoteAudit([
      { amountRaw: "8500", daysSilentRaw: "14" },
    ]);
    const cta = buildAuditResultCta(
      audit.priority!,
      "/sign-up?next=%2Fonboarding%2Freveal",
    );
    expect(cta.headline).toBe("Don't let Quote #1 go Cold.");
    expect(cta.urgency).toContain("$8,500");
    expect(cta.urgency).toContain("Cooling");
    expect(cta.urgency).toContain("8 days");
    expect(cta.daysUntilCold).toBe(8);
    expect(cta.href).toContain("reason=result-cta");
    expect(cta.href).toContain("lead_quote=1");
  });

  it("uses truthful Warm, Cold, and Closeout variants", () => {
    const cases = [
      {
        days: "5",
        headline: /still Warm/i,
        button: /Save the next move/i,
      },
      {
        days: "30",
        headline: /already Cold/i,
        button: /clean reopen and closeout/i,
      },
      {
        days: "60",
        headline: /in Closeout/i,
        button: /respectful closeout/i,
      },
    ];

    for (const item of cases) {
      const audit = runSilentQuoteAudit([
        { amountRaw: "5000", daysSilentRaw: item.days },
      ]);
      const cta = buildAuditResultCta(
        audit.priority!,
        "/sign-up?next=%2Fonboarding%2Freveal",
      );
      expect(cta.headline).toMatch(item.headline);
      expect(cta.button).toMatch(item.button);
    }
  });

  it("capitalizes display copy without changing the original", () => {
    expect(capitalizeDisplayMessage("quick check")).toBe("Quick check");
    expect("quick check").toBe("quick check");
  });
});

describe("copy and positioning guardrails", () => {
  const both = allAuditSrc.toLowerCase();

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
  it("fires the documented audit funnel and conversion-loop events only", () => {
    expect(clientSrc).toContain('track("audit_page_viewed"');
    expect(clientSrc).toContain('track("audit_started"');
    expect(clientSrc).toContain('track("audit_completed"');
    expect(clientSrc).toContain('track("audit_signup_clicked"');
    expect(clientSrc).toContain('track("audit_reply_branch_unlock_clicked"');
    expect(clientSrc).toContain('track("audit_follow_up_unlock_clicked"');
    expect(clientSrc).toContain('track("audit_result_cta_clicked"');
    expect(clientSrc).toContain('track("audit_open_in_sms_clicked"');
    expect(clientSrc).toContain('track("audit_faq_expanded"');

    const trackCalls = clientSrc.match(/track\("([a-z_]+)"/g) ?? [];
    const names = new Set(
      trackCalls.map((s) => /track\("([a-z_]+)"/.exec(s)?.[1] ?? ""),
    );
    expect(Array.from(names).sort()).toEqual([
      "audit_completed",
      "audit_faq_expanded",
      "audit_follow_up_unlock_clicked",
      "audit_open_in_sms_clicked",
      "audit_page_viewed",
      "audit_reply_branch_unlock_clicked",
      "audit_result_cta_clicked",
      "audit_signup_clicked",
      "audit_started",
      "sms_opened",
      "whatsapp_opened",
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
