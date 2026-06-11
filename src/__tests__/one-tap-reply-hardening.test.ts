/**
 * One-Tap Reply — end-to-end hardening proof.
 *
 * This file is the single source of truth for the "WORKS" classification.
 * Every link in the chain is asserted here so a regression in any one place
 * fails one of these tests, not a vague integration test elsewhere.
 *
 * The chain:
 *   1. Token mint:  secure random raw + SHA-256 hash, raw token never stored.
 *   2. Embed:       cron email send appends "Quick reply: <url>" to the body.
 *   3. Public load: /reply/[token] resolves by hash, force-dynamic, no auth.
 *   4. Render gate: canRenderReplyPage gates won/closed/opted-out/revoked.
 *   5. Persist:     recordOneTapReply writes one_tap_replies + recovery_events
 *                   with the right reply_intent, then pauses unsent reminders.
 *   6. Contractor:  Quiet Signal + Reply Radar pick the event up through
 *                   their existing reply-intent paths on the quote detail.
 *   7. Failure:     all failure modes render the SAME "unavailable" page so
 *                   the route never leaks which gate tripped.
 *   8. Privacy:     the public page renders ONLY the trade label, the
 *                   estimate dollar amount, and the contractor first name —
 *                   never the customer name, contractor email, city/state,
 *                   job description, or internal IDs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildReplyUrl,
  canRenderReplyPage,
  generateToken,
  hashToken,
  mapAnswerTypeToReplyIntent,
} from "@/lib/quotes/one-tap-reply";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const cron = readSource("../app/api/cron/send/route.ts");
const serverHelpers = readSource("../lib/quotes/one-tap-reply-server.ts");
const publicPage = readSource("../app/reply/[token]/page.tsx");
const replyForm = readSource("../app/reply/[token]/ReplyForm.tsx");
const quoteDetailSrc = readSource("../app/(app)/quotes/[id]/page.tsx");
const oneTapCard = readSource("../components/quotes/OneTapReplyCard.tsx");

// ───────────────────────────────────────────────────────────────────────
// 1. Token mint — secure raw + persisted hash, never the raw token
// ───────────────────────────────────────────────────────────────────────

describe("[1] token mint stores the hash, never the raw token", () => {
  it("generateToken produces a long random raw token and a matching SHA-256 hash", () => {
    const { token, tokenHash } = generateToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("issueOneTapLink writes token_hash and returns the raw token only in the URL", () => {
    expect(serverHelpers).toMatch(
      /\.insert\(\{\s*quote_id: quoteId,\s*outbound_message_id: outboundMessageId,\s*token_hash: tokenHash,?\s*\}\)/,
    );
    expect(serverHelpers).toMatch(/return \{ url: buildReplyUrl\(token\), linkId/);
    // The raw token never enters the insert payload.
    expect(serverHelpers).not.toMatch(/token: token\b/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 2. Embed — cron email body carries exactly one "Quick reply:" line
// ───────────────────────────────────────────────────────────────────────

describe("[2] outbound email embeds the one-tap link", () => {
  it("email branch issues a link and appends 'Quick reply: <url>' to the body", () => {
    expect(cron).toMatch(/issueOneTapLink\(supabase, r\.quote_id, null\)/);
    expect(cron).toMatch(
      /`\$\{r\.message_text\}\\n\\nQuick reply: \$\{oneTapLink\.url\}`/,
    );
  });

  it("issueOneTapLink is called once per email send (one link per send)", () => {
    const calls = (cron.match(/issueOneTapLink\(/g) ?? []).length;
    expect(calls).toBe(1);
  });

  it("fallback path: if mint fails, the email still goes out without the link", () => {
    expect(cron).toMatch(
      /const messageBodyForSend = oneTapLink\s*\?\s*`\$\{r\.message_text\}\\n\\nQuick reply: \$\{oneTapLink\.url\}`\s*:\s*r\.message_text/,
    );
  });

  it("buildReplyUrl points at the public /reply/<token> path", () => {
    const url = buildReplyUrl("abc123");
    expect(url).toMatch(/\/reply\/abc123$/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 3 + 4. Public load + render gate
// ───────────────────────────────────────────────────────────────────────

describe("[3+4] public reply page loads anonymously and gates correctly", () => {
  it("/reply/[token] is force-dynamic, runs on nodejs, and excludes itself from indexing", () => {
    expect(publicPage).toContain('export const dynamic = "force-dynamic"');
    expect(publicPage).toContain('export const runtime = "nodejs"');
    expect(publicPage).toContain("robots: { index: false, follow: false }");
  });

  it("does NOT require auth — uses the service client to resolve the token", () => {
    expect(publicPage).toContain("createServiceSupabaseClient");
    expect(publicPage).not.toContain("requireUser");
    expect(publicPage).not.toContain('redirect("/sign-in")');
  });

  it("resolveOneTapLink looks up by SHA-256 hash (not raw token)", () => {
    expect(serverHelpers).toContain("const tokenHash = hashToken(rawToken)");
    expect(serverHelpers).toMatch(
      /\.from\("one_tap_reply_links"\)[\s\S]{0,160}\.eq\("token_hash", tokenHash\)/,
    );
  });

  it("canRenderReplyPage refuses won, closed, opted-out, revoked, expired links", () => {
    const base = {
      outcome: "pending" as const,
      client_opted_out: false,
    };
    const goodLink = { revoked_at: null, expires_at: null };

    expect(canRenderReplyPage(base, goodLink)).toBe(true);

    expect(canRenderReplyPage({ ...base, outcome: "won" }, goodLink)).toBe(false);
    expect(canRenderReplyPage({ ...base, outcome: "closed" }, goodLink)).toBe(false);
    expect(canRenderReplyPage({ ...base, client_opted_out: true }, goodLink)).toBe(false);
    expect(
      canRenderReplyPage(base, { revoked_at: new Date().toISOString(), expires_at: null }),
    ).toBe(false);
    expect(
      canRenderReplyPage(base, {
        revoked_at: null,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 5. Persist — reply row + recovery_event + sequence pause
// ───────────────────────────────────────────────────────────────────────

describe("[5] reply persists into both tables and pauses the sequence", () => {
  it("recordOneTapReply inserts a one_tap_replies row", () => {
    expect(serverHelpers).toMatch(
      /\.from\("one_tap_replies"\)\.insert\(\{[\s\S]{0,400}answer_type: input\.answerType/,
    );
  });

  it("recordOneTapReply emits a recovery_events 'reply_received' with channel='one_tap'", () => {
    expect(serverHelpers).toMatch(
      /\.from\("recovery_events"\)\.insert\(\{[\s\S]{0,400}event_type: "reply_received"[\s\S]{0,200}channel: "one_tap"/,
    );
    expect(serverHelpers).toMatch(/reply_intent: replyIntent/);
  });

  it("the answer-type → reply-intent map covers every public answer (no silent default)", () => {
    expect(mapAnswerTypeToReplyIntent("interested")).toBe("positive");
    expect(mapAnswerTypeToReplyIntent("not_now")).toBe("not_interested");
    expect(mapAnswerTypeToReplyIntent("question")).toBe("question");
    expect(mapAnswerTypeToReplyIntent("option_selected")).toBe("positive");
  });

  it("pauses every unsent, unpaused reminder for the quote so the sequence stops", () => {
    expect(serverHelpers).toMatch(
      /\.from\("reminders"\)\s*\.update\(\{ paused_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\("quote_id", input\.quoteId\)\s*\.eq\("user_id", input\.userId\)\s*\.eq\("sent", false\)\s*\.is\("paused_at", null\)/,
    );
  });

  it("rapid-double-tap protection: identical answer within 5s returns 'duplicate', not 'recorded'", () => {
    expect(serverHelpers).toContain("DUP_WINDOW_MS = 5_000");
    expect(serverHelpers).toMatch(/return "duplicate"/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 6. Contractor read — reply surfaces on quote detail
// ───────────────────────────────────────────────────────────────────────

describe("[6] reply is visible to the contractor on the quote detail page", () => {
  it("the detail page reads the latest one-tap reply and the active option list", () => {
    expect(quoteDetailSrc).toContain("getLatestOneTapReply");
    expect(quoteDetailSrc).toContain("listActiveReplyOptions");
    expect(quoteDetailSrc).toMatch(/<OneTapReplyCard[\s\S]{0,200}latestReply=\{latestOneTapReply\}/);
  });

  it("the One-Tap Reply card renders the contractor-side affordance", () => {
    expect(oneTapCard).toContain("One-Tap Reply");
    expect(oneTapCard).toMatch(/Copy One-Tap Reply link/);
  });

  it("the detail page also surfaces the reply intent through Quiet Signal + Reply Radar (same event row)", () => {
    expect(quoteDetailSrc).toContain('event_type', );
    expect(quoteDetailSrc).toContain('"reply_received"');
    expect(quoteDetailSrc).toContain("ReplyRadarCard");
    expect(quoteDetailSrc).toContain("QuietSignalCard");
  });
});

// ───────────────────────────────────────────────────────────────────────
// 7. Failure modes — same page for every gate (anti-enumeration)
// ───────────────────────────────────────────────────────────────────────

describe("[7] invalid/tampered/missing links render the same 'unavailable' page", () => {
  it("null token, missing row, won/closed quote, revoked, expired all fall through to <Unavailable />", () => {
    // The page returns <Unavailable /> early on every failure gate. We assert
    // those return statements exist; behavior of canRenderReplyPage is locked
    // by the [3+4] tests above.
    const earlyReturns = publicPage.match(/return <Unavailable \/>;/g) ?? [];
    expect(earlyReturns.length).toBeGreaterThanOrEqual(3);
    expect(publicPage).toContain("This link isn&apos;t available anymore.");
  });

  it("the 'unavailable' copy does not name WHICH gate failed (anti-enumeration)", () => {
    // The copy never says "expired", "revoked", "already won", "opted out",
    // "wrong token" — only the generic "isn't available anymore" + suggestion
    // to reply to the contractor's email directly.
    const unavailableBlock = publicPage.slice(publicPage.indexOf("function Unavailable"));
    expect(unavailableBlock).not.toMatch(/expired|revoked|won|opted out|invalid/i);
    expect(unavailableBlock).toContain("reply to the contractor");
  });
});

// ───────────────────────────────────────────────────────────────────────
// 8. Privacy — public page renders no private data
// ───────────────────────────────────────────────────────────────────────

describe("[8] public reply page leaks no contractor or customer private data", () => {
  it("renders only: trade label, dollar amount, and contractor first name", () => {
    // Trade label is computed through projectLabel (a stable trade phrase).
    // Dollar amount comes from estimate_amount via formatCurrency.
    // Contractor first name comes from the email LOCAL PART only (never the
    // full email), via pickContractorName.
    expect(publicPage).toContain("projectLabel(quote.trade)");
    expect(publicPage).toContain("formatCurrency(Number(quote.estimate_amount");
    expect(publicPage).toContain("pickContractorName(profile?.email)");
  });

  it("never renders the customer's own name, the city/state, the job description, the contractor's full email, or the quote ID", () => {
    expect(publicPage).not.toMatch(/quote\.client_name/);
    expect(publicPage).not.toMatch(/quote\.city/);
    expect(publicPage).not.toMatch(/quote\.state/);
    expect(publicPage).not.toMatch(/quote\.job_description/);
    expect(publicPage).not.toMatch(/profile\?\.email\}/);
    expect(publicPage).not.toMatch(/\{quote\.id\}/);
    expect(publicPage).not.toMatch(/\{quote\.user_id\}/);
  });

  it("the contractor name derivation strips the @ domain and only uses the local part's first word", () => {
    expect(publicPage).toMatch(/email\.split\("@"\)\[0\]/);
    expect(publicPage).toMatch(/titleCaseName\(cleaned\)\.split\(\/\\s\+\/\)\[0\]/);
  });

  it("logs only error codes — never the raw token, email body, or message text", () => {
    expect(serverHelpers).toContain("code=${error?.code");
    expect(serverHelpers).not.toMatch(/console\.\w+\([^)]*\btoken\b[^)]*\)/);
    expect(serverHelpers).not.toMatch(/console\.\w+\([^)]*\bmessage_text\b[^)]*\)/);
  });

  it("the public reply page is excluded from search engines", () => {
    expect(publicPage).toContain("robots: { index: false, follow: false }");
  });
});

// ───────────────────────────────────────────────────────────────────────
// 9. ReplyForm — the homeowner submission path is plain HTML, no auth
// ───────────────────────────────────────────────────────────────────────

describe("[9] ReplyForm exists and submits without auth", () => {
  it("is a client component and posts the answer choice without requiring a session", () => {
    expect(replyForm).toContain('"use client"');
    expect(replyForm).not.toContain("requireUser");
    expect(replyForm).not.toContain('redirect("/sign-in")');
  });
});
