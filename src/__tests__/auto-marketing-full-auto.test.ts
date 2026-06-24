/**
 * Full auto acquisition engine tests — dry-run, daily cap, campaign controls,
 * domain/bounce suppression, expanded reply categories.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifyReply,
  isSuppressing,
  isDraftable,
  draftReplyFor,
} from "@/lib/auto-marketing/classify";

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const runAutoSrc = readSource("../app/api/admin/auto-marketing/run-auto/route.ts");
const repoSrc = readSource("../lib/auto-marketing/repo.ts");

// ---------------------------------------------------------------------------
// Dry-run mode
// ---------------------------------------------------------------------------

describe("dry-run mode", () => {
  it("run-auto route accepts dryRun parameter", () => {
    expect(runAutoSrc).toMatch(/dryRun/);
  });
  it("dry-run returns preview without sending", () => {
    expect(runAutoSrc).toMatch(/if \(dryRun\)/);
    expect(runAutoSrc).toMatch(/dry_run: true/);
  });
  it("dry-run shows leads selected + email preview", () => {
    expect(runAutoSrc).toMatch(/preview/);
    expect(runAutoSrc).toMatch(/email_preview/);
  });
  it("dry-run shows estimated sends + suppression decisions", () => {
    expect(runAutoSrc).toMatch(/safe_leads/);
    expect(runAutoSrc).toMatch(/suppressed_excluded/);
    expect(runAutoSrc).toMatch(/capped_leads/);
  });
});

// ---------------------------------------------------------------------------
// Daily cap enforcement
// ---------------------------------------------------------------------------

describe("daily cap enforcement", () => {
  it("run-auto route enforces daily cap", () => {
    expect(runAutoSrc).toMatch(/dailyCap/);
    expect(runAutoSrc).toMatch(/remainingCap/);
    expect(runAutoSrc).toMatch(/cappedLeads/);
  });
  it("default cap is 30", () => {
    expect(runAutoSrc).toMatch(/DEFAULT_DAILY_CAP = 30/);
  });
  it("cap is configurable via DAILY_SEND_CAP env", () => {
    expect(runAutoSrc).toMatch(/process\.env\.DAILY_SEND_CAP/);
  });
  it("repo has getTodaysSendCount + recordSendEvent", () => {
    expect(repoSrc).toMatch(/getTodaysSendCount/);
    expect(repoSrc).toMatch(/recordSendEvent/);
  });
});

// ---------------------------------------------------------------------------
// Campaign controls
// ---------------------------------------------------------------------------

describe("campaign controls", () => {
  it("run-auto route supports start/pause/resume/stop actions", () => {
    expect(runAutoSrc).toMatch(/action.*start.*pause.*resume.*stop/);
  });
  it("repo has getCampaignStatus + setCampaignStatus", () => {
    expect(repoSrc).toMatch(/getCampaignStatus/);
    expect(repoSrc).toMatch(/setCampaignStatus/);
  });
  it("no send when campaign is paused or completed", () => {
    expect(runAutoSrc).toMatch(/campaign_not_active/);
    expect(runAutoSrc).toMatch(/paused.*completed/);
  });
});

// ---------------------------------------------------------------------------
// Safety guards
// ---------------------------------------------------------------------------

describe("safety guards", () => {
  it("no send without email", () => {
    expect(runAutoSrc).toMatch(/!l\.email/);
  });
  it("no send without company name", () => {
    expect(runAutoSrc).toMatch(/!l\.company/);
  });
  it("no send to low-score leads (score < 50)", () => {
    expect(runAutoSrc).toMatch(/l\.score < 50/);
  });
  it("no send to suppressed emails", () => {
    expect(runAutoSrc).toMatch(/suppressedSet/);
  });
  it("generates audit URL for each lead", () => {
    expect(runAutoSrc).toMatch(/auditUrl/);
  });
  it("admin guard is checked first", () => {
    expect(runAutoSrc).toMatch(/forbiddenResponseIfNotAdmin/);
  });
});

// ---------------------------------------------------------------------------
// Domain suppression
// ---------------------------------------------------------------------------

describe("domain suppression", () => {
  it("repo has suppressDomain function", () => {
    expect(repoSrc).toMatch(/export async function suppressDomain/);
  });
  it("repo has listSuppressedDomains function", () => {
    expect(repoSrc).toMatch(/export async function listSuppressedDomains/);
  });
});

// ---------------------------------------------------------------------------
// Bounce suppression
// ---------------------------------------------------------------------------

describe("bounce suppression", () => {
  it("repo has suppressBouncedEmail function", () => {
    expect(repoSrc).toMatch(/export async function suppressBouncedEmail/);
  });
});

// ---------------------------------------------------------------------------
// Expanded reply categories
// ---------------------------------------------------------------------------

describe("expanded reply categories", () => {
  it("classifies 'show me a demo' as wants_demo", () => {
    expect(classifyReply("Can you show me a demo?").classification).toBe("wants_demo");
  });
  it("classifies 'out of office' as out_of_office", () => {
    expect(classifyReply("I'm out of office until Monday").classification).toBe("out_of_office");
  });
  it("classifies bounce notification as bounced", () => {
    expect(classifyReply("Delivery failed: mailbox full").classification).toBe("bounced");
  });
  it("bounced is a suppressing classification", () => {
    expect(isSuppressing("bounced")).toBe(true);
  });
  it("out_of_office is NOT a suppressing classification", () => {
    expect(isSuppressing("out_of_office")).toBe(false);
  });
  it("wants_demo is a draftable classification", () => {
    expect(isDraftable("wants_demo")).toBe(true);
  });
  it("wants_demo has a draft reply", () => {
    expect(draftReplyFor("wants_demo")).not.toBeNull();
    expect(draftReplyFor("wants_demo")).toContain("quotereclaim.com/audit");
  });
  it("out_of_office does not get a draft reply", () => {
    expect(draftReplyFor("out_of_office")).toBeNull();
  });
  it("bounce does not get a draft reply", () => {
    expect(draftReplyFor("bounced")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Banned phrases still enforced
// ---------------------------------------------------------------------------

describe("banned phrases still enforced", () => {
  it("no message contains 'just checking in'", () => {
    const r = classifyReply("test reply");
    expect(r.classification).not.toContain("just checking in");
  });
});
