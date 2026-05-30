import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { classifyReply, isReplyIntent } from "@/lib/ai/classify-reply";
import { suggestResponse } from "@/lib/ai/suggest-response";
import { sendRecoveryEmail } from "@/lib/messaging/email-provider";
import {
  parseFromEmail,
  stripQuotedReply,
} from "@/lib/messaging/strip-quoted-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ack(): NextResponse {
  // Inbound webhooks must ALWAYS 200-ack on shapes we choose to ignore —
  // returning anything else makes the provider retry indefinitely.
  return NextResponse.json({ ok: true });
}

type InboundPayload = {
  from?: unknown;
  subject?: unknown;
  text?: unknown;
  body?: unknown;
  messageId?: unknown;
  message_id?: unknown;
};

function pickString(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return "";
}

function appBaseUrl(): string {
  // Used only to build the "open the quote" link in the contractor email.
  // Defaults to the production host so a missing env doesn't leak a localhost
  // URL into a real notification.
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return "https://quotereclaim.com";
}

function notificationBody(args: {
  clientName: string;
  trade: string;
  intentLabel: string;
  replyText: string;
  suggestion: string;
  tactic: string;
  url: string;
}): string {
  const { clientName, trade, intentLabel, replyText, suggestion, tactic, url } =
    args;
  return [
    `${clientName} replied to your ${trade} estimate — ${intentLabel}.`,
    "",
    "Their reply:",
    replyText,
    "",
    "Suggested response (copy + send):",
    suggestion,
    "",
    `Why this works: ${tactic}`,
    "",
    `Open the quote: ${url}`,
  ].join("\n");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Shared-secret check, opt-in. When EMAIL_INBOUND_SECRET is set we require
  // the header; when it's unset we accept (dev / preview parity with the
  // shouldVerifyMode pattern used for Twilio).
  const secret = process.env.EMAIL_INBOUND_SECRET?.trim();
  if (secret) {
    const provided = request.headers.get("x-webhook-secret") ?? "";
    if (provided !== secret) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  let payload: InboundPayload;
  try {
    payload = (await request.json()) as InboundPayload;
  } catch {
    return ack();
  }

  const fromEmail = parseFromEmail(payload.from);
  if (!fromEmail) return ack();

  const rawBody = pickString(payload.text, payload.body);
  const replyText = stripQuotedReply(rawBody);
  const subject = pickString(payload.subject).slice(0, 300);
  const messageId =
    pickString(payload.messageId, payload.message_id) ||
    `email:${createHash("sha1").update(`${fromEmail}|${subject}|${replyText.slice(0, 200)}`).digest("hex")}`;

  const supabase = createServiceSupabaseClient();

  // Match: most recent open quote for this email. "Open" = not won, not
  // opted-out. Among candidates, prefer one with an active (unpaused, unsent)
  // reminder; otherwise fall back to the most recent.
  const { data: candidates } = await supabase
    .from("quotes")
    .select(
      "id, user_id, sequence_id, trade, city, state, estimate_amount, client_name, client_email, outcome, client_opted_out, created_at",
    )
    .ilike("client_email", fromEmail)
    .neq("outcome", "won")
    .order("created_at", { ascending: false })
    .limit(20);

  const open = (candidates ?? []).filter(
    (q) => !q.client_opted_out && q.outcome !== "won",
  );
  if (open.length === 0) {
    console.log(`[email:inbound] no match from=${fromEmail} msgid=${messageId}`);
    return ack();
  }

  let matched = open[0];
  if (open.length > 1) {
    const ids = open.map((q) => q.id);
    const { data: activeRows } = await supabase
      .from("reminders")
      .select("quote_id")
      .in("quote_id", ids)
      .eq("sent", false)
      .is("paused_at", null);
    const activeSet = new Set((activeRows ?? []).map((r) => r.quote_id));
    matched = open.find((q) => activeSet.has(q.id)) ?? open[0];
  }

  const now = new Date().toISOString();

  // Pause unsent reminders for this quote — mirrors the Twilio inbound flow.
  await supabase
    .from("reminders")
    .update({ paused_at: now })
    .eq("quote_id", matched.id)
    .eq("user_id", matched.user_id)
    .eq("sent", false)
    .is("paused_at", null);

  // Reply Radar: classify BEFORE the insert. recovery_events is append-only
  // (no UPDATE rule), so reply_intent must land with the row. classifyReply
  // never throws — it degrades to the deterministic heuristic when no fast
  // model is configured.
  let replyIntent: string | null = null;
  try {
    replyIntent = await classifyReply(replyText);
  } catch {
    replyIntent = null;
  }

  const { error: evtError } = await supabase.from("recovery_events").insert({
    user_id: matched.user_id,
    sequence_id: matched.sequence_id,
    quote_id: matched.id,
    event_type: "reply_received",
    source_event_id: messageId,
    trade: matched.trade,
    city: matched.city,
    state: matched.state,
    estimate_amount: matched.estimate_amount,
    channel: "email",
    reply_text: replyText,
    reply_intent: replyIntent,
  });
  if (evtError && evtError.code !== "23505") {
    console.error(
      "[email:inbound] reply_received event insert failed",
      evtError.message,
    );
    // Still try to notify — the contractor still wants to see the reply even
    // if the audit log row failed to write.
  }

  // Notify the contractor with the suggested response when we have a real
  // intent. We never invent suggestions for unclassifiable replies.
  if (isReplyIntent(replyIntent)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", matched.user_id)
      .maybeSingle();

    const contractorEmail = profile?.email?.trim();
    if (contractorEmail) {
      const suggestion = suggestResponse({
        intent: replyIntent,
        trade: matched.trade,
        estimateAmount: matched.estimate_amount,
        clientName: matched.client_name,
      });
      const subjectLine = `${matched.client_name} replied — ${suggestion.badgeLabel}`;
      const quoteUrl = `${appBaseUrl()}/quotes/${matched.id}`;
      const body = notificationBody({
        clientName: matched.client_name,
        trade: matched.trade,
        intentLabel: suggestion.label,
        replyText,
        suggestion: suggestion.message,
        tactic: suggestion.tactic,
        url: quoteUrl,
      });

      const result = await sendRecoveryEmail({
        to: contractorEmail,
        subject: subjectLine,
        body,
      });
      if (!result.ok) {
        console.error(
          "[email:inbound] contractor notification failed:",
          result.error,
        );
      }
    }
  }

  return ack();
}
