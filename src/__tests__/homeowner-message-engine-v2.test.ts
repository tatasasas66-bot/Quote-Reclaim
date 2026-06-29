import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  fallbackMessages,
  projectLabel,
  researchSequenceMessages,
} from "@/lib/ai/fallback-messages";
import {
  BANNED_PHRASES,
  CADENCE_DAYS,
  getProjectNoun,
  getProjectTypeOptions,
  getReplyPlaybook,
} from "@/lib/recovery/recovery-logic";
import {
  ONE_TAP_CHOICES,
  SPOUSE_APPROVAL_MARKER,
} from "@/lib/quotes/one-tap-choices";
import { recoveryEmailSubject } from "@/lib/messaging/select-channel";

function source(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative, import.meta.url)),
    "utf8",
  );
}

const context = {
  firstName: "Jane",
  trade: "Concrete",
  projectType: "Patio",
  estimateAmount: 8_500,
};

describe("homeowner message engine v2", () => {
  it("uses the Day 1 / 5 / 10 / 14 / 21 / 60 cadence", () => {
    expect(CADENCE_DAYS).toEqual({
      1: 1,
      2: 5,
      3: 10,
      4: 14,
      5: 21,
      6: 60,
    });
  });

  it("generates the corrected six-message patio sequence", () => {
    const sequence = researchSequenceMessages(context);
    expect(sequence).toEqual({
      day1:
        "Any question on the patio I can clear up? Scope, timing, or price — reply with which one.",
      day5:
        "Hi Jane — no pressure on the patio. If it's timing, budget, or scope, reply with which one and I'll sharpen it. If it's a pass, 'no' works too.",
      day10:
        "Should I keep the patio on my active list, or close it out? Either is fine — just tell me which.",
      day14:
        "I can keep the patio open, revise it, or close it out. Which helps most?",
      day21:
        "I'll close out the patio on my side so it's off your plate. If the timing changes later, text me here and I'll send a fresh number — no re-quote needed.",
      day60:
        "Saw this patio estimate from a while back. If the timing is better now, I can send a fresh number in 60 seconds. If not, no worries — I'll leave it closed.",
    });
  });

  it("stores exactly one Day 60 reopen-later row", () => {
    const plan = fallbackMessages(context);
    expect(plan).toHaveLength(6);
    expect(plan.filter((message) => message.followup_number === 6)).toHaveLength(
      1,
    );
    expect(plan[5]?.framework).toBe("Reopen Later");
    expect(plan[5]?.cta_type).toBe("statement");
  });

  it("keeps all default SMS copy concise and free of banned phrases", () => {
    for (const message of Object.values(researchSequenceMessages(context))) {
      expect(message.length).toBeLessThanOrEqual(160);
      for (const phrase of BANNED_PHRASES) {
        expect(message.toLowerCase()).not.toContain(phrase);
      }
    }
  });

  it("prefers project type and preserves legacy trade fallback", () => {
    expect(getProjectNoun("Concrete", "Patio")).toBe("patio");
    expect(getProjectNoun("Concrete", "Driveway")).toBe("driveway");
    expect(getProjectNoun("Concrete", null)).toBe("driveway");
    expect(getProjectTypeOptions("Concrete")).toContain("Patio");
    expect(projectLabel("Concrete", "Driveway")).toBe(
      "the driveway estimate",
    );
    expect(projectLabel("Concrete", null)).toBe("the concrete estimate");
  });

  it("adds spouse approval and manual persistent-silence branches", () => {
    const playbook = getReplyPlaybook("Concrete", 8_500, "Patio");
    expect(
      playbook.find((path) => path.id === "spouse_approval")?.response,
    ).toBe(
      "Makes sense — it's a big decision. Want me to send a quick summary you can forward to them? Just the scope, the total, and what's included.",
    );
    expect(
      playbook.find((path) => path.id === "no_response_breakup")?.response,
    ).toBe(
      "I'll stop following up on this one so it's not cluttering your inbox. If the patio comes back to mind, text me here anytime — no awkward restart.",
    );
  });

  it("maps spouse approval through the existing safe question marker", () => {
    const choice = ONE_TAP_CHOICES.find(
      (option) => option.id === "spouse_approval",
    );
    expect(choice).toMatchObject({
      answerType: "question",
      questionText: SPOUSE_APPROVAL_MARKER,
      playbookBranch: "spouse_approval",
    });
  });

  it("uses the project type in the plain email subject", () => {
    expect(recoveryEmailSubject("Concrete", "Patio")).toBe(
      "re: your patio estimate",
    );
  });
});

describe("project type persistence and delivery wiring", () => {
  const form = source("../components/quotes/QuoteForm.tsx");
  const actions = source("../lib/quotes/actions.ts");
  const cron = source("../app/api/cron/send/route.ts");
  const migration = source(
    "../../supabase/migrations/20260628203140_homeowner_message_engine_v2.sql",
  );

  it("lets create and edit forms choose or enter project_type", () => {
    expect(form).toContain('name="project_type"');
    expect(form).toContain("getProjectTypeOptions");
    expect(form).toContain("type the homeowner&apos;s actual project");
    expect(actions).toContain("project_type: input.project_type || null");
  });

  it("sends the claimed sequence row instead of replacing it by quote age", () => {
    expect(cron).toContain("const baseMessage = r.message_text");
    expect(cron).toContain("const smsBaseMessage = r.message_text");
    expect(cron).not.toContain("const ageAware =");
    expect(cron).toMatch(/followup_number === 6/g);
  });

  it("uses an additive nullable column without touching reminder constraints", () => {
    expect(migration).toMatch(
      /add column if not exists project_type text/i,
    );
    expect(migration).toMatch(/comment on column public\.quotes\.project_type/i);
    expect(migration).not.toMatch(
      /public\.reminders|constraint|drop column|drop table|delete from|truncate/i,
    );
  });
});
