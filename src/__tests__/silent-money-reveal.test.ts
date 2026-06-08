/**
 * Silent Money Reveal — parser, action contract, and routing wiring.
 *
 * The parser is unit-tested directly. The server action is verified by
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
  it("renders the 3-step flow: paste/preview/reveal", () => {
    expect(revealClientSrc).toContain('"input"');
    expect(revealClientSrc).toContain('"preview"');
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
    expect(revealClientSrc).toContain("noEmailImporting");
    expect(revealClientSrc).toMatch(/send the follow-ups yourself|send .* yourself/);
    expect(revealClientSrc).toMatch(/The rest send automatically by email|switch it to automatic/);
  });

  it("CTA copy never invents fake urgency or fake recovered revenue", () => {
    expect(revealClientSrc).not.toMatch(/limited time|last chance|only \d+ left/i);
    expect(revealClientSrc).not.toMatch(/guaranteed/i);
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
