import { type NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  shouldVerifyMode,
  verifyTwilioSignature,
} from "@/lib/messaging/twilio-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 'replied' is terminal and outranks every delivery status. The status
// callback must never downgrade a row that already saw an inbound reply.
function precedence(status: string): number {
  switch (status) {
    case "queued":
      return 1;
    case "sent":
      return 2;
    case "delivered":
      return 3;
    case "undelivered":
      return 3;
    case "failed":
      return 3;
    case "replied":
      return 9;
    default:
      return 0;
  }
}

const VALID_STATUSES = new Set([
  "queued",
  "sent",
  "delivered",
  "undelivered",
  "failed",
]);

function parseForm(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const usp = new URLSearchParams(raw);
  usp.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const mode = shouldVerifyMode(process.env);
  if (mode === "reject") {
    return new NextResponse("Webhook misconfigured", { status: 503 });
  }

  const rawBody = await request.text();
  const formParams = parseForm(rawBody);

  if (mode === "verify") {
    const signature = request.headers.get("X-Twilio-Signature") ?? "";
    const ok = verifyTwilioSignature({
      authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
      url: request.url,
      formParams,
      signature,
    });
    if (!ok) return new NextResponse("Invalid signature", { status: 401 });
  }

  const messageSid = formParams.MessageSid ?? "";
  const newStatus = (formParams.MessageStatus ?? "").toLowerCase();
  const errorCode = formParams.ErrorCode || null;
  const errorMessage = formParams.ErrorMessage || null;

  if (!messageSid || !VALID_STATUSES.has(newStatus)) {
    return new NextResponse("ok", { status: 200 });
  }

  const supabase = createServiceSupabaseClient();

  const { data: matched } = await supabase
    .from("outbound_messages")
    .select("id, user_id, quote_id, status, delivered_at")
    .eq("provider_msg_id", messageSid)
    .maybeSingle();

  if (!matched) return new NextResponse("ok", { status: 200 });

  if (precedence(newStatus) <= precedence(matched.status)) {
    return new NextResponse("ok", { status: 200 });
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === "delivered" && !matched.delivered_at) {
    update.delivered_at = now;
  }
  if (newStatus === "failed" || newStatus === "undelivered") {
    const tag = errorCode ? `${errorCode}: ${errorMessage ?? ""}`.trim() : errorMessage;
    update.failure_reason = tag ?? "unknown";
  }

  await supabase
    .from("outbound_messages")
    .update(update)
    .eq("id", matched.id)
    .eq("provider_msg_id", messageSid);

  if (newStatus === "delivered") {
    const { data: quote } = await supabase
      .from("quotes")
      .select("sequence_id, trade, city, state, estimate_amount")
      .eq("id", matched.quote_id)
      .maybeSingle();

    if (quote) {
      const { error: evtError } = await supabase.from("recovery_events").insert({
        user_id: matched.user_id,
        sequence_id: quote.sequence_id,
        quote_id: matched.quote_id,
        event_type: "message_delivered",
        source_event_id: messageSid,
        trade: quote.trade,
        city: quote.city,
        state: quote.state,
        estimate_amount: quote.estimate_amount,
        channel: "sms",
      });
      if (evtError && evtError.code !== "23505") {
        console.error(
          "[twilio:status] message_delivered event insert failed",
          evtError.message,
        );
      }
    }
  }

  return new NextResponse("ok", { status: 200 });
}
