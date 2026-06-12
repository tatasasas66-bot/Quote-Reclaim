/**
 * Customer-facing sender identity for recovery emails.
 *
 * The homeowner must see the contractor/business, not the SaaS brand — while
 * deliverability stays on the verified Quote Reclaim domain. We change only the
 * From DISPLAY NAME; the address is always hello@quotereclaim.com.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  contractorDisplayName,
  recoveryFromHeader,
  sanitizeDisplayName,
  readableNameFromEmail,
  VERIFIED_SENDER_ADDRESS,
  DEFAULT_FROM,
} from "@/lib/messaging/sender-identity";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

// ───────────────────────────────────────────────────────────────────────
// Display-name fallback order
// ───────────────────────────────────────────────────────────────────────

describe("contractorDisplayName fallback order", () => {
  it("1. business/company name wins when present", () => {
    expect(
      contractorDisplayName({
        businessName: "Roy's Painting",
        contractorName: "Roy Smith",
        contractorEmail: "roy@x.com",
      }),
    ).toBe("Roy's Painting");
  });

  it("2. contractor full name when no business name", () => {
    expect(
      contractorDisplayName({
        businessName: null,
        contractorName: "Roy Smith",
        contractorEmail: "roy@x.com",
      }),
    ).toBe("Roy Smith");
  });

  it("3. readable email local-part when no business or name", () => {
    expect(
      contractorDisplayName({ contractorEmail: "roys.painting@gmail.com" }),
    ).toBe("Roys Painting");
    expect(
      contractorDisplayName({ contractorEmail: "dallasroofco@x.com" }),
    ).toBe("Dallasroofco");
  });

  it("4. final fallback 'Your contractor' when nothing usable", () => {
    expect(contractorDisplayName({})).toBe("Your contractor");
    expect(contractorDisplayName({ contractorEmail: "@x.com" })).toBe("Your contractor");
    expect(contractorDisplayName({ contractorEmail: "   " })).toBe("Your contractor");
  });
});

// ───────────────────────────────────────────────────────────────────────
// Sanitization — header-injection safety
// ───────────────────────────────────────────────────────────────────────

describe("sanitizeDisplayName strips anything that breaks/injects headers", () => {
  it("removes CR/LF (header injection)", () => {
    const out = sanitizeDisplayName("Roy\r\nBcc: evil@x.com");
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toBe("Roy Bcc: evil@x.com");
  });

  it("removes angle brackets and double quotes (From grammar delimiters)", () => {
    expect(sanitizeDisplayName('Roy <evil@x.com>')).toBe("Roy evil@x.com");
    expect(sanitizeDisplayName('Roy "the boss"')).toBe("Roy the boss");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeDisplayName("  Roy   the   Painter  ")).toBe("Roy the Painter");
  });

  it("caps length to keep the From header reasonable", () => {
    const long = "A".repeat(200);
    expect(sanitizeDisplayName(long).length).toBeLessThanOrEqual(60);
  });

  it("null/undefined → empty string", () => {
    expect(sanitizeDisplayName(null)).toBe("");
    expect(sanitizeDisplayName(undefined)).toBe("");
  });
});

describe("readableNameFromEmail", () => {
  it("splits separators into Title Case words", () => {
    expect(readableNameFromEmail("roys.painting@gmail.com")).toBe("Roys Painting");
    expect(readableNameFromEmail("dallas_roof_co@x.com")).toBe("Dallas Roof Co");
    expect(readableNameFromEmail("mike-smith+tag@x.com")).toBe("Mike Smith Tag");
  });

  it("empty/garbage → empty", () => {
    expect(readableNameFromEmail("@x.com")).toBe("");
    expect(readableNameFromEmail(null)).toBe("");
  });
});

// ───────────────────────────────────────────────────────────────────────
// recoveryFromHeader — full From header
// ───────────────────────────────────────────────────────────────────────

describe("recoveryFromHeader builds a safe '{name} via Quote Reclaim' header", () => {
  it("is NOT plain 'Quote Reclaim <addr>'", () => {
    const header = recoveryFromHeader({ contractorEmail: "roys.painting@x.com" });
    expect(header).not.toBe(DEFAULT_FROM);
    expect(header).not.toBe("Quote Reclaim <hello@quotereclaim.com>");
  });

  it("business name → '\"Roy's Painting via Quote Reclaim\" <hello@quotereclaim.com>'", () => {
    expect(recoveryFromHeader({ businessName: "Roy's Painting" })).toBe(
      `"Roy's Painting via Quote Reclaim" <${VERIFIED_SENDER_ADDRESS}>`,
    );
  });

  it("name fallback when no business name", () => {
    expect(
      recoveryFromHeader({ businessName: null, contractorName: "Dallas Roof Co" }),
    ).toBe(`"Dallas Roof Co via Quote Reclaim" <${VERIFIED_SENDER_ADDRESS}>`);
  });

  it("email-derived name when only email is known", () => {
    expect(recoveryFromHeader({ contractorEmail: "roys.painting@x.com" })).toBe(
      `"Roys Painting via Quote Reclaim" <${VERIFIED_SENDER_ADDRESS}>`,
    );
  });

  it("final fallback 'Your contractor via Quote Reclaim'", () => {
    expect(recoveryFromHeader({})).toBe(
      `"Your contractor via Quote Reclaim" <${VERIFIED_SENDER_ADDRESS}>`,
    );
  });

  it("ALWAYS keeps the verified sending address (deliverability/SPF/DKIM intact)", () => {
    for (const id of [
      { businessName: "Roy's Painting" },
      { contractorName: "Mike Smith" },
      { contractorEmail: "x@y.com" },
      {},
      { businessName: "Evil\r\nBcc: a@b.com" },
    ]) {
      const header = recoveryFromHeader(id);
      expect(header.endsWith(`<${VERIFIED_SENDER_ADDRESS}>`)).toBe(true);
      // No CR/LF anywhere in the final header.
      expect(header).not.toMatch(/[\r\n]/);
      // The display portion is double-quoted and contains no stray quote.
      const inner = header.slice(0, header.lastIndexOf(" <"));
      expect(inner.startsWith('"')).toBe(true);
      expect(inner.endsWith('"')).toBe(true);
      expect(inner.slice(1, -1)).not.toMatch(/["<>]/);
    }
  });

  it("a header-injection business name cannot smuggle headers (CR/LF stripped)", () => {
    const header = recoveryFromHeader({
      businessName: "Roy\r\nBcc: evil@x.com",
    });
    // The newline is gone, so "Bcc:" can only ever live inside the quoted
    // display name as literal text — never as a separate header line.
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.endsWith(`<${VERIFIED_SENDER_ADDRESS}>`)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Wiring — both customer-facing paths use the helper; internal mail does not
// ───────────────────────────────────────────────────────────────────────

describe("send paths use the contractor identity", () => {
  const provider = read("src/lib/messaging/email-provider.ts");
  const cron = read("src/app/api/cron/send/route.ts");
  const actions = read("src/lib/quotes/actions.ts");
  const inbound = read("src/app/api/webhooks/email-inbound/route.ts");

  it("email-provider takes a per-send `from` and defaults to the brand for system mail", () => {
    expect(provider).toMatch(/from\?: string/);
    expect(provider).toMatch(/from: params\.from \?\? DEFAULT_FROM/);
    // The old hardcoded FROM_EMAIL constant is gone.
    expect(provider).not.toMatch(/const FROM_EMAIL =/);
  });

  it("CRON path passes recoveryFromHeader built from the contractor profile email", () => {
    expect(cron).toContain("recoveryFromHeader");
    expect(cron).toMatch(/from: recoveryFromHeader\(\{\s*contractorEmail: senderEmailByUser\.get\(r\.user_id\)/);
    // Batch lookup, identical source to the manual path (profiles.email).
    expect(cron).toMatch(/\.from\("profiles"\)\s*\.select\("id, email"\)/);
  });

  it("MANUAL Send-today path passes recoveryFromHeader built from the contractor profile email", () => {
    expect(actions).toContain("recoveryFromHeader");
    expect(actions).toMatch(/from: recoveryFromHeader\(\{ contractorEmail: senderProfile\?\.email/);
    expect(actions).toMatch(/\.from\("profiles"\)\s*\.select\("email"\)/);
  });

  it("INBOUND contractor-notification stays on the brand From (it is NOT customer-facing)", () => {
    // The inbound webhook emails the CONTRACTOR about a reply — that should
    // still come from Quote Reclaim, so it must NOT use recoveryFromHeader.
    expect(inbound).not.toContain("recoveryFromHeader");
  });

  it("One-Tap Reply link is still appended to the homeowner email body (cron)", () => {
    // Sender-identity change must not touch the body composition.
    expect(cron).toMatch(/Quick reply: \$\{oneTapLink\.url\}/);
    expect(cron).toMatch(/issueOneTapLink\(supabase, r\.quote_id, null\)/);
  });

  it("Reply-To / inbound routing unchanged: no reply_to is set, so replies go to the verified From address the inbound webhook watches", () => {
    // We never set a reply_to; replies route to hello@quotereclaim.com (the
    // From address), which is exactly what the inbound webhook ingests. The
    // display-name change does not alter that address.
    expect(provider).not.toMatch(/reply_to|replyTo/);
    expect(provider).toMatch(/from: params\.from \?\? DEFAULT_FROM/);
  });
});
