/**
 * @vitest-environment happy-dom
 *
 * Silent Money Reveal — parser, action contract, routing wiring, and the
 * value-polish surfaces (audit transition, top moves, no-email copy matrix).
 *
 * Parser and helpers unit-tested directly. The server action is verified by
 * source-level contract (it imports the parser cap, uses the existing
 * free-trial gate, never bypasses it, and sets onboarding_done) so we
 * don't have to mock the whole Supabase chain.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MAX_IMPORT_ROWS,
  parseDaysSilent,
  parseSilentQuotesInput,
} from "@/lib/onboarding/parse-quotes";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const actionSrc = readSource("../lib/onboarding/actions.ts");
const dashboardSrc = readSource("../app/(app)/dashboard/page.tsx");
const revealPageSrc = readSource("../app/(app)/onboarding/reveal/page.tsx");
const revealClientSrc = readSource(
  "../app/(app)/onboarding/reveal/RevealClient.tsx",
);
const transitionSrc = readSource(
  "../app/(app)/onboarding/reveal/transition-and-copy.tsx",
);

// Fixed "now" so day-math is deterministic across CI clocks.
const NOW = Date.UTC(2026, 5, 7); // 2026-06-07

// ───────────────────────────────────────────────────────────────────────
// Parser — happy paths
// ───────────────────────────────────────────────────────────────────────

describe("parseSilentQuotesInput — happy paths", () => {
  it("parses a tab-separated paste (Excel/Sheets copy) — commas safe in amounts", () => {
    // Tab-separated is what you get copying from Excel/Google Sheets. Commas
    // INSIDE amounts ("8,500") are safe here because the delimiter is \t.
    const input = [
      "Jane Smith\t8,500\t2026-05-15",
      "Tom Roberts\t12000\t2026-05-22\ttom@example.com",
      "Maria Garcia\t4500\t9",
    ].join("\n");
    const out = parseSilentQuotesInput(input, NOW);
    expect(out.rows).toHaveLength(3);
    expect(out.totalAmount).toBe(25000);
    expect(out.skipped).toBe(0);
    expect(out.rows[0].name).toBe("Jane Smith");
    expect(out.rows[0].amount).toBe(8500);
    expect(out.rows[1].email).toBe("tom@example.com");
    // "9" in the date column = 9 days silent.
    expect(out.rows[2].daysSilent).toBe(9);
  });

  it("parses a CSV with synonym headers in any order (amounts must be quoted if they contain commas)", () => {
    const input = [
      "homeowner,quote,email,sent",
      `Pat Lee,"$3,200",pat@x.com,2026-06-01`,
      `"Doe, John","9000",j@x.com,2026-05-20`,
    ].join("\n");
    const out = parseSilentQuotesInput(input, NOW);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].name).toBe("Pat Lee");
    expect(out.rows[0].amount).toBe(3200);
    expect(out.rows[0].email).toBe("pat@x.com");
    // Quoted CSV cell with embedded comma stays intact.
    expect(out.rows[1].name).toBe("Doe, John");
    expect(out.rows[1].amount).toBe(9000);
  });

  it("handles two-column input (name, amount) with no date column", () => {
    const input = ["Jane,8500", "Tom,12000"].join("\n");
    const out = parseSilentQuotesInput(input, NOW);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].daysSilent).toBe(0);
    expect(out.rows.every((r) => r.email === null)).toBe(true);
  });

  it("treats an email in column 3 (no header, no date) as the email field", () => {
    const input = "Jane,8500,jane@example.com";
    const out = parseSilentQuotesInput(input, NOW);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].email).toBe("jane@example.com");
    expect(out.rows[0].daysSilent).toBe(0);
  });

  it("strips currency symbols and whitespace from amounts (tab-delim handles commas)", () => {
    // Tab delimiter so embedded commas in "8,500" / "4,500.50" stay inside
    // the cell. (Real Excel/Sheets copy uses tabs, not commas.)
    const input = [
      "Jane\t$8,500",
      "Tom\t 12 000 ",
      "Maria\t€4,500.50",
    ].join("\n");
    const out = parseSilentQuotesInput(input, NOW);
    expect(out.rows.map((r) => r.amount)).toEqual([8500, 12000, 4500.5]);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Parser — error and edge cases
// ───────────────────────────────────────────────────────────────────────

describe("parseSilentQuotesInput — rejects garbage, never crashes", () => {
  it("skips rows with no amount or zero/negative amount", () => {
    const input = [
      "Jane,8500",
      "Bad row no amount",
      "Negative,-200",
      "Zero,0",
      "Tom,4000",
    ].join("\n");
    const out = parseSilentQuotesInput(input, NOW);
    expect(out.rows.map((r) => r.name)).toEqual(["Jane", "Tom"]);
    expect(out.skipped).toBe(3);
  });

  it("rejects amounts above $10M sanity cap", () => {
    const out = parseSilentQuotesInput("Jane,99999999999", NOW);
    expect(out.rows).toHaveLength(0);
    expect(out.skipped).toBe(1);
  });

  it("dedupes (name, amount) pairs that appear twice in a paste", () => {
    const input = ["Jane,8500", "JANE,8500", "Jane,8500", "Tom,8500"].join("\n");
    const out = parseSilentQuotesInput(input, NOW);
    expect(out.rows).toHaveLength(2);
    expect(out.skipped).toBe(2);
  });

  it("returns empty on empty / whitespace-only input", () => {
    expect(parseSilentQuotesInput("", NOW).rows).toHaveLength(0);
    expect(parseSilentQuotesInput("\n\n   \n", NOW).rows).toHaveLength(0);
  });

  it(`caps rows at ${MAX_IMPORT_ROWS} and reports truncatedAt`, () => {
    const lines: string[] = [];
    for (let i = 0; i < MAX_IMPORT_ROWS + 25; i++) {
      lines.push(`Customer ${i},${1000 + i}`);
    }
    const out = parseSilentQuotesInput(lines.join("\n"), NOW);
    expect(out.rows.length).toBe(MAX_IMPORT_ROWS);
    expect(out.truncatedAt).toBe(MAX_IMPORT_ROWS);
  });

  it("strips control characters from names without losing spaces or hyphens", () => {
    const messy = "Jane Smith-Doe,8500";
    const out = parseSilentQuotesInput(messy, NOW);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].name).toBe("Jane Smith-Doe");
  });

  it("rejects malformed emails silently (no crash, just null email)", () => {
    const out = parseSilentQuotesInput("Jane,8500,5,not-an-email", NOW);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].email).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────
// parseDaysSilent — date parsing matrix
// ───────────────────────────────────────────────────────────────────────

describe("parseDaysSilent — date matrix", () => {
  it("ISO yyyy-mm-dd → days between today and that date", () => {
    // 2026-05-15 vs 2026-06-07 = 23 days.
    expect(parseDaysSilent("2026-05-15", NOW)).toBe(23);
  });

  it("bare integer is treated as a days_silent value (clamped 0-365)", () => {
    expect(parseDaysSilent("9", NOW)).toBe(9);
    expect(parseDaysSilent("999", NOW)).toBe(365);
  });

  it("empty / unparseable returns 0", () => {
    expect(parseDaysSilent("", NOW)).toBe(0);
    expect(parseDaysSilent("not a date", NOW)).toBe(0);
  });

  it("a future date returns 0 (not a negative number)", () => {
    expect(parseDaysSilent("2030-01-01", NOW)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Server action — contract via source inspection
// ───────────────────────────────────────────────────────────────────────

describe("importSilentQuotesAction — security contract", () => {
  it("requires an authenticated user (401-equivalent guard)", () => {
    expect(actionSrc).toMatch(/auth\.getUser\(\)/);
    expect(actionSrc).toMatch(/if \(!userData\.user\)/);
  });

  it("re-validates every row server-side (does not trust parser output)", () => {
    expect(actionSrc).toContain("sanitizeServerRow");
    expect(actionSrc).toContain("MAX_IMPORT_ROWS");
    expect(actionSrc).toMatch(/slice\(0, MAX_IMPORT_ROWS\)/);
  });

  it("uses the existing free-trial gate per row — never bypasses the paywall", () => {
    expect(actionSrc).toContain("check_and_increment_usage");
    // The gate is called inside the per-row loop.
    expect(actionSrc).toMatch(
      /for \(const row of cleaned\)[\s\S]*?check_and_increment_usage/,
    );
    expect(actionSrc).toMatch(/if \(gate\.error \|\| !gateResult \|\| !gateResult\.allowed\)/);
  });

  it("sorts cleaned rows by amount DESC so the top-value quotes get the trial slots", () => {
    expect(actionSrc).toMatch(/cleaned\.sort\(\(a, b\) => b\.amount - a\.amount\)/);
  });

  it("restricts trade to the closed ALLOWED_TRADES set", () => {
    expect(actionSrc).toContain("ALLOWED_TRADES");
    expect(actionSrc).toMatch(/if \(!ALLOWED_TRADES\.has\(trade\)\)/);
  });

  it("always marks onboarding_done = true (even when zero rows imported)", () => {
    expect(actionSrc).toMatch(/onboarding_done:\s*true/);
    // The update is unconditional — outside any if-block tied to imported>0.
    expect(actionSrc).toMatch(
      /Always mark onboarding done[\s\S]*?onboarding_done:\s*true/,
    );
  });

  it("never logs the parsed names, emails, or amounts (no PII leak)", () => {
    const consoleCalls = actionSrc.match(/console\.\w+\([\s\S]*?\);/g) ?? [];
    for (const call of consoleCalls) {
      expect(call).not.toMatch(/\b(name|email|amount|row|rawRows|cleaned)\b/);
    }
  });

  it("uses the user-scoped client for the insert (RLS-enforced ownership)", () => {
    // Chained `await userClient\n      .from("quotes")\n      .insert` style.
    expect(actionSrc).toMatch(/userClient[\s\S]{0,40}\.from\("quotes"\)[\s\S]{0,40}\.insert/);
  });

  it("uses user_id from the authenticated session, NOT from request input", () => {
    expect(actionSrc).toContain("const userId = userData.user.id");
    expect(actionSrc).toMatch(/user_id:\s*userId/);
  });
});

describe("skipOnboardingAction — auth-gated and idempotent", () => {
  it("requires auth and only updates own profile row", () => {
    expect(actionSrc).toMatch(
      /skipOnboardingAction[\s\S]*?auth\.getUser\(\)[\s\S]*?onboarding_done:\s*true[\s\S]*?\.eq\("id", userData\.user\.id\)/,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────
// Routing — new users land on /onboarding/reveal
// ───────────────────────────────────────────────────────────────────────

describe("dashboard — first-run redirect to /onboarding/reveal", () => {
  it("redirects when onboarding_done is false AND no pending quotes exist", () => {
    expect(dashboardSrc).toMatch(
      /!profile\?\.onboarding_done && pending\.length === 0[\s\S]*?redirect\("\/onboarding\/reveal"\)/,
    );
  });

  it("never redirects users who already have any pending quotes", () => {
    // The condition requires `pending.length === 0` — so the moment a user
    // has any quote, this branch is skipped.
    expect(dashboardSrc).not.toMatch(
      /redirect\("\/onboarding\/reveal"\)[\s\S]*?if \(pending\.length > 0\)/,
    );
  });
});

describe("/onboarding/reveal page — auth-gated", () => {
  it("uses requireUser and redirects unauthenticated callers to /sign-up with next preserved", () => {
    expect(revealPageSrc).toContain("requireUser");
    // Preserves the destination through auth so a prospect lands on the
    // audit immediately after sign-up instead of dropping on /dashboard.
    expect(revealPageSrc).toContain(
      'redirect("/sign-up?next=/onboarding/reveal")',
    );
  });

  it("force-dynamic so server-side flag checks always re-run", () => {
    expect(revealPageSrc).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("hands isPaid + usageCount + pendingCount to the client (no client-trusted state)", () => {
    expect(revealPageSrc).toContain("isPaid={isPaid}");
    expect(revealPageSrc).toContain("usageCount={usage}");
    expect(revealPageSrc).toContain("pendingCount={pendingCount}");
  });
});

describe("RevealClient — copy, CTAs, and brand guardrails", () => {
  it("renders the 4-step flow: paste/preview/transitioning/reveal", () => {
    expect(revealClientSrc).toContain('"input"');
    expect(revealClientSrc).toContain('"preview"');
    expect(revealClientSrc).toContain('"transitioning"');
    expect(revealClientSrc).toContain('"reveal"');
  });

  it("offers the same skip path from every step (never traps the user)", () => {
    expect(revealClientSrc).toContain("skipOnboardingAction");
    expect(revealClientSrc).toMatch(
      /Skip — I&apos;ll add quotes one at a time/,
    );
  });

  it("uses the brand palette tokens, not arbitrary colors", () => {
    // The reveal lives on text-warning + brand. No hex codes, no SaaS-blue.
    expect(revealClientSrc).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(revealClientSrc).not.toMatch(/text-blue-\d/);
  });

  it("free-trial copy is HONEST — dropped rows are 'waiting outside your free plan', never 'parked'", () => {
    // Rows beyond the free cap are NOT persisted, so we must not imply stored
    // data. "parked" implied storage; it's gone.
    expect(revealClientSrc).not.toMatch(/stays parked/i);
    expect(revealClientSrc).not.toMatch(/\bparked\b/i);
    expect(revealClientSrc).toContain("waiting outside your free plan");
    expect(revealClientSrc).toContain("Upgrade to import the rest");
  });

  it("the reveal mirrors the server ranking (highest value first) for the parked math", () => {
    // The client must rank by amount desc too, or the 'remaining outside free
    // plan' number won't match what the server actually drops.
    expect(revealClientSrc).toMatch(
      /\[\.\.\.parsed\.rows\]\.sort\(\(a, b\) => b\.amount - a\.amount\)/,
    );
  });

  it("no-email rows are labeled copy/manual honestly (no fake automation claim)", () => {
    // Helper lives in transition-and-copy; reveal client just calls it.
    expect(revealClientSrc).toContain("noEmailRevealCopy");
    expect(revealClientSrc).toContain("noEmailImporting");
    expect(transitionSrc).toMatch(/send the follow-ups yourself|send .* yourself/);
    expect(transitionSrc).toMatch(/The rest can send automatically|switch it to automatic/);
  });

  it("CTA copy never invents fake urgency or fake recovered revenue", () => {
    expect(revealClientSrc).not.toMatch(/limited time|last chance|only \d+ left/i);
    expect(revealClientSrc).not.toMatch(/guaranteed/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Viewport CTA polish — primary CTA visible without a scroll on common
// laptop (1366×768) and mobile viewports. Sticky command bar on mobile +
// short heights; in-flow CTA on tall desktop. No copy/logic regressions.
// ─────────────────────────────────────────────────────────────────────────

describe("Reveal CTA stays above the fold (sticky on mobile/short, in-flow on tall desktop)", () => {
  it("renders a fixed, bottom-anchored, high-z sticky container", () => {
    expect(revealClientSrc).toMatch(/fixed inset-x-0 bottom-0 z-30/);
  });

  it("the sticky bar is hidden ONLY on tall desktop (sm width AND min-height:760px)", () => {
    // Mobile (width < sm) and short laptops (height < 760px) keep the bar;
    // it disappears only when the in-flow CTA is already above the fold.
    expect(revealClientSrc).toMatch(
      /fixed inset-x-0 bottom-0 z-30[\s\S]*?sm:\[@media\(min-height:760px\)\]:hidden/,
    );
  });

  it("the sticky bar carries the primary CTA, full width, with the same ctaLabel", () => {
    expect(revealClientSrc).toMatch(
      /sm:\[@media\(min-height:760px\)\]:hidden[\s\S]*?fullWidth[\s\S]*?\{ctaLabel\}/,
    );
  });

  it("the in-flow primary CTA is hidden by default and shown only on tall desktop", () => {
    // `hidden … sm:[@media(min-height:760px)]:inline-flex` — same idiom as
    // Tailwind's `hidden sm:flex`, so exactly one primary CTA is ever visible.
    expect(revealClientSrc).toMatch(
      /hidden shadow-\[0_0_42px[\s\S]*?sm:\[@media\(min-height:760px\)\]:inline-flex/,
    );
  });

  it("accounts for the iOS safe-area at the bottom (no home-indicator overlap)", () => {
    expect(revealClientSrc).toContain("env(safe-area-inset-bottom)");
  });

  it("reserves scroll clearance so the bar never permanently covers in-flow content", () => {
    // The reveal section pads its bottom while the bar is visible, and drops
    // that padding on tall desktop where the bar is hidden.
    expect(revealClientSrc).toMatch(
      /pb-\[calc\(5\.5rem\+env\(safe-area-inset-bottom\)\)\][\s\S]*?sm:\[@media\(min-height:760px\)\]:pb-0/,
    );
  });

  it("caps the hero number with a clamped size (impressive but bounded; no lg:text-8xl)", () => {
    expect(revealClientSrc).not.toContain("lg:text-8xl");
    expect(revealClientSrc).toMatch(/text-\[length:clamp\(/);
  });

  it("compacts the reveal vertical rhythm (no oversized gap-8 / sm:mt-12)", () => {
    expect(revealClientSrc).not.toMatch(/grid w-full max-w-3xl gap-8 sm:mt-12/);
    expect(revealClientSrc).toMatch(/sm:gap-6/);
  });

  it("preserves the free vs paid CTA labels exactly (top N free vs all N)", () => {
    expect(revealClientSrc).toContain(
      "Start recovering your top ${willImport} free →",
    );
    expect(revealClientSrc).toContain("Start recovering all ${willImport} →");
  });

  it("keeps Top 3 Moves and trust copy; adds no countdown/parked regression", () => {
    expect(revealClientSrc).toContain('"Your first move"');
    expect(revealClientSrc).toMatch(/`Your first \$\{movesCount\} moves`/);
    expect(revealClientSrc).toContain("waiting outside your free plan");
    expect(revealClientSrc).not.toMatch(/\bparked\b/i);
    expect(revealClientSrc).not.toMatch(/countdown|expires in|seconds? left/i);
  });

  it("touches only the reveal UI — no billing/auth/parser wiring changed here", () => {
    // The reveal client still imports the same gated action + parser and
    // introduces no billing/schema vocabulary as part of this polish.
    expect(revealClientSrc).toContain("importSilentQuotesAction");
    expect(revealClientSrc).toContain("parseSilentQuotesInput");
    expect(revealClientSrc).not.toMatch(/is_paid|usage_count|check_and_increment|lemonsqueezy\./i);
  });
});

// ───────────────────────────────────────────────────────────────────────
// No-email rows — message_type matches the proven single-quote convention
// ───────────────────────────────────────────────────────────────────────

describe("no-email import rows behave like the single-quote flow (copy mode)", () => {
  it("sets message_type from the email presence: has email -> email, none -> sms", () => {
    // Mirrors createQuoteAction's `channel = client_email ? "email" : "sms"`.
    // Guarantees a no-email row is NEVER stored as an email reminder with a
    // null recipient (which the cron would churn on).
    expect(actionSrc).toMatch(
      /messageType:\s*"email"\s*\|\s*"sms"\s*=\s*normalizedEmail\s*\?\s*"email"\s*:\s*"sms"/,
    );
  });

  it("no longer routes no-email rows through selectChannel (which returned 'copy')", () => {
    expect(actionSrc).not.toContain("selectChannel");
  });

  it("never stores a reminder as message_type 'email' with a null recipient", () => {
    // The only message_type values written are "email" (email present) or
    // "sms" (no email -> copy/manual). There is no "copy"->"email" coercion.
    expect(actionSrc).not.toMatch(/channel === "sms" \? "sms" : "email"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Bulk import recovery-plan generation (launch-blocker regression)
//
// Root cause: the bulk path built reminder rows with a sequence_id field, but
// public.reminders has NO sequence_id column (it lives on quotes). PostgREST
// rejected every insert and the swallowed error left each imported quote with
// "No recovery plan generated". The fix routes BOTH paths through one shared
// writer that can never include sequence_id.
// ─────────────────────────────────────────────────────────────────────────

describe("Silent Money Reveal bulk import — recovery plan is generated for every quote", () => {
  const writerSrc = readSource("../lib/quotes/recovery-plan-write.ts");
  const quotesActionsSrc = readSource("../lib/quotes/actions.ts");

  it("imports the plan through the SAME shared writer as single-quote create (no divergence)", () => {
    expect(actionSrc).toContain("persistRecoveryPlan");
    expect(quotesActionsSrc).toContain("persistRecoveryPlan");
  });

  it("the shared writer NEVER includes sequence_id as an insert key", () => {
    // reminders has no sequence_id column — including it rejects the whole
    // insert. This is the exact bug; lock the dangerous `sequence_id:` key out
    // permanently (the explanatory comment may still name the column).
    expect(writerSrc).not.toMatch(/sequence_id\s*:/);
  });

  it("the bulk action no longer builds reminder rows itself (and never with sequence_id)", () => {
    expect(actionSrc).not.toMatch(/sequence_id:\s*sequenceId/);
    expect(actionSrc).not.toMatch(/from\("reminders"\)\s*\.insert/);
  });

  it("the writer keys reminders by (quote_id, followup_number) with the real column set", () => {
    expect(writerSrc).toContain("quote_id: quoteId");
    expect(writerSrc).toContain("followup_number: m.followup_number");
    expect(writerSrc).toContain("message_type: channel");
  });

  it("guarantees a deterministic fallback plan — generation never leaves 0 messages", () => {
    expect(writerSrc).toContain("generateRecoveryPlan");
    // If validation drops AI rows, fall back to the deterministic 5 from the plan.
    expect(writerSrc).toMatch(/valid\.length === 5 \? valid : plan/);
    // generateRecoveryPlan itself is contracted to always return 5 (fallback).
    const gen = readSource("../lib/ai/generate-recovery-plan.ts");
    expect(gen).toMatch(/return fallbackPlan\(ctx\)/);
  });

  it("passes the per-row channel so email-ready AND no-email rows both get 5 messages", () => {
    // No-email rows still get the full plan as message_type "sms" (manual copy);
    // they are not silently skipped.
    expect(actionSrc).toMatch(/channel:\s*messageType/);
    expect(actionSrc).toMatch(
      /messageType:\s*"email"\s*\|\s*"sms"\s*=\s*normalizedEmail\s*\?\s*"email"\s*:\s*"sms"/,
    );
  });

  it("a fake/example email cannot block generation — the plan is built from trade/amount/name", () => {
    // The writer feeds generateRecoveryPlan trade/estimateAmount/firstName, never
    // the email address; an unreachable email never short-circuits the plan.
    expect(writerSrc).toContain("generateRecoveryPlan(context)");
    expect(writerSrc).not.toMatch(/if\s*\(\s*!?\s*context\.\w*[Ee]mail/);
  });

  it("does not pretend email automation is active for no-email rows", () => {
    expect(actionSrc).not.toMatch(/message_type:\s*"email"/);
  });

  it("still gates every imported row through check_and_increment_usage (free limit intact)", () => {
    expect(actionSrc).toContain("check_and_increment_usage");
    expect(actionSrc).toMatch(
      /for \(const row of cleaned\)[\s\S]*?check_and_increment_usage/,
    );
  });

  it("emits opt-in, PII-free import diagnostics only (no names/emails/amounts/message text)", () => {
    const consoleCalls = actionSrc.match(/console\.\w+\([\s\S]*?\);/g) ?? [];
    for (const call of consoleCalls) {
      expect(call).not.toMatch(/\b(name|email|amount|row|rawRows|cleaned|message_text)\b/);
    }
    expect(actionSrc).toContain("RECOVERY_IMPORT_DEBUG");
  });

  it("no billing / auth / schema / pricing change in the import action", () => {
    expect(actionSrc).not.toMatch(/is_paid|FREE_PLAN_LIMIT|lemonsqueezy|price|\$79/i);
    // Quote insert still goes through the RLS-gated user client.
    expect(actionSrc).toMatch(/userClient[\s\S]{0,40}\.from\("quotes"\)[\s\S]{0,40}\.insert/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Value-perception polish — audit framing, transition, top moves, copy
// ─────────────────────────────────────────────────────────────────────────

describe("input helper makes no-email behavior clear BEFORE the reveal", () => {
  it("tells the contractor a no-email quote becomes manual copy", () => {
    expect(revealClientSrc).toMatch(
      /No email\?\s*We&apos;ll set that quote up for manual copy/,
    );
  });

  it("still mentions the 100-row cap", () => {
    expect(revealClientSrc).toContain("MAX_IMPORT_ROWS");
    expect(revealClientSrc).toMatch(/rows per import\./);
  });
});

describe("preview eyebrow reads as an audit, not a calculator", () => {
  it("uses '{trade} · Audit preview' instead of plain 'Preview'", () => {
    expect(revealClientSrc).toContain("Audit preview");
    expect(revealClientSrc).not.toMatch(/\{trade\} · Preview\b/);
  });
});

describe("Audit transition step — honest, fast, testable", () => {
  it("declares a sub-2s minimum window (spec cap: 1200–1800ms)", () => {
    expect(transitionSrc).toMatch(
      /REVEAL_TRANSITION_MIN_MS\s*=\s*(1[2-7]\d\d|1800)\b/,
    );
  });

  it("rotates through honest contractor-facing lines (no AI/billing/internal-validation copy)", () => {
    // Scope the scan to just the literal-string contents of REVEAL_AUDIT_LINES
    // so file-header words like "AI" in code comments don't trip the audit.
    const decl = transitionSrc.match(
      /REVEAL_AUDIT_LINES[^=]*=\s*\[([\s\S]*?)\];/,
    );
    expect(decl, "REVEAL_AUDIT_LINES declaration not found").not.toBeNull();
    const lines = (decl?.[1].match(/"([^"]+)"/g) ?? []).map((s) => s.slice(1, -1));
    expect(lines).toEqual([
      "Reading your pasted estimates…",
      "Ranking your highest-value quiet quotes…",
      "Separating email-ready from manual follow-ups…",
      "Preparing your first recovery targets…",
    ]);
    // Never the banned categories inside the actual lines.
    for (const line of lines) {
      expect(line).not.toMatch(/\bAI\b/i);
      expect(line).not.toMatch(/securing billing|verifying webhook|validating session/i);
      expect(line).not.toMatch(/encrypting|hashing|signing/i);
    }
  });

  it("flips to reveal via setTimeout (no infinite hang) and is testable with fake timers", () => {
    expect(revealClientSrc).toMatch(
      /setTimeout\(\(\) => setStep\("reveal"\), REVEAL_TRANSITION_MIN_MS\)/,
    );
  });

  it("respects prefers-reduced-motion by skipping the transition", () => {
    expect(revealClientSrc).toMatch(/prefers-reduced-motion: reduce/);
    expect(revealClientSrc).toMatch(
      /reduceMotion\s*\?\s*"reveal"\s*:\s*"transitioning"/,
    );
  });

  it("AuditTransition is rendered ONLY for the transitioning step (no overlap with reveal)", () => {
    expect(revealClientSrc).toMatch(
      /step === "transitioning"[\s\S]*?<AuditTransition/,
    );
  });
});

describe("Top recovery targets — ranked list mirrors the server import", () => {
  it("renders 'Your first move' / 'Your first N moves' depending on count", () => {
    expect(revealClientSrc).toContain('"Your first move"');
    expect(revealClientSrc).toMatch(/`Your first \$\{movesCount\} moves`/);
  });

  it("ranks by amount DESC — same order the server uses for the free gate", () => {
    expect(revealClientSrc).toMatch(
      /const ranked = \[\.\.\.parsed\.rows\]\.sort\(\(a, b\) => b\.amount - a\.amount\)/,
    );
    expect(revealClientSrc).toMatch(/const moves = ranked\.slice\(0, movesCount\)/);
  });

  it("caps the visible moves at 3, even for paid users importing everything", () => {
    expect(revealClientSrc).toMatch(
      /const movesCount = Math\.min\(3, isPaid \? count : willImport\)/,
    );
  });

  it("labels each row as 'email ready' or 'manual copy' — never invents auto-sending", () => {
    expect(revealClientSrc).toContain("email ready");
    expect(revealClientSrc).toContain("manual copy");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// No-email copy matrix — pure helper, tested directly
// ─────────────────────────────────────────────────────────────────────────

import {
  noEmailRevealCopy,
  AuditTransition,
} from "@/app/(app)/onboarding/reveal/transition-and-copy";
import { render, cleanup, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach as afterEachRev, vi } from "vitest";

describe("noEmailRevealCopy — free user matrix references 'your top N' explicitly", () => {
  it("0 valid rows → no line", () => {
    expect(
      noEmailRevealCopy({ willImport: 0, noEmailInImporting: 0, isPaid: false }),
    ).toBeNull();
  });

  it("free + 0 no-email + top 3 → affirms top 3 can auto-send", () => {
    expect(
      noEmailRevealCopy({ willImport: 3, noEmailInImporting: 0, isPaid: false }),
    ).toBe("Your top 3 can send automatically by email.");
  });

  it("free + 1 of top 3 has no email → exact spec wording", () => {
    expect(
      noEmailRevealCopy({ willImport: 3, noEmailInImporting: 1, isPaid: false }),
    ).toBe(
      "1 of your top 3 has no email — you'll send that one yourself. The other 2 can send automatically by email.",
    );
  });

  it("free + 2 of top 3 have no email", () => {
    expect(
      noEmailRevealCopy({ willImport: 3, noEmailInImporting: 2, isPaid: false }),
    ).toBe(
      "2 of your top 3 have no email — you'll send those yourself. The other one can send automatically by email.",
    );
  });

  it("free + all top 3 have no email → no auto-send promise", () => {
    const line = noEmailRevealCopy({
      willImport: 3,
      noEmailInImporting: 3,
      isPaid: false,
    });
    expect(line).toBe(
      "Your top 3 have no email — you'll send those yourself. Add emails later to switch them to automatic follow-up.",
    );
  });

  it("free + only 1 import (e.g. usage already consumed 2/3) uses 'top quote' singular", () => {
    expect(
      noEmailRevealCopy({ willImport: 1, noEmailInImporting: 0, isPaid: false }),
    ).toBe("Your top quote can send automatically by email.");
    expect(
      noEmailRevealCopy({ willImport: 1, noEmailInImporting: 1, isPaid: false }),
    ).toContain("Your top quote has no email");
  });

  it("paid + mixed → keeps 'these' wording (importing everything)", () => {
    expect(
      noEmailRevealCopy({ willImport: 7, noEmailInImporting: 2, isPaid: true }),
    ).toBe(
      "2 of these have no email — you'll send those yourself. The rest can send automatically by email.",
    );
  });

  it("paid + 0 no-email → suppress line (no clutter on the paid reveal)", () => {
    expect(
      noEmailRevealCopy({ willImport: 10, noEmailInImporting: 0, isPaid: true }),
    ).toBeNull();
  });

  it("paid + all no email", () => {
    expect(
      noEmailRevealCopy({ willImport: 5, noEmailInImporting: 5, isPaid: true }),
    ).toContain("None of these have an email yet");
  });

  it("never says 'parked', 'stored', or 'saved' anywhere", () => {
    for (const args of [
      { willImport: 3, noEmailInImporting: 0, isPaid: false },
      { willImport: 3, noEmailInImporting: 1, isPaid: false },
      { willImport: 3, noEmailInImporting: 3, isPaid: false },
      { willImport: 7, noEmailInImporting: 2, isPaid: true },
    ] as const) {
      const line = noEmailRevealCopy(args) ?? "";
      expect(line).not.toMatch(/\b(parked|stored|saved)\b/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AuditTransition — render contract
// ─────────────────────────────────────────────────────────────────────────

describe("AuditTransition — visible contract", () => {
  afterEachRev(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the Silent Quote Audit eyebrow", () => {
    render(React.createElement(AuditTransition, { messageIdx: 0 }));
    expect(screen.getByText(/Silent Quote Audit/i)).toBeTruthy();
  });

  it("renders the first message at idx 0", () => {
    render(React.createElement(AuditTransition, { messageIdx: 0 }));
    expect(screen.getByText(/Reading your pasted estimates/)).toBeTruthy();
  });

  it("clamps an out-of-range idx (defence in depth)", () => {
    render(React.createElement(AuditTransition, { messageIdx: 99 }));
    expect(screen.getByText(/Preparing your first recovery targets/)).toBeTruthy();
  });
});
