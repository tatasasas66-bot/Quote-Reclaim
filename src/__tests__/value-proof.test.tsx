/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecoveryWindowAlert } from "@/components/dashboard/RecoveryWindowAlert";
import { WinMomentOverlay } from "@/components/dashboard/WinMomentOverlay";

const SRC_ROOT = join(process.cwd(), "src");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Recovery Window Alert — "Do This Today" directive frame
// ---------------------------------------------------------------------------

describe("RecoveryWindowAlert (Do This Today)", () => {
  function renderAlert(score: number) {
    return render(
      <RecoveryWindowAlert
        quoteId="q1"
        amount={8500}
        trade="Roofing"
        clientName="jane doe"
        daysSilent={9}
        score={score}
      />,
    );
  }

  it("renders the 'DO THIS TODAY' eyebrow", () => {
    renderAlert(60);
    expect(screen.getByText("DO THIS TODAY")).toBeTruthy();
  });

  it("names the client to work first and shows the real quote context", () => {
    const { container } = renderAlert(60);
    const text = container.textContent ?? "";
    expect(text).toContain("Work Jane Doe first.");
    expect(text).toContain("days quiet");
  });

  it("CTA reads 'Work this quote'", () => {
    renderAlert(60);
    expect(screen.getByText(/Work this quote/)).toBeTruthy();
  });

  it("maps the recovery score to an urgency label", () => {
    const critical = renderAlert(40);
    expect(critical.container.textContent).toContain("Critical");
    cleanup();
    const atRisk = renderAlert(60);
    expect(atRisk.container.textContent).toContain("At Risk");
  });
});

// ---------------------------------------------------------------------------
// 2. Win Moment overlay — dopamine math + dismiss safety
// ---------------------------------------------------------------------------

describe("WinMomentOverlay", () => {
  it("shows the months-paid math when the win covers ≤24 months", () => {
    const { container } = render(
      <WinMomentOverlay amount={1000} allTimeRecovered={0} onDismiss={vi.fn()} />,
    );
    // floor(1000 / 79) = 12 -> still inside the 24-month natural range.
    expect(container.textContent).toContain("for 12 months");
    expect(container.textContent).toContain("+$1,000");
  });

  it("flips to annual-multiple phrasing above 24 months — no comedic 'X months' line", () => {
    const { container } = render(
      <WinMomentOverlay amount={5000} allTimeRecovered={0} onDismiss={vi.fn()} />,
    );
    // floor(5000 / 948) = 5 -> "5x over for a full year"
    // The raw 102-month phrasing the old code produced read as silly and
    // argued against monthly renewal; the annual frame stays believable.
    expect(container.textContent).toContain("5x over for a full year");
    expect(container.textContent).not.toContain("63 months");
    expect(container.textContent).toContain("+$5,000");
  });

  it("a $12,000 win never produces the comedic 244-month line", () => {
    const { container } = render(
      <WinMomentOverlay amount={12000} allTimeRecovered={0} onDismiss={vi.fn()} />,
    );
    // floor(12000 / 948) = 12 -> "12x over for a full year"
    expect(container.textContent).toContain("12x over for a full year");
    expect(container.textContent).not.toContain("244 months");
    expect(container.textContent).not.toMatch(/\d{3,} months/);
  });

  it("a sub-$79 win renders a humble line, never '0 months'", () => {
    const { container } = render(
      <WinMomentOverlay amount={40} allTimeRecovered={0} onDismiss={vi.fn()} />,
    );
    expect(container.textContent).toContain("This one job is on the board.");
    expect(container.textContent).not.toContain("0 months");
  });

  it("adds the win to lifetime recovered", () => {
    const { container } = render(
      <WinMomentOverlay
        amount={5000}
        allTimeRecovered={12000}
        onDismiss={vi.fn()}
      />,
    );
    // 12000 + 5000 = 17000
    expect(container.textContent).toContain("$17,000");
  });

  it("does NOT dismiss on click before 2000ms (animation safety)", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { container } = render(
      <WinMomentOverlay amount={5000} allTimeRecovered={0} onDismiss={onDismiss} />,
    );
    const overlay = container.firstChild as HTMLElement;

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(overlay);
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(600); // now past 2000ms
    });
    fireEvent.click(overlay);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("never auto-dismisses before 3000ms but does by 4000ms", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <WinMomentOverlay amount={5000} allTimeRecovered={0} onDismiss={onDismiss} />,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000); // total 4000ms
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 3. "Why this works" rationale on the sequence detail page
// ---------------------------------------------------------------------------

describe("Sequence detail 'Why this works' rationale", () => {
  const detailPage = readFileSync(
    join(SRC_ROOT, "app/(app)/quotes/[id]/page.tsx"),
    "utf8",
  );

  it("renders the 'Why this works:' label", () => {
    expect(detailPage).toContain("Why this works:");
  });

  it("provides distinct rationale for all five follow-up steps", () => {
    // Day 1 — fresh estimate, one clear question
    expect(detailPage).toMatch(/still fresh, so one clear question is easier to answer/);
    // Day 3 — decision friction categories
    expect(detailPage).toMatch(/It gives the homeowner simple categories to answer with/);
    // Day 7 — scope rescue, NO claim that price is the stall reason
    expect(detailPage).toMatch(/If total cost or scope is the blocker, a smaller path gives them a way back/);
    // Day 14 — open, revise, or close
    expect(detailPage).toMatch(/It turns silence into a simple status choice: keep open, revise, or close/);
    expect(detailPage).not.toMatch(/stall on price/i);
    // Day 30 — clean closeout, door stays open
    expect(detailPage).toMatch(/removes the awkwardness of saying no while leaving the door open/);
  });

  it("keys the rationale by follow-up number", () => {
    expect(detailPage).toMatch(/WHY_THIS_WORKS\[r\.followup_number/);
  });
});
