import { NextResponse } from "next/server";
import { forbiddenResponseIfNotAdmin } from "@/lib/auth/require-admin";
import { listApprovedSendableLeads, listSuppressedEmails } from "@/lib/auto-marketing/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/auto-marketing/export-approved
 *
 * Exports approved, non-suppressed leads as a Smartlead-ready CSV.
 * Suppressed emails are always excluded — this is a hard safety rail.
 */
export async function GET(): Promise<NextResponse> {
  const guard = await forbiddenResponseIfNotAdmin();
  if (guard) return guard;

  const [approved, suppressedEmails] = await Promise.all([
    listApprovedSendableLeads(),
    listSuppressedEmails(),
  ]);

  const suppressedSet = new Set(suppressedEmails.map((e) => e.toLowerCase()));
  const safe = approved.filter(
    (l) => l.email && !suppressedSet.has(l.email.toLowerCase()),
  );

  const headers = [
    "email",
    "first_name",
    "company",
    "phone",
    "website",
    "city",
    "state",
    "trade",
    "niche",
    "score",
  ];
  const lines = [headers.join(",")];
  for (const l of safe) {
    const cells = [
      csvCell(l.email ?? ""),
      csvCell(l.first_name ?? ""),
      csvCell(l.company),
      csvCell(l.phone ?? ""),
      csvCell(l.website ?? ""),
      csvCell(l.city ?? ""),
      csvCell(l.state ?? ""),
      csvCell(l.trade),
      csvCell(l.niche ?? ""),
      String(l.score),
    ];
    lines.push(cells.join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="approved-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
