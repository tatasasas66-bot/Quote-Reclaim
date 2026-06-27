// @vitest-environment happy-dom

import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplyForm } from "@/app/reply/[token]/ReplyForm";
import { OneTapReplyCard } from "@/components/quotes/OneTapReplyCard";

const submitOneTapReply = vi.fn();
const createOneTapLinkForQuote = vi.fn();

vi.mock("@/app/reply/[token]/actions", () => ({
  submitOneTapReply: (...args: unknown[]) => submitOneTapReply(...args),
}));

vi.mock("@/app/(app)/quotes/[id]/one-tap-actions", () => ({
  createOneTapLinkForQuote: (...args: unknown[]) =>
    createOneTapLinkForQuote(...args),
}));

afterEach(cleanup);

beforeEach(() => {
  submitOneTapReply.mockReset();
  createOneTapLinkForQuote.mockReset();
  submitOneTapReply.mockResolvedValue({
    ok: true,
    kind: "interested",
    contractorFirstName: "Sam",
  });
});

describe("ReplyForm playbook alignment", () => {
  const choices = [
    ["Let's do it — what's next?", "interested"],
    ["Price is the hold-up", "price_concern"],
    ["Timing's off", "bad_timing"],
    ["Can we talk?", "need_to_talk"],
    ["Went another way", "went_another_way"],
  ] as const;

  it("renders exactly the five customer choices", () => {
    render(<ReplyForm token="token-123" />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    for (const [label] of choices) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  for (const [label, answerType] of choices) {
    it(`maps ${label} to ${answerType}`, async () => {
      render(<ReplyForm token="token-123" />);
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() =>
        expect(submitOneTapReply).toHaveBeenCalledWith({
          token: "token-123",
          answerType,
        }),
      );
    });
  }
});

describe("contractor One-Tap next move", () => {
  it("shows the exact price-concern response from the Reply Playbook", () => {
    render(
      <OneTapReplyCard
        quoteId="quote-1"
        clientFirstName="Taylor"
        trade="Concrete"
        latestReply={{
          id: "reply-1",
          answerType: "price_concern",
          questionText: null,
          selectedOptionId: null,
          createdAt: "2026-06-27T00:00:00.000Z",
        }}
      />,
    );
    expect(screen.getAllByText(/Price is the hold-up/i)).toHaveLength(2);
    expect(screen.getByText(/pick the piece that fits/i)).toBeTruthy();
  });

  it("copies a fresh reply link without exposing custom extra choices", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    createOneTapLinkForQuote.mockResolvedValue({
      ok: true,
      data: { url: "https://www.quotereclaim.com/reply/token" },
    });

    render(
      <OneTapReplyCard
        quoteId="quote-1"
        clientFirstName="Taylor"
        trade="Concrete"
        latestReply={null}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Copy One-Tap Reply link/i }),
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://www.quotereclaim.com/reply/token",
      ),
    );
    expect(
      screen.queryByRole("button", { name: /Manage reply options/i }),
    ).toBeNull();
  });
});
