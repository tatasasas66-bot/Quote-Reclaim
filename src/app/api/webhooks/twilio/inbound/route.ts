import { type NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  shouldVerifyMode,
  verifyTwilioSignature,
} from "@/lib/messaging/twilio-signature";
import { maskPhone, phoneCandidates } from "@/lib/messaging/phone";
import { classifyReply } from "@/lib/ai/classify-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOP_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);

function isStopMessage(body: string): boolean {
  const trimmed = body.trim().toUpperCase();
  if (!trimmed) return false;
  if (STOP_KEYWORDS.has(trimmed)) return true;
  if (trimmed === "STOP ALL") return true;
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  return STOP_KEYWORDS.has(firstToken);
}

function emptyTwiml(): NextResponse {
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { "Content-Type": "text/xml" } },
  );
}

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

  const from = formParams.From ?? "";
  const body = formParams.Body ?? "";
  const messageSid = formParams.MessageSid ?? "";

  if (!from || !messageSid) return emptyTwiml();

  const supabase = createServiceSupabaseClient();

  // Attribution rule: NEVER look up quotes globally by client_phone.
  // The most-recent outbound_messages row whose recipient matches the
  // inbound From determines the tenant + quote the reply belongs to.
  const recipients = phoneCandidates(from);
  const { data: outboundRows } = await supabase
    .from("outbound_messages")
    .select(
      "id, user_id, quote_id, recipient, status, provider_msg_id, reply_provider_msg_id, created_at",
    )
    .eq("channel", "sms")
    .in("recipient", recipients)
    .in("status", ["queued", "sent", "delivered", "replied"])
    .order("created_at", { ascending: false })
    .limit(1);

  const matched = (outboundRows ?? [])[0];

  if (!matched) {
    console.log(
      `[twilio:inbound] no match from=${maskPhone(from)} sid=${messageSid}`,
    );
    return emptyTwiml();
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, user_id, sequence_id, trade, city, state, estimate_amount",
    )
    .eq("id", matched.quote_id)
    .eq("user_id", matched.user_id)
    .maybeSingle();

  if (!quote) return emptyTwiml();

  const now = new Date().toISOString();
  const stopped = isStopMessage(body);
  const truncatedBody = body.slice(0, 1000);

  if (stopped) {
    await supabase
      .from("quotes")
      .update({ client_opted_out: true })
      .eq("id", quote.id)
      .eq("user_id", quote.user_id);

    await supabase
      .from("reminders")
      .update({ paused_at: now })
      .eq("quote_id", quote.id)
      .eq("user_id", quote.user_id)
      .eq("sent", false)
      .is("paused_at", null);

    const { error: evtError } = await supabase.from("recovery_events").insert({
      user_id: quote.user_id,
      sequence_id: quote.sequence_id,
      quote_id: quote.id,
      event_type: "opt_out",
      source_event_id: messageSid,
      trade: quote.trade,
      city: quote.city,
      state: quote.state,
      estimate_amount: quote.estimate_amount,
      channel: "sms",
      reply_text: truncatedBody,
    });
    if (evtError && evtError.code !== "23505") {
      console.error(
        "[twilio:inbound] opt_out event insert failed",
        evtError.message,
      );
    }

    return emptyTwiml();
  }

  // Regular reply: mark outbound as replied (skip if same inbound already recorded).
  if (
    matched.status !== "replied" ||
    matched.reply_provider_msg_id !== messageSid
  ) {
    await supabase
      .from("outbound_messages")
      .update({
        status: "replied",
        reply_text: truncatedBody,
        reply_at: now,
        reply_provider_msg_id: messageSid,
      })
      .eq("id", matched.id);
  }

  await supabase
    .from("reminders")
    .update({ paused_at: now })
    .eq("quote_id", quote.id)
    .eq("user_id", quote.user_id)
    .eq("sent", false)
    .is("paused_at", null);

  // Reply Radar: classify the reply intent up front. recovery_events is
  // append-only (no UPDATE), so the classification must be written with the
  // insert. classifyReply never throws and degrades to a keyword heuristic
  // when the fast model is unconfigured, so this never blocks reply capture.
  let replyIntent: string | null = null;
  try {
    replyIntent = await classifyReply(truncatedBody);
  } catch {
    replyIntent = null;
  }

  const { error: evtError } = await supabase.from("recovery_events").insert({
    user_id: quote.user_id,
    sequence_id: quote.sequence_id,
    quote_id: quote.id,
    event_type: "reply_received",
    source_event_id: messageSid,
    trade: quote.trade,
    city: quote.city,
    state: quote.state,
    estimate_amount: quote.estimate_amount,
    channel: "sms",
    reply_text: truncatedBody,
    reply_intent: replyIntent,
  });
  if (evtError && evtError.code !== "23505") {
    console.error(
      "[twilio:inbound] reply_received event insert failed",
      evtError.message,
    );
  }

  return emptyTwiml();
}
