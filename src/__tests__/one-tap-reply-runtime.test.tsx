/**
 * @vitest-environment happy-dom
 *
 * Runtime tests for the public reply form. Exercises the user-facing buttons
 * end-to-end against a mocked server action so we can assert the rendered
 * copy, the per-button submission payloads, and the gating-failure render
 * path without hitting Supabase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";

import { ReplyForm } from "@/app/reply/[token]/ReplyForm";
import { OneTapReplyCard } from "@/components/quotes/OneTapReplyCard";

type SubmitInput = Parameters<
  typeof import("@/app/reply/[token]/actions").submitOneTapReply
>[0];

type Calls = SubmitInput[];

const calls: Calls = [];
let nextResult: { ok: boolean; payload?: unknown; reason?: string } = {
  ok: true,
  payload: { kind: "interested", contractorFirstName: "Mike" },
};

vi.mock("@/app/reply/[token]/actions", () => ({
  submitOneTapReply: vi.fn(async (input: SubmitInput) => {
    calls.push(input);
    if (nextResult.ok) {
      return {
        ok: true as const,
        ...(nextResult.payload as {
          kind: "interested" | "question" | "not_now" | "option_selected";
          contractorFirstName: string;
        }),
      };
    }
    return { ok: false as const, reason: nextResult.reason ?? "nope" };
  }),
}));

// The card uses a different actions module; mock those too for the
// "Copy link" + options-manager assertions.
vi.mock("@/app/(app)/quotes/[id]/one-tap-actions", () => ({
  createOneTapLinkForQuote: vi.fn(async () => ({
    ok: true,
    data: { url: "https://example.test/reply/AAA" },
  })),
  addReplyOption: vi.fn(async () => ({ ok: true })),
  removeReplyOption: vi.fn(async () => ({ ok: true })),
}));

beforeEach(() => {
  calls.length = 0;
  nextResult = {
    ok: true,
    payload: { kind: "interested", contractorFirstName: "Mike" },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Public reply form
// ---------------------------------------------------------------------------

describe("ReplyForm — primary buttons", () => {
  it("renders the three primary CTAs", () => {
    render(
      React.createElement(ReplyForm, {
        token: "TOK",
        contractorFirstName: "Mike",
        options: [],
      }),
    );
    expect(
      screen.getByRole("button", { name: /Let's do it — what's next\?/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /I have one question/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Not right now/i }),
    ).toBeTruthy();
  });

  it("Interested tap submits answer_type=interested", async () => {
    render(
      React.createElement(ReplyForm, {
        token: "TOK1",
        contractorFirstName: "Mike",
        options: [],
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Let's do it/i }),
    );
    await screen.findByText(/Reply sent/i);
    expect(calls).toEqual([{ token: "TOK1", answerType: "interested" }]);
    expect(
      screen.getByText(
        /Thanks — Mike will follow up with the next step\./,
      ),
    ).toBeTruthy();
  });

  it("Not-right-now tap submits answer_type=not_now", async () => {
    nextResult = {
      ok: true,
      payload: { kind: "not_now", contractorFirstName: "Mike" },
    };
    render(
      React.createElement(ReplyForm, {
        token: "TOK2",
        contractorFirstName: "Mike",
        options: [],
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Not right now/i }),
    );
    await screen.findByText(/Reply sent/i);
    expect(calls).toEqual([{ token: "TOK2", answerType: "not_now" }]);
    expect(
      screen.getByText(/Thanks — we'll let Mike know\./),
    ).toBeTruthy();
  });

  it("Question button opens the textarea + Send-question requires text", async () => {
    nextResult = {
      ok: true,
      payload: { kind: "question", contractorFirstName: "Mike" },
    };
    render(
      React.createElement(ReplyForm, {
        token: "TOK3",
        contractorFirstName: "Mike",
        options: [],
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /I have one question/i }),
    );
    const submit = screen.getByRole("button", { name: /Send question/i });
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.change(
      screen.getByLabelText(/What question do you have\?/i),
      { target: { value: "Can we phase the roof?" } },
    );
    fireEvent.click(submit);
    await screen.findByText(/Reply sent/i);
    expect(calls).toEqual([
      {
        token: "TOK3",
        answerType: "question",
        questionText: "Can we phase the roof?",
      },
    ]);
    expect(
      screen.getByText(/Thanks — your question was sent to Mike\./),
    ).toBeTruthy();
  });

  it("renders the gating-failure copy when the server action returns ok:false", async () => {
    nextResult = { ok: false, reason: "Sorry — this link isn't available anymore." };
    render(
      React.createElement(ReplyForm, {
        token: "TOK4",
        contractorFirstName: "Mike",
        options: [],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Let's do it/i }));
    expect(
      await screen.findByText(/Sorry — this link isn't available anymore\./),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Approved options
// ---------------------------------------------------------------------------

describe("ReplyForm — contractor-approved options", () => {
  const options = [
    {
      id: "opt-1",
      label: "Full job",
      amountCents: 850_000,
      note: null,
      isActive: true,
    },
    {
      id: "opt-2",
      label: "Essentials first",
      amountCents: 500_000,
      note: "Start with the most critical work",
      isActive: true,
    },
  ];

  it("does not render the options section when there are no options", () => {
    render(
      React.createElement(ReplyForm, {
        token: "TOK",
        contractorFirstName: "Mike",
        options: [],
      }),
    );
    expect(screen.queryByText(/Another way to move forward/i)).toBeNull();
  });

  it("renders both options and submits option_selected with the right id", async () => {
    nextResult = {
      ok: true,
      payload: { kind: "option_selected", contractorFirstName: "Mike" },
    };
    render(
      React.createElement(ReplyForm, {
        token: "TOK5",
        contractorFirstName: "Mike",
        options,
      }),
    );
    expect(screen.getByText(/Another way to move forward/i)).toBeTruthy();
    expect(screen.getByText("Full job")).toBeTruthy();
    expect(screen.getByText("Essentials first")).toBeTruthy();
    expect(screen.getByText("$8,500")).toBeTruthy();
    expect(screen.getByText("$5,000")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Essentials first/i }));
    await screen.findByText(/Reply sent/i);
    expect(calls).toEqual([
      {
        token: "TOK5",
        answerType: "option_selected",
        selectedOptionId: "opt-2",
      },
    ]);
    expect(
      screen.getByText(
        /Thanks — Mike will follow up about this option\./,
      ),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Contractor-facing card states
// ---------------------------------------------------------------------------

describe("OneTapReplyCard — contractor states", () => {
  // Not `as const`: the component prop `options` is a mutable `ReplyOption[]`,
  // so the fixture's empty array must stay mutable (`never[]`) rather than
  // becoming `readonly []`.
  const baseProps = {
    quoteId: "q-1",
    clientFirstName: "Jane",
    options: [],
  };

  it("empty state explains the feature and exposes the Copy/Manage actions", () => {
    render(
      React.createElement(OneTapReplyCard, { ...baseProps, latestReply: null }),
    );
    expect(
      screen.getByText(/Turn silence into a yes, a question, or a clean no\./),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Homeowners can reply to this estimate in one tap from the follow-up email\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Copy One-Tap Reply link/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Manage reply options/i }),
    ).toBeTruthy();
  });

  it("interested state surfaces the headline + recommended next move", () => {
    render(
      React.createElement(OneTapReplyCard, {
        ...baseProps,
        latestReply: {
          id: "r1",
          answerType: "interested",
          questionText: null,
          selectedOptionId: null,
          createdAt: new Date().toISOString(),
        },
      }),
    );
    expect(screen.getByText(/Jane tapped/)).toBeTruthy();
    expect(
      screen.getByText(/Call or reply with scheduling options\./),
    ).toBeTruthy();
  });

  it("question state surfaces the verbatim question text", () => {
    render(
      React.createElement(OneTapReplyCard, {
        ...baseProps,
        latestReply: {
          id: "r2",
          answerType: "question",
          questionText: "Can we phase the work?",
          selectedOptionId: null,
          createdAt: new Date().toISOString(),
        },
      }),
    );
    expect(screen.getByText(/Jane asked/)).toBeTruthy();
    expect(screen.getByText(/Can we phase the work\?/)).toBeTruthy();
  });

  it("not_now state recommends closeout (never claims won)", () => {
    render(
      React.createElement(OneTapReplyCard, {
        ...baseProps,
        latestReply: {
          id: "r3",
          answerType: "not_now",
          questionText: null,
          selectedOptionId: null,
          createdAt: new Date().toISOString(),
        },
      }),
    );
    expect(
      screen.getByText(/Close the quote or leave it paused/),
    ).toBeTruthy();
    // Never wins the job from a tap.
    expect(screen.queryByText(/Job Booked/i)).toBeNull();
    expect(screen.queryByText(/Won/)).toBeNull();
  });

  it("option_selected state shows the chosen option label + amount", () => {
    render(
      React.createElement(OneTapReplyCard, {
        ...baseProps,
        options: [
          {
            id: "opt-1",
            label: "Essentials first",
            amountCents: 500_000,
            note: null,
            isActive: true,
          },
        ],
        latestReply: {
          id: "r4",
          answerType: "option_selected",
          questionText: null,
          selectedOptionId: "opt-1",
          createdAt: new Date().toISOString(),
        },
      }),
    );
    expect(screen.getByText(/Jane chose/)).toBeTruthy();
    expect(screen.getByText(/Essentials first — \$5,000/)).toBeTruthy();
  });

  it("rendered DOM never contains banned marketing/manipulation phrases", () => {
    const { container } = render(
      React.createElement(OneTapReplyCard, { ...baseProps, latestReply: null }),
    );
    const text = container.textContent ?? "";
    for (const banned of [
      "One-Tap Close",
      "Job Booked",
      "guaranteed",
      "customer panics",
      "manipulate",
      "force a reply",
      "last chance",
      "urgency",
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});
