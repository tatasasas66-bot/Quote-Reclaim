/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import {
  classifyReply,
  classifyReplyHeuristic,
  isReplyIntent,
  REPLY_INTENTS,
  type ReplyIntent,
} from "@/lib/ai/classify-reply";
import { suggestResponse } from "@/lib/ai/suggest-response";
import { ReplyRadarCard, type ReplyRadarData } from "@/components/quotes/ReplyRadarCard";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const inboundRoute = readSource("../app/api/webhooks/twilio/inbound/route.ts");
const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const suggestSrc = readSource("../lib/ai/suggest-response.ts");

beforeEach(() => {
  // Force the deterministic heuristic path (no fast model configured).
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("AI_FAST_PROVIDER", "groq");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// classifyReply / classifyReplyHeuristic
// ---------------------------------------------------------------------------

const KNOWN_PHRASES: Array<{ text: string; intent: ReplyIntent }> = [
  { text: "Yes, let's get it on the schedule", intent: "positive" },
  { text: "Sounds good, when can you start?", intent: "positive" },
  { text: "Honestly that quote is too expensive for us right now", intent: "price_objection" },
  { text: "That's a bit more than we budgeted for", intent: "price_objection" },
  { text: "I need some time to think it over", intent: "needs_time" },
  { text: "Can you check back in a few weeks? Not ready yet", intent: "needs_time" },
  { text: "We've decided to go with someone else, thanks", intent: "not_interested" },
  { text: "No thanks, we're not interested", intent: "not_interested" },
  { text: "What kind of warranty comes with the new roof?", intent: "question" },
  { text: "How long will the whole job take?", intent: "question" },
];

describe("classifyReplyHeuristic", () => {
  for (const { text, intent } of KNOWN_PHRASES) {
    it(`maps "${text}" -> ${intent}`, () => {
      expect(classifyReplyHeuristic(text)).toBe(intent);
    });
  }

  it("returns null when nothing matches", () => {
    expect(classifyReplyHeuristic("asdf qwerty zzz")).toBeNull();
    expect(classifyReplyHeuristic("")).toBeNull();
  });
});

describe("classifyReply (no fast model -> heuristic, never throws)", () => {
  for (const { text, intent } of KNOWN_PHRASES) {
    it(`classifies "${text}" as ${intent}`, async () => {
      await expect(classifyReply(text)).resolves.toBe(intent);
    });
  }
});

// ---------------------------------------------------------------------------
// suggestResponse
// ---------------------------------------------------------------------------

describe("suggestResponse", () => {
  const base = { trade: "Roofing", estimateAmount: 8500, clientName: "jane harris" };

  it("returns intent-appropriate copy for each of the 5 intents", () => {
    const price = suggestResponse({ ...base, intent: "price_objection" });
    expect(price.message.toLowerCase()).toMatch(/walk through|phasing|driving/);
    expect(price.tactic).toMatch(/Voss/);

    const time = suggestResponse({ ...base, intent: "needs_time" });
    expect(time.message.toLowerCase()).toMatch(/time you need|hold your slot/);
    expect(time.tactic.toLowerCase()).toMatch(/takeaway/);

    const question = suggestResponse({ ...base, intent: "question" });
    expect(question.message.toLowerCase()).toMatch(/straight answer/);

    const positive = suggestResponse({ ...base, intent: "positive" });
    expect(positive.message.toLowerCase()).toMatch(/schedule/);
    expect(positive.tactic.toLowerCase()).toMatch(/momentum/);

    const closed = suggestResponse({ ...base, intent: "not_interested" });
    expect(closed.message.toLowerCase()).toMatch(/close it out|close it/);
    expect(closed.tactic.toLowerCase()).toMatch(/graceful/);
  });

  it("every intent's message is under 300 chars and has no exclamation", () => {
    for (const intent of REPLY_INTENTS) {
      const out = suggestResponse({ ...base, intent });
      expect(out.message.length).toBeLessThan(300);
      expect(out.message).not.toMatch(/!/);
      expect(out.message).not.toMatch(/\bbid\b/i);
    }
  });

  it("never suggests leading with a discount on a price objection", () => {
    const price = suggestResponse({ ...base, intent: "price_objection" });
    expect(price.message.toLowerCase()).not.toMatch(/\b\d+% off\b|discount\b/);
  });

  it("personalizes with the client's first name where natural", () => {
    const positive = suggestResponse({ ...base, intent: "positive" });
    expect(positive.message).toContain("Jane");
  });

  it("color-codes each intent with a distinct tone", () => {
    const tones = REPLY_INTENTS.map((i) => suggestResponse({ ...base, intent: i }).tone);
    expect(new Set(tones).size).toBe(REPLY_INTENTS.length);
    expect(suggestResponse({ ...base, intent: "positive" }).tone).toBe("success");
    expect(suggestResponse({ ...base, intent: "price_objection" }).tone).toBe("warning");
    expect(suggestResponse({ ...base, intent: "not_interested" }).tone).toBe("danger");
  });
});

describe("isReplyIntent", () => {
  it("accepts the five known intents and rejects others", () => {
    for (const i of REPLY_INTENTS) expect(isReplyIntent(i)).toBe(true);
    expect(isReplyIntent("angry")).toBe(false);
    expect(isReplyIntent(null)).toBe(false);
    expect(isReplyIntent(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ReplyRadarCard — renders only when a classified reply exists (C3 + C4)
// ---------------------------------------------------------------------------

function makeData(intent: ReplyIntent): ReplyRadarData {
  return {
    clientName: "Jane Harris",
    replyText: "That's more than we budgeted for",
    suggestion: suggestResponse({
      intent,
      trade: "Roofing",
      estimateAmount: 8500,
      clientName: "Jane Harris",
    }),
  };
}

describe("ReplyRadarCard", () => {
  it("renders nothing when there is no classified reply", () => {
    const { container } = render(React.createElement(ReplyRadarCard, { reply: null }));
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText(/Reply Radar/i)).toBeNull();
  });

  it("renders the intent, suggested response, copy button, and tactic when a reply exists", () => {
    const data = makeData("price_objection");
    render(React.createElement(ReplyRadarCard, { reply: data }));

    // Headline "{Name} replied — {label}"
    expect(screen.getByText(/Jane Harris replied/)).toBeTruthy();
    expect(screen.getByText(/a price concern/)).toBeTruthy();
    // The customer's reply is quoted
    expect(screen.getByText(/more than we budgeted/)).toBeTruthy();
    // Suggested response + copy affordance
    expect(screen.getByText(data.suggestion.message)).toBeTruthy();
    expect(screen.getByText("Copy response")).toBeTruthy();
    // Why this works
    expect(screen.getByText(/Why this works:/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Integration wiring (source-level)
// ---------------------------------------------------------------------------

describe("inbound webhook classifies replies (C1)", () => {
  it("imports and calls classifyReply", () => {
    expect(inboundRoute).toContain("classifyReply");
  });

  it("stores the classification on the reply_received event via reply_intent", () => {
    expect(inboundRoute).toMatch(/reply_intent:\s*replyIntent/);
    expect(inboundRoute).toMatch(
      /event_type:\s*"reply_received"[\s\S]*?reply_intent/,
    );
  });
});

describe("quote detail page renders Reply Radar (C3)", () => {
  it("imports the card, the intent guard, and the suggestion engine", () => {
    expect(detailPage).toContain("ReplyRadarCard");
    expect(detailPage).toContain("isReplyIntent");
    expect(detailPage).toContain("suggestResponse");
  });

  it("reads the latest classified reply_received event for the quote", () => {
    expect(detailPage).toMatch(/event_type[\s\S]*?reply_received/);
    expect(detailPage).toContain("reply_intent");
  });

  it("mounts the card unconditionally (the component self-gates on null)", () => {
    expect(detailPage).toMatch(/<ReplyRadarCard reply=\{replyRadar\}/);
  });
});

describe("suggest-response keeps contractor voice", () => {
  it("declares the 300-char / no-exclamation contract in its doc", () => {
    expect(suggestSrc).toMatch(/Under 300 chars, no exclamation/);
  });
});
