/**
 * @vitest-environment happy-dom
 *
 * /audit cold landing page — funnel + copy guardrails.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";

import AuditPage from "@/app/audit/page";
import { AuditCalculatorClient } from "@/app/audit/AuditCalculatorClient";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const pageSrc = readSource("../app/audit/page.tsx");
const clientSrc = readSource("../app/audit/AuditCalculatorClient.tsx");

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Lightweight + no-auth contract
// ---------------------------------------------------------------------------

describe("/audit is a lightweight, no-auth landing page", () => {
  it("renders the hero without requiring auth", () => {
    render(<AuditPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /See what your silent painting quotes are worth\./i,
      }),
    ).toBeTruthy();
  });

  it("the page imports NO auth / Supabase / dashboard code", () => {
    expect(pageSrc).not.toMatch(/requireUser/);
    expect(pageSrc).not.toMatch(/supabase/i);
    expect(pageSrc).not.toMatch(/createServerSupabaseClient|createServiceSupabaseClient/);
    expect(pageSrc).not.toMatch(/from "@\/app\/\(app\)\/dashboard/);
    // No nav menu above the fold (brand mark only).
    expect(pageSrc).not.toMatch(/<nav/);
  });

  it("does not query Supabase or read env secrets in the client island", () => {
    expect(clientSrc).not.toMatch(/supabase/i);
    expect(clientSrc).not.toMatch(/SERVICE_ROLE|PADDLE_|WEBHOOK_SECRET/);
  });
});

// ---------------------------------------------------------------------------
// Funnel: value BEFORE signup
// ---------------------------------------------------------------------------

describe("funnel — value first, signup only after the result", () => {
  it("the initial primary action is the audit, NOT signup", () => {
    render(<AuditCalculatorClient />);
    expect(
      screen.getByRole("button", { name: /show me which quote to follow up first/i }),
    ).toBeTruthy();
    // No account CTA is shown before a result exists.
    expect(screen.queryByTestId("audit-signup-cta")).toBeNull();
  });

  it("calculates a result after a valid quote amount is entered", () => {
    render(<AuditCalculatorClient />);
    fireEvent.change(screen.getByLabelText(/quote #1 amount/i), {
      target: { value: "$8,500" },
    });
    fireEvent.change(screen.getByLabelText(/quote #2 amount/i), {
      target: { value: "4000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /show me which quote to follow up first/i }),
    );
    const result = screen.getByTestId("audit-result");
    expect(result).toBeTruthy();
    expect(result.textContent).toContain("$12,500");
    expect(result.textContent).toMatch(/Best first follow-up/i);
    expect(result.textContent).toMatch(/Suggested message/i);
  });

  it("shows the post-value account CTA only after the result appears", () => {
    render(<AuditCalculatorClient />);
    fireEvent.change(screen.getByLabelText(/quote #1 amount/i), {
      target: { value: "5000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /show me which quote to follow up first/i }),
    );
    const cta = screen.getByTestId("audit-signup-cta");
    expect(cta).toBeTruthy();
    expect(cta.textContent).toMatch(/Save this audit and run your first 3 quotes free/i);
    expect(cta.getAttribute("href")).toMatch(/^\/sign-up\?next=/);
  });

  it("shows a friendly validation message when no amount is entered", () => {
    render(<AuditCalculatorClient />);
    fireEvent.click(
      screen.getByRole("button", { name: /show me which quote to follow up first/i }),
    );
    expect(
      screen.getByText(/Enter at least one old quote amount to see your audit\./i),
    ).toBeTruthy();
    expect(screen.queryByTestId("audit-result")).toBeNull();
  });

  it("does not collect any customer name / email / phone field", () => {
    render(<AuditCalculatorClient />);
    expect(screen.queryByLabelText(/name/i)).toBeNull();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByLabelText(/phone/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Copy guardrails
// ---------------------------------------------------------------------------

describe("copy guardrails", () => {
  const both = `${pageSrc}\n${clientSrc}`.toLowerCase();

  it("contains no banned hype phrases", () => {
    for (const banned of [
      "guaranteed",
      "ai-powered",
      "hidden profit",
      "pure profit",
      "10x",
      "turn quotes into cash",
      "reclaimable revenue",
    ]) {
      expect(both).not.toContain(banned);
    }
  });

  it("includes the required honest framing phrases", () => {
    expect(both).toContain("no customer names needed for the audit");
    expect(both).toContain("no card");
    expect(both).toContain("not a crm");
    expect(both).toContain("not lead generation");
  });

  it("uses the exact above-the-fold headline + subhead + CTA + trust line", () => {
    expect(pageSrc).toContain("See what your silent painting quotes are worth.");
    expect(pageSrc).toContain(
      "Paste 3 old quote amounts. No customer names needed for the audit.",
    );
    expect(clientSrc).toContain("Show me which quote to follow up first");
    expect(clientSrc).toContain("First 3 quotes free. Not a CRM. Not lead generation.");
  });
});

// ---------------------------------------------------------------------------
// Analytics events wired (vendor-agnostic, no new vendor)
// ---------------------------------------------------------------------------

describe("analytics events are wired without adding a vendor in /audit", () => {
  it("fires the four funnel events from the client", () => {
    expect(clientSrc).toContain('track("audit_page_viewed"');
    expect(clientSrc).toContain('track("audit_started"');
    expect(clientSrc).toContain('track("audit_completed"');
    expect(clientSrc).toContain('track("audit_signup_clicked"');
  });

  it("uses the internal vendor-agnostic track helper, not a new SDK import", () => {
    expect(clientSrc).toContain('from "@/lib/analytics/track"');
    // The client must NOT import posthog-js directly (lazy-loaded by the
    // provider in the root layout instead, keeping /audit lightweight).
    expect(clientSrc).not.toMatch(/from ["']posthog-js["']/);
    expect(clientSrc).not.toMatch(/from ["'][^"']*googletagmanager[^"']*["']/);
    expect(clientSrc).not.toMatch(/from ["'][^"']*segment[^"']*["']/);
  });

  it("NEVER sends raw quote dollar amounts (privacy)", () => {
    // The bucketed field replaces a raw 'total'. Anything that would expose
    // the dollar figure verbatim is banned.
    expect(clientSrc).toContain("total_silent_quote_value_bucket");
    expect(clientSrc).toContain("bucketCurrency");
    expect(clientSrc).not.toMatch(/total:\s*audit\.totalSilentQuoteValue/);
    // No customer-identifying field names anywhere in the audit emit.
    expect(clientSrc).not.toMatch(/(client_name|client_email|customer_email|customer_name|phone|address)/i);
  });

  it("attaches captured UTMs to every funnel event", () => {
    expect(clientSrc).toContain('readUtms(window.location.search)');
    // audit_page_viewed, audit_started, audit_completed, audit_signup_clicked
    // each receive `utms` (or the captured set) as the props payload.
    expect(clientSrc).toMatch(/track\("audit_page_viewed", captured\)/);
    expect(clientSrc).toMatch(/track\("audit_started", utms\)/);
    expect(clientSrc).toMatch(/track\("audit_completed",[\s\S]*?\.\.\.utms/);
    expect(clientSrc).toMatch(/track\("audit_signup_clicked", utms\)/);
  });
});
