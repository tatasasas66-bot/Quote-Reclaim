/**
 * Source-level integration guarantees for One-Tap Reply.
 *
 * These tests pin the wiring decisions so they cannot silently regress —
 * email path, dashboard mount, activity-feed branching, schema scope, and
 * the locked surfaces that must stay untouched.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const migration = readSource(
  "../../supabase/migrations/010_one_tap_reply.sql",
);
const helpers = readSource("../lib/quotes/one-tap-reply.ts");
const serverHelpers = readSource("../lib/quotes/one-tap-reply-server.ts");
const cron = readSource("../app/api/cron/send/route.ts");
const detailPage = readSource("../app/(app)/quotes/[id]/page.tsx");
const replyPage = readSource("../app/reply/[token]/page.tsx");
const replyForm = readSource("../app/reply/[token]/ReplyForm.tsx");
const replyActions = readSource("../app/reply/[token]/actions.ts");
const card = readSource("../components/quotes/OneTapReplyCard.tsx");
const homepage = readSource("../app/page.tsx");
const activityFeed = readSource(
  "../components/dashboard/ActivityFeedView.tsx",
);
const fallbackMsgs = readSource("../lib/ai/fallback-messages.ts");

// ---------------------------------------------------------------------------
// Migration 010 — additive only, exactly three new tables
// ---------------------------------------------------------------------------

describe("migration 010_one_tap_reply — additive schema delta", () => {
  it("creates exactly the three required tables", () => {
    const tables = migration.match(/create table if not exists/g) ?? [];
    expect(tables).toHaveLength(3);
    expect(migration).toContain(
      "create table if not exists public.one_tap_reply_links",
    );
    expect(migration).toContain(
      "create table if not exists public.one_tap_replies",
    );
    expect(migration).toContain(
      "create table if not exists public.one_tap_reply_options",
    );
  });

  it("only stores token_hash, never a raw token column", () => {
    expect(migration).toMatch(/token_hash text not null unique/);
    expect(migration).not.toMatch(/\btoken text\b/);
    expect(migration).not.toMatch(/\bplain_token\b/i);
    expect(migration).not.toMatch(/\braw_token\b/i);
  });

  it("answer_type CHECK enforces the closed set", () => {
    expect(migration).toMatch(
      /answer_type text not null check \(answer_type in \(\s*'interested'\s*,\s*'question'\s*,\s*'not_now'\s*,\s*'option_selected'\s*\)\)/m,
    );
  });

  it("RLS is enabled on every new table", () => {
    const rls = migration.match(/enable row level security/g) ?? [];
    expect(rls.length).toBeGreaterThanOrEqual(3);
  });

  it("does not edit any existing table or RPC", () => {
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/drop function/i);
    // No ALTERs to existing tables — only ALTERs allowed are
    // "enable row level security" on the three NEW tables.
    const alters = migration.match(/^alter table/gim) ?? [];
    expect(alters.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Token security model — pure source-level guarantees
// ---------------------------------------------------------------------------

describe("token security model", () => {
  it("issueOneTapLink stores token_hash, returns the raw token via URL only", () => {
    expect(serverHelpers).toMatch(/generateToken\(\)/);
    expect(serverHelpers).toMatch(/token_hash:\s*tokenHash/);
    // The raw token is never written into the row payload.
    expect(serverHelpers).not.toMatch(/token:\s*token,/);
  });

  it("never logs the raw token anywhere in the codebase", () => {
    for (const src of [serverHelpers, replyActions, replyPage, cron, card]) {
      expect(src).not.toMatch(/console\.\w+\([^)]*tokenHash/);
      expect(src).not.toMatch(/console\.\w+\([^)]*\braw[A-Za-z]*Token/);
    }
  });

  it("resolveOneTapLink hashes the URL token before lookup", () => {
    expect(serverHelpers).toMatch(/hashToken\(rawToken\)/);
    expect(serverHelpers).toMatch(/\.eq\("token_hash", tokenHash\)/);
  });

  it("uses cryptographically secure randomness", () => {
    expect(helpers).toMatch(/from "node:crypto"/);
    expect(helpers).toMatch(/randomBytes\(/);
  });
});

// ---------------------------------------------------------------------------
// Email integration — exactly one link, email branch only
// ---------------------------------------------------------------------------

describe("email integration in cron/send", () => {
  it("appends a single 'Quick reply: ' line in the email branch", () => {
    expect(cron).toMatch(/Quick reply:/);
    // The line is appended to the body, not a wholesale rewrite of message_text.
    expect(cron).toMatch(/`\$\{r\.message_text\}\\n\\nQuick reply: \$\{[^}]+\}`/);
  });

  it("the SMS branch does NOT add a One-Tap link", () => {
    const smsBranchStart = cron.indexOf("smsResult");
    expect(smsBranchStart).toBeGreaterThan(0);
    const smsSection = cron.slice(smsBranchStart);
    expect(smsSection).not.toMatch(/issueOneTapLink/);
    expect(smsSection).not.toMatch(/Quick reply:/);
  });

  it("falls back to the original body when issuing the link fails", () => {
    // Ternary across multiple lines — match with the /s flag.
    expect(cron).toMatch(/oneTapLink[\s\S]*?\?[\s\S]*?:\s*r\.message_text/);
  });

  it("issueOneTapLink is called once per email send (one link per send)", () => {
    const calls = (cron.match(/issueOneTapLink\(/g) ?? []).length;
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Public reply page — copy, gating, no PII leakage
// ---------------------------------------------------------------------------

describe("public reply page", () => {
  it("URL pattern is /reply/[token]", () => {
    // The page lives at the spec'd path; existence proves the route.
    expect(replyPage.length).toBeGreaterThan(0);
  });

  it("renders the Quick reply title with the project label", () => {
    expect(replyPage).toMatch(/Quick reply for your \{projectLabel/);
  });

  it("uses every gate-failure → same unavailable page (no info leakage)", () => {
    const unavailableCalls = (replyPage.match(/<Unavailable \/>/g) ?? []).length;
    expect(unavailableCalls).toBeGreaterThanOrEqual(3);
  });

  it("never RENDERS internal IDs / job description / client email / client phone", () => {
    // It is fine to read quote.id server-side (e.g. for a follow-up query);
    // what must not happen is rendering those values into the JSX. Scan only
    // for JSX-curly-brace interpolations of those fields.
    expect(replyPage).not.toMatch(/\{\s*quote\.id\s*\}/);
    expect(replyPage).not.toMatch(/\{\s*quote\.job_description\s*\}/);
    expect(replyPage).not.toMatch(/\{\s*quote\.client_email\s*\}/);
    expect(replyPage).not.toMatch(/\{\s*quote\.client_phone\s*\}/);
    // The select list itself must not pull those columns.
    expect(replyPage).not.toMatch(/select\([^)]*client_email/);
    expect(replyPage).not.toMatch(/select\([^)]*client_phone/);
    expect(replyPage).not.toMatch(/select\([^)]*job_description/);
  });

  it("ReplyForm exposes the three primary buttons exactly", () => {
    expect(replyForm).toContain("Let&apos;s do it — what&apos;s next?");
    expect(replyForm).toContain("I have one question");
    expect(replyForm).toContain("Not right now");
  });

  it("question branch requires a textarea before submission", () => {
    expect(replyForm).toContain("What question do you have?");
    expect(replyForm).toMatch(/disabled=\{questionText\.trim\(\)\.length < 3\}/);
  });
});

// ---------------------------------------------------------------------------
// Server action — no auto-win, no revenue, gated re-check on the server
// ---------------------------------------------------------------------------

describe("submitOneTapReply server action", () => {
  it("re-runs gating on the server (canRenderReplyPage)", () => {
    expect(replyActions).toContain("canRenderReplyPage");
  });

  it("never marks the quote as won or touches outcome", () => {
    expect(replyActions).not.toMatch(/outcome:\s*['"]won['"]/);
    expect(replyActions).not.toMatch(/won_at:/);
    expect(replyActions).not.toMatch(/mark_quote_won/);
    expect(replyActions).not.toMatch(/recovered_amount/);
  });

  it("hashes the IP — never persists raw client IP", () => {
    expect(replyActions).toContain("hashIp(ip)");
    expect(replyActions).not.toMatch(/ip:\s*ip[\s,}]/);
  });

  it("option_selected verifies the option is active AND belongs to this quote", () => {
    // `[\s\S]` matches across newlines without the es2018-only `/s` dotAll flag.
    expect(replyActions).toMatch(/is_active[\s\S]*quote_id|quote_id[\s\S]*is_active/);
  });

  it("returns a single generic message on every gate failure", () => {
    expect(replyActions).toMatch(/SAFE_GENERIC_FAILURE/);
  });
});

// ---------------------------------------------------------------------------
// Reuse — answer flows feed Quiet Signal / Reply Radar via reply_received
// ---------------------------------------------------------------------------

describe("reply pipeline reuse (Quiet Signal + Reply Radar)", () => {
  it("recordOneTapReply writes a reply_received event with channel='one_tap'", () => {
    expect(serverHelpers).toMatch(/event_type:\s*"reply_received"/);
    expect(serverHelpers).toMatch(/channel:\s*"one_tap"/);
    expect(serverHelpers).toMatch(/reply_intent:\s*replyIntent/);
  });

  it("pauses unsent reminders on any one-tap reply (matches email/SMS inbound)", () => {
    expect(serverHelpers).toMatch(
      /\.from\("reminders"\)[\s\S]*?\.update\(\{ paused_at:[\s\S]*?\.eq\("sent", false\)/,
    );
  });

  it("activity feed branches on channel='one_tap' for the reply phrase", () => {
    expect(activityFeed).toMatch(/e\.channel === "one_tap"/);
    expect(activityFeed).toMatch(/replied in one tap/);
  });
});

// ---------------------------------------------------------------------------
// Quote detail mount + card
// ---------------------------------------------------------------------------

describe("quote detail page mounts the One-Tap Reply card", () => {
  it("imports and renders OneTapReplyCard", () => {
    expect(detailPage).toContain("OneTapReplyCard");
    expect(detailPage).toMatch(/<OneTapReplyCard[\s\S]*?latestReply=\{latestOneTapReply\}/);
  });

  it("preserves both QuietSignal + ReplyRadar cards (no replacement)", () => {
    expect(detailPage).toMatch(/<QuietSignalCard signal=\{quietSignal\}/);
    expect(detailPage).toMatch(/<ReplyRadarCard reply=\{replyRadar\}/);
  });

  it("WHY_THIS_WORKS source block remains byte-identical", () => {
    expect(detailPage).toContain(
      `const WHY_THIS_WORKS: Record<FollowupStep, string> = {
  1: "Asking what didn't land flips you from chaser to helper — and surfaces the real objection instead of begging for a reply.",
  2: "Schedule scarcity makes you the prize. The homeowner now weighs losing access to you, not whether to spend.",
  3: "Giving permission to say no feels safer than being pushed — so they rarely take it. 'Should I close it' triggers loss aversion.",
  4: "Most quiet quotes stall on price, not interest. Offering a phased path removes the real barrier without ever dropping your number.",
  5: "The takeaway. Withdrawing the offer triggers reactance — this final close often pulls the reply the first four couldn't.",
};`,
    );
  });

  it("card source uses the locked vocabulary and avoids banned phrasing", () => {
    expect(card).toContain("One-Tap Reply");
    expect(card).toContain("Turn silence into a yes, a question, or a clean no.");
    expect(card).not.toMatch(/One-Tap Close/);
    expect(card).not.toMatch(/Job Booked/i);
    expect(card).not.toMatch(/guaranteed/i);
    expect(card).not.toMatch(/customer panics/i);
    expect(card).not.toMatch(/manipulate/i);
    expect(card).not.toMatch(/last chance/i);
  });
});

// ---------------------------------------------------------------------------
// Homepage proof block — compact, honest
// ---------------------------------------------------------------------------

describe("homepage proof block", () => {
  it("adds a compact One-Tap Reply section", () => {
    expect(homepage).toContain("OneTapReplyBlock");
    expect(homepage).toContain(
      "Turn silence into a yes, a question, or a clean no.",
    );
  });

  it("uses none of the banned marketing phrases", () => {
    expect(homepage).not.toMatch(/One-Tap Close/);
    expect(homepage).not.toMatch(/Job Booked/);
    expect(homepage).not.toMatch(/customer panics/i);
    expect(homepage).not.toMatch(/psychological shift/i);
    expect(homepage).not.toMatch(/\bmanipulate\b/i);
    expect(homepage).not.toMatch(/\bguaranteed\b/i);
    expect(homepage).not.toMatch(/\bforce a reply\b/i);
    expect(homepage).not.toMatch(/\blast chance\b/i);
    expect(homepage).not.toMatch(/\burgency\b/i);
  });

  it("keeps the existing $79/month / hero / footer chrome", () => {
    expect(homepage).toContain("$79/month");
    expect(homepage).toContain("Silent Quote Command");
    expect(homepage).toContain("Terms");
    expect(homepage).toContain("Privacy");
  });
});

// ---------------------------------------------------------------------------
// Locked surfaces — fallback-messages / cron schedule logic unchanged
// ---------------------------------------------------------------------------

describe("locked surfaces unchanged", () => {
  it("recovery message templates (fallback-messages.ts) carry no One-Tap coupling", () => {
    expect(fallbackMsgs).not.toContain("one-tap");
    expect(fallbackMsgs).not.toContain("OneTapReply");
    expect(fallbackMsgs).not.toContain("Quick reply:");
  });

  it("cron still uses the 5-touch cadence and the same email-sending helper", () => {
    expect(cron).toContain("sendRecoveryEmail");
    expect(cron).toMatch(/perUserAttempts/);
  });
});
