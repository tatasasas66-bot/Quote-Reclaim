import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const homepage = readFileSync(
  resolve(process.cwd(), "src/app/page.tsx"),
  "utf8",
);
const section = homepage.slice(
  homepage.indexOf('<SectionShell id="not-crm"'),
  homepage.indexOf('<SectionShell id="trades"'),
);

describe("Focused by design section", () => {
  it("uses the exact universal recovery-gap framing", () => {
    expect(section).toContain('eyebrow="FOCUSED BY DESIGN"');
    expect(section).toContain(
      'title="Built for the part after the estimate goes quiet."',
    );
    expect(section).toContain(
      "Your current system helps you create the estimate, send it, schedule jobs, and keep records.",
    );
    expect(section).toContain(
      "Quote Reclaim starts after that — when the homeowner goes silent and you need to know which estimate to reopen first, what to send today, and what to do next if they reply.",
    );
  });

  it.each([
    "Your current system",
    "creates estimates",
    "stores customer details",
    "schedules jobs",
    "sends invoices",
    "The gap",
    "estimates go quiet",
    "follow-up feels awkward",
    "old money sits untouched",
    "more leads get bought too soon",
    "Quote Reclaim",
    "ranks quiet estimates",
    "gives today’s message",
    "maps the next follow-up",
    "turns replies into next moves",
  ])("includes %s", (copy) => {
    expect(homepage).toContain(copy);
  });

  it("contains no named tools or spreadsheet reference", () => {
    expect(section).not.toMatch(
      /Jobber|Housecall|ServiceTitan|DripJobs|spreadsheet/i,
    );
  });
});
