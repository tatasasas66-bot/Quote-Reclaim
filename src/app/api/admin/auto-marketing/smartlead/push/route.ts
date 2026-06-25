import { type NextRequest, NextResponse } from "next/server";
import { forbiddenResponseIfNotAdmin } from "@/lib/auth/require-admin";
import { listApprovedSendableLeads, listSuppressedEmails } from "@/lib/auto-marketing/repo";
import {
  hasCompliancePostalAddress,
  LIVE_COMPLIANCE_BLOCK_REASON,
} from "@/lib/marketing/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/auto-marketing/smartlead/push
 *
 * Pushes approved, non-suppressed leads to Smartlead via their API.
 * If SMARTLEAD_API_KEY is not configured, returns a clear "not configured"
 * status so the admin UI can fall back to CSV export.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await forbiddenResponseIfNotAdmin();
  if (guard) return guard;

  if (!hasCompliancePostalAddress()) {
    return NextResponse.json(
      { ok: false, dry_run_allowed: true, error: LIVE_COMPLIANCE_BLOCK_REASON },
      { status: 409 },
    );
  }

  const apiKey = process.env.SMARTLEAD_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json(
      {
        ok: false,
        reason: "not_configured",
        message: "Smartlead not configured. Set SMARTLEAD_API_KEY or use CSV export.",
      },
      { status: 200 },
    );
  }

  let body: { campaign_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — campaign_id optional
  }

  const [approved, suppressedEmails] = await Promise.all([
    listApprovedSendableLeads(),
    listSuppressedEmails(),
  ]);
  const suppressedSet = new Set(suppressedEmails.map((e) => e.toLowerCase()));
  const safe = approved.filter(
    (l) => l.email && !suppressedSet.has(l.email.toLowerCase()),
  );

  if (safe.length === 0) {
    return NextResponse.json({ ok: true, pushed: 0, message: "No approved leads to push." });
  }

  // Smartlead API: POST https://server.smartlead.ai/api/v1/leads/save-lead-smartlead
  // Docs: https://docs.smartlead.ai/reference/post-leads
  // We push lead-by-lead (Smartlead's bulk endpoint shape varies by plan).
  let pushed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const lead of safe) {
    try {
      const res = await fetch(
        `https://server.smartlead.ai/api/v1/leads/save-lead-smartlead?api_key=${encodeURIComponent(apiKey)}`,
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
            },
            campaign_id: body.campaign_id,
          }),
        },
      );
      if (res.ok) {
        pushed++;
      } else {
        failed++;
        if (failed <= 3) {
          errors.push(`${lead.email}: ${res.status} ${res.statusText}`);
        }
      }
    } catch (err) {
      failed++;
      if (failed <= 3) {
        errors.push(`${lead.email}: ${err instanceof Error ? err.message : "fetch failed"}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    pushed,
    failed,
    total: safe.length,
    errors: errors.slice(0, 5),
  });
}
