import { type NextRequest, NextResponse } from "next/server";
import { ingestReply } from "@/lib/auto-marketing/repo";
import { forbiddenResponseIfNotAdmin } from "@/lib/auth/require-admin";

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
 * This endpoint is webhook-style: it accepts a shared secret via the
 * X-Webhook-Secret header (REPLY_WEBHOOK_SECRET env) OR an admin session.
 * The shared secret path is for Smartlead's automated reply forwarding.
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

  return NextResponse.json({
    ok: true,
    classification: result.classification,
    suppressed: result.suppressed,
    reply_id: result.reply?.id ?? null,
  });
}
