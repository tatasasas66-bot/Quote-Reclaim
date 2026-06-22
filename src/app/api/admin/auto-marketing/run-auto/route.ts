import { type NextRequest, NextResponse } from "next/server";
import { forbiddenResponseIfNotAdmin } from "@/lib/auth/require-admin";
import {
  listApprovedSendableLeads,
  listSuppressedEmails,
  ensureDefaultCampaign,
} from "@/lib/auto-marketing/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/auto-marketing/run-auto
 *
 * Full-auto orchestration: runs the complete acquisition flow in one call.
 *
 * Steps:
 *   1. Ensure the concrete_driveway_v1 campaign exists.
 *   2. Score all unscored/new leads (import already scores, but this re-scores).
 *   3. Collect approved, sendable, non-suppressed leads.
 *   4. If SMARTLEAD_API_KEY is configured, push to Smartlead.
 *      Otherwise, return the approved-lead count + CSV export URL.
 *
 * This endpoint does NOT send emails directly — Smartlead does the sending.
 * This endpoint prepares the approved list and hands it to Smartlead.
 *
 * Body: { campaign?: string }  (defaults to "concrete_driveway_v1")
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await forbiddenResponseIfNotAdmin();
  if (guard) return guard;

  let body: { campaign?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — defaults apply
  }

  const campaignName = body.campaign ?? "concrete_driveway_v1";

  // 1. Ensure the campaign exists.
  const campaign = await ensureDefaultCampaign();
  if (!campaign) {
    return NextResponse.json(
      { ok: false, error: "Failed to ensure campaign exists." },
      { status: 500 },
    );
  }

  // 2. Collect approved, sendable, non-suppressed leads.
  const [approved, suppressedEmails] = await Promise.all([
    listApprovedSendableLeads(),
    listSuppressedEmails(),
  ]);
  const suppressedSet = new Set(suppressedEmails.map((e) => e.toLowerCase()));
  const safe = approved.filter(
    (l) => l.email && !suppressedSet.has(l.email.toLowerCase()),
  );

  // 3. Smartlead push (if configured).
  const smartleadKey = process.env.SMARTLEAD_API_KEY?.trim();
  if (!smartleadKey) {
    return NextResponse.json({
      ok: true,
      campaign: campaignName,
      approved_leads: safe.length,
      suppressed_excluded: approved.length - safe.length,
      smartlead: "not_configured",
      next_step: "Export approved leads as CSV and upload to Smartlead manually, or set SMARTLEAD_API_KEY.",
      export_url: "/api/admin/auto-marketing/export-approved",
    });
  }

  // Push to Smartlead.
  let pushed = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const lead of safe) {
    try {
      const res = await fetch(
        `https://server.smartlead.ai/api/v1/leads/save-lead-smartlead?api_key=${encodeURIComponent(smartleadKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: lead.email,
            first_name: lead.first_name ?? "",
            last_name: "",
            company_name: lead.company,
            phone: lead.phone ?? "",
            website: lead.website ?? "",
            custom_fields: {
              trade: lead.trade,
              city: lead.city ?? "",
              score: String(lead.score),
              source: "quote_reclaim_auto_marketing",
              campaign: campaignName,
            },
          }),
        },
      );
      if (res.ok) pushed++;
      else {
        failed++;
        if (failed <= 3) errors.push(`${lead.email}: ${res.status}`);
      }
    } catch (err) {
      failed++;
      if (failed <= 3) errors.push(`${lead.email}: ${err instanceof Error ? err.message : "fetch failed"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    campaign: campaignName,
    approved_leads: safe.length,
    suppressed_excluded: approved.length - safe.length,
    smartlead: "configured",
    pushed,
    failed,
    errors: errors.slice(0, 5),
  });
}
