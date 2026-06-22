import { type NextRequest, NextResponse } from "next/server";
import { ingestReply, markReplySent } from "@/lib/auto-marketing/repo";
import { forbiddenResponseIfNotAdmin } from "@/lib/auth/require-admin";
import { isDraftable } from "@/lib/auto-marketing/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/auto-marketing/reply-webhook
 *
 * Receives inbound reply payloads (from Smartlead reply webhooks, or manual
 * admin entry). Classifies deterministically, suppresses on
 * unsubscribe/not_interested/angry, and generates safe draft replies for
 * draftable classifications.
 *
 * When AUTO_SEND_SAFE_REPLIES=true AND SMARTLEAD_API_KEY is configured, the
 * webhook automatically sends the safe draft reply via Smartlead's reply API
 * for draftable classifications (interested, asks_price, asks_how_it_works,
 * lead_gen_confusion, existing_crm_objection, wrong_person).
 *
 * NEVER auto-sends for: unsubscribe, not_interested, angry, low_confidence.
 *
 * Auth: shared secret (REPLY_WEBHOOK_SECRET) OR admin session.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth: shared secret (for Smartlead webhooks) OR admin session.
  const secret = process.env.REPLY_WEBHOOK_SECRET;
  const headerSecret = request.headers.get("x-webhook-secret");
  const hasSecret = secret && headerSecret && headerSecret === secret;

  if (!hasSecret) {
    // Fall back to admin session guard.
    const guard = await forbiddenResponseIfNotAdmin();
    if (guard) return guard;
  }

  let payload: {
    lead_id?: string;
    email?: string;
    reply_body?: string;
    reply_date?: string;
    /** Smartlead lead ID for replying (optional — for auto-send). */
    smartlead_lead_id?: string;
    /** Smartlead campaign ID for replying (optional — for auto-send). */
    smartlead_campaign_id?: string;
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.email || !payload.reply_body) {
    return NextResponse.json(
      { error: "email and reply_body are required" },
      { status: 400 },
    );
  }

  const result = await ingestReply({
    lead_id: payload.lead_id ?? null,
    email: payload.email,
    reply_body: payload.reply_body,
    reply_date: payload.reply_date,
  });

  // Auto-send safe replies if explicitly enabled AND Smartlead is configured.
  const autoSend = process.env.AUTO_SEND_SAFE_REPLIES === "true";
  const smartleadKey = process.env.SMARTLEAD_API_KEY?.trim();
  let autoSent = false;

  if (
    autoSend &&
    smartleadKey &&
    result.reply?.draft_reply &&
    isDraftable(result.classification) &&
    !result.suppressed
  ) {
    try {
      const sent = await sendSmartleadReply({
        apiKey: smartleadKey,
        leadId: payload.smartlead_lead_id,
        campaignId: payload.smartlead_campaign_id,
        email: payload.email,
        message: result.reply.draft_reply,
      });
      if (sent && result.reply.id) {
        await markReplySent(result.reply.id);
        autoSent = true;
      }
    } catch {
      // Auto-send failure is non-fatal — the draft is still saved for manual review.
    }
  }

  return NextResponse.json({
    ok: true,
    classification: result.classification,
    suppressed: result.suppressed,
    reply_id: result.reply?.id ?? null,
    auto_sent: autoSent,
  });
}

/**
 * Send a reply via Smartlead's reply API.
 * https://docs.smartlead.ai/reference/post-campaign--campaignId--leads--leadId- -reply
 */
async function sendSmartleadReply(opts: {
  apiKey: string;
  leadId?: string;
  campaignId?: string;
  email: string;
  message: string;
}): Promise<boolean> {
  // Smartlead's reply endpoint requires lead_id + campaign_id. If not provided
  // in the webhook payload, we can't auto-send (the draft stays for manual review).
  if (!opts.leadId || !opts.campaignId) return false;

  const url = `https://server.smartlead.ai/api/v1/campaigns/${encodeURIComponent(opts.campaignId)}/leads/${encodeURIComponent(opts.leadId)}/reply?api_key=${encodeURIComponent(opts.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: opts.email,
      message: opts.message,
    }),
  });
  return res.ok;
}
