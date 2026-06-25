import { type NextRequest, NextResponse } from "next/server";
import { requireMarketingAutomationSecret } from "@/lib/marketing/admin";
import {
  getMarketingCampaignBySmartleadId,
  suppressFromReply,
  syncSmartleadLeadState,
} from "@/lib/marketing/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireMarketingAutomationSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = String(payload.event_type ?? payload.type ?? "").toUpperCase();
  const email = String(payload.lead_email ?? payload.email ?? "").toLowerCase();
  const smartleadCampaignId = String(payload.campaign_id ?? "");
  if (!email || !smartleadCampaignId) {
    return NextResponse.json(
      { error: "lead_email and campaign_id are required" },
      { status: 400 },
    );
  }
  const campaign = await getMarketingCampaignBySmartleadId(smartleadCampaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not mapped" }, { status: 404 });
  }

  const replyText = String(
    payload.reply_body ?? payload.reply_text ?? payload.message ?? "",
  );
  if (replyText) {
    await suppressFromReply({ campaignId: campaign.id, email, replyText });
  }
  const replyStatus =
    eventType.includes("UNSUBSCRIB")
      ? "unsubscribed"
      : eventType.includes("BOUNCE")
        ? "bounced"
        : eventType.includes("REPLY")
          ? "replied"
          : "none";
  const suppressionReason =
    replyStatus === "unsubscribed"
      ? "smartlead_unsubscribed"
      : replyStatus === "bounced"
        ? "smartlead_bounced"
        : null;
  await syncSmartleadLeadState({
    campaignId: campaign.id,
    email,
    smartleadLeadId:
      payload.lead_id != null ? String(payload.lead_id) : null,
    smartleadStatus: eventType || null,
    replyStatus,
    suppressionReason,
  });
  return NextResponse.json({ ok: true, reply_status: replyStatus });
}
