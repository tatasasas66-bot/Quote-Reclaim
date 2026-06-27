import { type NextRequest, NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-events";
import { isAuditEventsUnavailable } from "@/lib/audit-events";
import { sendRecoveryEmail } from "@/lib/messaging/email-provider";
import { appBaseUrl } from "@/lib/quotes/one-tap-reply";
import { requireCronAuth } from "@/lib/security/require-cron";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const auth = requireCronAuth(request);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const supabase = createServiceSupabaseClient();
  const now = Date.now();
  const { data: opened, error } = await supabase
    .from("audit_events")
    .select("user_id,quote_id,created_at")
    .eq("event_type", "sms_opened")
    .gte("created_at", new Date(now - 2 * DAY_MS).toISOString())
    .lte("created_at", new Date(now - DAY_MS).toISOString())
    .order("created_at", { ascending: false });
  if (error) {
    if (isAuditEventsUnavailable(error)) {
      return NextResponse.json({ sent: 0, skipped: "audit_events_unavailable" });
    }
    return NextResponse.json({ error: "Reply check load failed" }, { status: 500 });
  }

  let sent = 0;
  const seen = new Set<string>();
  for (const event of opened ?? []) {
    const quoteId = event.quote_id ? String(event.quote_id) : "";
    if (!quoteId || seen.has(quoteId)) continue;
    seen.add(quoteId);

    const [quoteResult, profileResult, laterEvents] = await Promise.all([
      supabase
        .from("quotes")
        .select("id,client_name,outcome")
        .eq("id", quoteId)
        .eq("user_id", event.user_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("email")
        .eq("id", event.user_id)
        .maybeSingle(),
      supabase
        .from("audit_events")
        .select("event_type,meta,created_at")
        .eq("user_id", event.user_id)
        .eq("quote_id", quoteId)
        .gt("created_at", event.created_at),
    ]);
    const quote = quoteResult.data;
    const email = profileResult.data?.email;
    if (!quote || quote.outcome !== "pending" || !email) continue;
    const later = laterEvents.data ?? [];
    if (later.some((row) => row.event_type === "reply_received")) continue;
    const priorPrompts = later.filter(
      (row) =>
        row.event_type === "no_reply_yet" &&
        row.meta?.source === "reply_check_email",
    );
    if (priorPrompts.length >= 3) continue;
    if (
      priorPrompts.some(
        (row) => now - Date.parse(row.created_at) < 23 * 60 * 60 * 1000,
      )
    ) {
      continue;
    }

    const daysAgo = Math.max(
      1,
      Math.floor((now - Date.parse(event.created_at)) / DAY_MS),
    );
    const result = await sendRecoveryEmail({
      to: String(email),
      subject: `Did ${quote.client_name} reply?`,
      body: [
        `${quote.client_name}'s text was sent ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago. Did they reply?`,
        "",
        `Yes · No · Not yet: ${appBaseUrl()}/dashboard?focus=reply-check`,
        "",
        "You send every text. We just hand you the next move.",
      ].join("\n"),
    });
    if (!result.ok) continue;
    sent += 1;
    await recordAuditEvent(supabase, {
      userId: String(event.user_id),
      quoteId,
      type: "no_reply_yet",
      meta: { source: "reply_check_email", attempt: priorPrompts.length + 1 },
    });
  }

  return NextResponse.json({ sent });
}
