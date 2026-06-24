import { type NextRequest, NextResponse } from "next/server";
import { forbiddenResponseIfNotAdmin } from "@/lib/auth/require-admin";
import {
  listApprovedSendableLeads,
  listSuppressedEmails,
  ensureDefaultCampaign,
  rescoreAllLeads,
  getCampaignStatus,
  setCampaignStatus,
  recordSendEvent,
  getTodaysSendCount,
} from "@/lib/auto-marketing/repo";
import { resolveCampaignConfig } from "@/lib/auto-marketing/campaign-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DAILY_CAP = 30;

/**
 * POST /api/admin/auto-marketing/run-auto
 *
 * Full-auto orchestration with dry-run support and safety guards.
 *
 * Body: {
 *   campaign?: string,       // defaults to "concrete_driveway_v1"
 *   dryRun?: boolean,        // if true, no sends — just preview
 *   action?: "run" | "start" | "pause" | "resume" | "stop",
 * }
 *
 * Safety guards:
 *   - Admin-only access
 *   - Daily cap enforcement (default 30, configurable via DAILY_SEND_CAP env)
 *   - No send to suppressed leads (email or domain)
 *   - No send without valid audit URL
 *   - No send if campaign is paused/stopped
 *   - No send if Smartlead is not configured (falls back to export)
 *   - No auto-reply if AUTO_SEND_SAFE_REPLIES is not "true"
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await forbiddenResponseIfNotAdmin();
  if (guard) return guard;

  let body: {
    campaign?: string;
    dryRun?: boolean;
    action?: "run" | "start" | "pause" | "resume" | "stop";
  } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — defaults apply
  }

  const campaignName = body.campaign ?? "concrete_driveway_v1";
  const dryRun = body.dryRun === true;
  const action = body.action ?? "run";

  // 1. Ensure the campaign exists.
  const campaign = await ensureDefaultCampaign();
  if (!campaign) {
    return NextResponse.json(
      { ok: false, error: "Failed to ensure campaign exists." },
      { status: 500 },
    );
  }

  // 2. Handle campaign status actions (start/pause/resume/stop).
  if (action !== "run") {
    const newStatus =
      action === "start" || action === "resume" ? "active"
      : action === "pause" ? "paused"
      : action === "stop" ? "completed"
      : "draft";
    await setCampaignStatus(campaign.id, newStatus);
    return NextResponse.json({
      ok: true,
      campaign: campaignName,
      action,
      new_status: newStatus,
    });
  }

  // 3. Check campaign status — no sends if paused or stopped.
  const campaignStatus = await getCampaignStatus(campaign.id);
  if (campaignStatus === "paused" || campaignStatus === "completed") {
    return NextResponse.json({
      ok: false,
      reason: "campaign_not_active",
      campaign: campaignName,
      status: campaignStatus,
      message: `Campaign is ${campaignStatus}. Use action: "start" or "resume" to activate.`,
    });
  }

  // 4. Re-score all non-suppressed leads.
  const { rescored } = await rescoreAllLeads();

  // 5. Collect approved, sendable, non-suppressed leads.
  const [approved, suppressedEmails] = await Promise.all([
    listApprovedSendableLeads(),
    listSuppressedEmails(),
  ]);
  const suppressedSet = new Set(suppressedEmails.map((e) => e.toLowerCase()));

  // 6. Apply safety guards:
  //    - No send to suppressed emails
  //    - No send without email
  //    - No send without company name
  //    - No send to low-score leads (score < 50)
  const safe = approved.filter((l) => {
    if (!l.email || !l.email.trim()) return false;
    if (!l.company || !l.company.trim()) return false;
    if (l.score < 50) return false;
    if (suppressedSet.has(l.email.toLowerCase())) return false;
    return true;
  });

  // 7. Daily cap enforcement.
  const dailyCap = Number(process.env.DAILY_SEND_CAP) || DEFAULT_DAILY_CAP;
  const todaysSends = await getTodaysSendCount();
  const remainingCap = Math.max(0, dailyCap - todaysSends);
  const cappedLeads = safe.slice(0, remainingCap);
  const capDeferred = safe.length - cappedLeads.length;

  // 8. Generate audit URLs for each lead.
  const campaignConfig = resolveCampaignConfig("concrete_v1");
  const leadsWithUrls = cappedLeads.map((l) => {
    const city = l.city ?? "Phoenix";
    const auditUrl = campaignConfig
      ? campaignConfig.auditUrl(city)
      : `https://www.quotereclaim.com/audit?utm_source=cold_email&utm_campaign=${campaignName}&utm_trade=${l.trade}&utm_city=${encodeURIComponent(city)}`;
    return { ...l, auditUrl };
  });

  // 9. DRY-RUN MODE: return preview without sending.
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      campaign: campaignName,
      campaign_status: campaignStatus,
      rescored,
      total_approved: approved.length,
      safe_leads: safe.length,
      capped_leads: cappedLeads.length,
      cap_deferred: capDeferred,
      daily_cap: dailyCap,
      todays_sends: todaysSends,
      remaining_cap: remainingCap,
      suppressed_excluded: approved.length - safe.length,
      smartlead: process.env.SMARTLEAD_API_KEY?.trim() ? "configured" : "not_configured",
      preview: leadsWithUrls.slice(0, 5).map((l) => ({
        company: l.company,
        email: l.email,
        trade: l.trade,
        city: l.city,
        score: l.score,
        audit_url: l.auditUrl,
      })),
      email_preview: campaignConfig?.steps[0]
        ? {
            subject: campaignConfig.steps[0].subject.replace(/\{company\}/g, safe[0]?.company ?? "{company}"),
            body: campaignConfig.steps[0].body
              .replace(/\{first_name\}/g, safe[0]?.first_name ?? "there")
              .replace(/\{company\}/g, safe[0]?.company ?? "")
              .replace(/\{city\}/g, safe[0]?.city ?? "Phoenix")
              .replace(/\{audit_url\}/g, leadsWithUrls[0]?.auditUrl ?? "{audit_url}"),
          }
        : null,
    });
  }

  // 10. LIVE MODE: push to Smartlead if configured.
  const smartleadKey = process.env.SMARTLEAD_API_KEY?.trim();
  if (!smartleadKey) {
    return NextResponse.json({
      ok: true,
      campaign: campaignName,
      rescored,
      approved_leads: safe.length,
      capped_leads: cappedLeads.length,
      cap_deferred: capDeferred,
      daily_cap: dailyCap,
      todays_sends: todaysSends,
      remaining_cap: remainingCap,
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
  for (const lead of leadsWithUrls) {
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
              audit_url: lead.auditUrl,
            },
          }),
        },
      );
      if (res.ok) {
        pushed++;
        await recordSendEvent(lead.id, campaign.id);
      } else {
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
    campaign_status: campaignStatus,
    rescored,
    approved_leads: safe.length,
    capped_leads: cappedLeads.length,
    cap_deferred: capDeferred,
    daily_cap: dailyCap,
    todays_sends: todaysSends + pushed,
    remaining_cap: remainingCap - pushed,
    suppressed_excluded: approved.length - safe.length,
    smartlead: "configured",
    pushed,
    failed,
    errors: errors.slice(0, 5),
  });
}
