/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";

import {
  parseFromEmail,
  stripQuotedReply,
} from "@/lib/messaging/strip-quoted-reply";
import { suggestResponse } from "@/lib/ai/suggest-response";
import {
  ReplyRadarCard,
  type ReplyRadarData,
} from "@/components/quotes/ReplyRadarCard";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const inboundRoute = readSource(
  "../app/api/webhooks/email-inbound/route.ts",
);
const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const cardSrc = readSource("../components/quotes/ReplyRadarCard.tsx");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// stripQuotedReply — keep only the top reply, drop quoted history.
// ---------------------------------------------------------------------------

describe("stripQuotedReply", () => {
  it("keeps just the top reply when Gmail wraps the history in 'On … wrote:'", () => {
    const raw = [
      "Sounds good — let's lock it in.",
      "",
      "On Tue, May 28, 2026 at 9:14 AM, Mike Diaz <mike@quotereclaim.com> wrote:",
      "> Hey Jane — Mike here. Looked back at the roofing estimate.",
      "> Anything on it that didn't make sense?",
    ].join("\n");
    expect(stripQuotedReply(raw)).toBe("Sounds good — let's lock it in.");
  });

  it("strips Outlook-style '-----Original Message-----' blocks", () => {
    const raw = [
      "Honestly that quote is too expensive right now.",
      "",
      "-----Original Message-----",
      "From: Mike Diaz",
      "Sent: Tuesday, May 28, 2026 9:14 AM",
      "Subject: Re: Your roofing estimate",
    ].join("\n");
    expect(stripQuotedReply(raw)).toBe(
      "Honestly that quote is too expensive right now.",
    );
  });

  it("strips an Outlook header block (From:/Sent:) without the dashes", () => {
    const raw = [
      "I need more time to think this over.",
      "",
      "From: Mike Diaz <mike@quotereclaim.com>",
      "Sent: Tuesday, May 28, 2026 9:14 AM",
      "To: Jane Harris",
    ].join("\n");
    expect(stripQuotedReply(raw)).toBe("I need more time to think this over.");
  });

  it("drops lines that start with the '>' quote prefix", () => {
    const raw = [
      "What kind of warranty comes with the new roof?",
      "",
      "> Hey Jane — Mike here.",
      "> Looked back at the roofing estimate.",
    ].join("\n");
    expect(stripQuotedReply(raw)).toBe(
      "What kind of warranty comes with the new roof?",
    );
  });

  it("normalizes CRLF, collapses extra blank lines, and trims", () => {
    const raw = "  yes please \r\n\r\n\r\nlet's schedule it  \r\n";
    expect(stripQuotedReply(raw)).toBe("yes please \n\nlet's schedule it");
  });

  it("caps the reply at 1000 characters", () => {
    const raw = "a".repeat(2000);
    expect(stripQuotedReply(raw).length).toBe(1000);
  });

  it("returns an empty string for null / undefined / empty input", () => {
    expect(stripQuotedReply(null)).toBe("");
    expect(stripQuotedReply(undefined)).toBe("");
    expect(stripQuotedReply("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseFromEmail
// ---------------------------------------------------------------------------

describe("parseFromEmail", () => {
  it("extracts the address out of 'Display Name <addr>'", () => {
    expect(parseFromEmail('"Jane Harris" <Jane@Example.com>')).toBe(
      "jane@example.com",
    );
  });

  it("lowercases bare addresses", () => {
    expect(parseFromEmail("Jane@Example.com")).toBe("jane@example.com");
  });

  it("accepts an object shape { email, name }", () => {
    expect(parseFromEmail({ email: "Jane@Example.com", name: "Jane" })).toBe(
      "jane@example.com",
    );
  });

  it("returns null for malformed values", () => {
    expect(parseFromEmail(null)).toBeNull();
    expect(parseFromEmail(undefined)).toBeNull();
    expect(parseFromEmail("")).toBeNull();
    expect(parseFromEmail("undisclosed-recipients")).toBeNull();
    expect(parseFromEmail("no-at-sign.com")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Source-level wiring guarantees on the inbound endpoint
// ---------------------------------------------------------------------------

describe("email-inbound route reuses the existing reply pipeline", () => {
  it("imports classifyReply from the existing classify-reply module", () => {
    expect(inboundRoute).toMatch(
      /import\s*\{[^}]*classifyReply[^}]*\}\s*from\s*"@\/lib\/ai\/classify-reply"/,
    );
  });

  it("imports suggestResponse from the existing suggest-response module", () => {
    expect(inboundRoute).toMatch(
      /import\s*\{[^}]*suggestResponse[^}]*\}\s*from\s*"@\/lib\/ai\/suggest-response"/,
    );
  });

  it("does NOT re-implement intent classification (no inline intent map)", () => {
    // Guard against a future drift where someone copy-pastes the heuristic
    // into the route. The route should only ever call classifyReply().
    expect(inboundRoute).not.toMatch(/positive["']?\s*:\s*\[/);
    expect(inboundRoute).not.toMatch(/price_objection["']?\s*:\s*\[/);
  });

  it("classifies BEFORE the recovery_events insert (append-only invariant)", () => {
    // classifyReply must appear earlier in the source than .insert(), and the
    // insert payload must carry reply_intent.
    const classifyIdx = inboundRoute.indexOf("classifyReply(");
    const insertIdx = inboundRoute.indexOf('.from("recovery_events").insert');
    expect(classifyIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(0);
    expect(classifyIdx).toBeLessThan(insertIdx);

    expect(inboundRoute).toMatch(/reply_intent:\s*replyIntent/);
    expect(inboundRoute).toMatch(
      /event_type:\s*"reply_received"[\s\S]*?reply_intent/,
    );
  });

  it("tags the event with channel='email' (so Reply Radar can show 'via email')", () => {
    expect(inboundRoute).toMatch(/channel:\s*"email"/);
  });

  it("matches the inbound to a quote by client_email (case-insensitive)", () => {
    expect(inboundRoute).toMatch(/\.ilike\("client_email"/);
    expect(inboundRoute).toMatch(/\.neq\("outcome",\s*"won"\)/);
  });

  it("prefers the candidate quote with an active (unpaused, unsent) reminder", () => {
    // The secondary query against reminders is what implements the "active
    // sequence" preference from the spec.
    expect(inboundRoute).toMatch(
      /\.from\("reminders"\)[\s\S]*?\.eq\("sent",\s*false\)[\s\S]*?\.is\("paused_at",\s*null\)/,
    );
  });

  it("200-acks when no candidate quote matches the from-address", () => {
    expect(inboundRoute).toMatch(
      /if\s*\(open\.length\s*===\s*0\)\s*\{[\s\S]*?return ack\(\);/,
    );
  });

  it("pauses unsent reminders for the matched quote (same as Twilio inbound)", () => {
    expect(inboundRoute).toMatch(
      /\.from\("reminders"\)[\s\S]*?\.update\(\{\s*paused_at:\s*now\s*\}\)[\s\S]*?\.eq\("quote_id"/,
    );
  });

  it("strips quoted history via the shared helper, not inline", () => {
    expect(inboundRoute).toMatch(
      /import\s*\{[^}]*stripQuotedReply[^}]*\}\s*from\s*"@\/lib\/messaging\/strip-quoted-reply"/,
    );
    expect(inboundRoute).toMatch(/stripQuotedReply\(/);
  });
});

// ---------------------------------------------------------------------------
// Contractor notification email
// ---------------------------------------------------------------------------

describe("email-inbound route notifies the contractor", () => {
  it("looks up the contractor email from profiles by user_id", () => {
    expect(inboundRoute).toMatch(/\.from\("profiles"\)/);
    expect(inboundRoute).toMatch(
      /\.select\("email"\)[\s\S]*?\.eq\("id",\s*matched\.user_id\)/,
    );
  });

  it("sends the notification through the existing sendRecoveryEmail helper", () => {
    expect(inboundRoute).toMatch(
      /import\s*\{[^}]*sendRecoveryEmail[^}]*\}\s*from\s*"@\/lib\/messaging\/email-provider"/,
    );
    expect(inboundRoute).toMatch(/await sendRecoveryEmail\(\{[\s\S]*?to:\s*contractorEmail/);
  });

  it("subject line follows the '{client} replied — {label}' pattern", () => {
    expect(inboundRoute).toMatch(
      /subjectLine\s*=\s*`\$\{matched\.client_name\} replied — \$\{suggestion\.badgeLabel\}`/,
    );
  });

  it("notification body contains the homeowner reply, the suggested response, and the quote URL", () => {
    expect(inboundRoute).toMatch(/Suggested response/);
    expect(inboundRoute).toMatch(/Open the quote:/);
    expect(inboundRoute).toMatch(
      /quoteUrl\s*=\s*`\$\{appBaseUrl\(\)\}\/quotes\/\$\{matched\.id\}`/,
    );
  });

  it("only notifies when the intent classified to a known label", () => {
    expect(inboundRoute).toMatch(/if\s*\(isReplyIntent\(replyIntent\)\)/);
  });

  it("contractor notification copy contains no exclamation, no emoji, no 'Bid'", () => {
    // Audit only the user-facing strings inside notificationBody, not the
    // entire route source (which legitimately uses '!' as JS negation).
    const fnMatch =
      /function notificationBody\([\s\S]*?\)\s*:\s*string\s*\{([\s\S]*?)\n\}/m.exec(
        inboundRoute,
      );
    expect(fnMatch).not.toBeNull();
    const body = fnMatch?.[1] ?? "";
    expect(body).not.toMatch(/!/);
    expect(body).not.toMatch(
      /[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿]/,
    );
    expect(body).not.toMatch(/\bBid\b/i);

    // The composed subject line is also user-facing — audit it directly.
    const subjectMatch = /subjectLine\s*=\s*`([^`]*)`/.exec(inboundRoute);
    expect(subjectMatch).not.toBeNull();
    const subject = subjectMatch?.[1] ?? "";
    expect(subject).not.toMatch(/!/);
    expect(subject).not.toMatch(/\bBid\b/i);
  });
});

// ---------------------------------------------------------------------------
// Quote detail page now hydrates channel + ReplyRadarCard renders it
// ---------------------------------------------------------------------------

describe("quote detail page surfaces email-origin replies in Reply Radar", () => {
  it("selects the channel column when reading the latest reply event", () => {
    expect(detailPage).toMatch(
      /\.select\("reply_text, reply_intent, channel, created_at"\)/,
    );
  });

  it("passes channel through to ReplyRadarData", () => {
    expect(detailPage).toMatch(/channel:\s*\n?\s*replyEvent\.channel === "sms"/);
  });

  it("ReplyRadarCard accepts an optional channel of 'sms' | 'email'", () => {
    expect(cardSrc).toMatch(/channel\?:\s*ReplyChannel/);
    expect(cardSrc).toMatch(
      /type ReplyChannel\s*=\s*"sms"\s*\|\s*"email"/,
    );
  });

  it("renders 'via email' when channel === 'email'", () => {
    const data: ReplyRadarData = {
      clientName: "Jane Harris",
      replyText: "Yes please, let's schedule it.",
      channel: "email",
      suggestion: suggestResponse({
        intent: "positive",
        trade: "Roofing",
        estimateAmount: 8500,
        clientName: "Jane Harris",
      }),
    };
    render(React.createElement(ReplyRadarCard, { reply: data }));
    expect(screen.getByText(/via email/i)).toBeTruthy();
    expect(screen.queryByText(/via sms/i)).toBeNull();
  });

  it("renders 'via SMS' when channel === 'sms'", () => {
    const data: ReplyRadarData = {
      clientName: "Tom Lee",
      replyText: "Sounds good",
      channel: "sms",
      suggestion: suggestResponse({
        intent: "positive",
        trade: "Plumbing",
        estimateAmount: 2400,
        clientName: "Tom Lee",
      }),
    };
    render(React.createElement(ReplyRadarCard, { reply: data }));
    expect(screen.getByText(/via SMS/i)).toBeTruthy();
  });

  it("omits the channel tag entirely when channel is undefined (legacy rows)", () => {
    const data: ReplyRadarData = {
      clientName: "Mike Garcia",
      replyText: "I need some time.",
      suggestion: suggestResponse({
        intent: "needs_time",
        trade: "HVAC",
        estimateAmount: 7900,
        clientName: "Mike Garcia",
      }),
    };
    render(React.createElement(ReplyRadarCard, { reply: data }));
    expect(screen.queryByText(/via email/i)).toBeNull();
    expect(screen.queryByText(/via sms/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Banned-content audit on the new files
// ---------------------------------------------------------------------------

describe("new email-inbound files pass the honest-copy audit", () => {
  const stripSrc = readSource(
    "../lib/messaging/strip-quoted-reply.ts",
  );

  it("no 'Bid' anywhere in the new files", () => {
    for (const src of [inboundRoute, stripSrc]) {
      expect(src).not.toMatch(/\bBid\b/);
    }
  });

  it("no exclamation mark in any backtick template literal in the route", () => {
    // Backtick literals are where user-facing copy lives (notification body
    // and subject line). JS code outside backticks legitimately uses '!'.
    const literals = inboundRoute.match(/`[^`]*`/g) ?? [];
    expect(literals.length).toBeGreaterThan(0);
    for (const lit of literals) {
      expect(lit, lit).not.toMatch(/!/);
    }
  });
});
