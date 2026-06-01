import { type NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  shouldVerifyResendMode,
  verifySvixSignature,
} from "@/lib/messaging/svix-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ack(): NextResponse {
  // 200-ack with a fixed body. Resend's webhook delivery retries on non-2xx
  // (which is fine — the RPC is idempotent), but a non-200 on the happy path
  // would waste their queue and our logs. Body is intentionally tiny and
  // contains zero internal state.
  return NextResponse.json({ ok: true });
}

type EmailEventPayload = {
  type?: unknown;
  data?: { email_id?: unknown } | null;
};

function pickString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const mode = shouldVerifyResendMode(process.env);
  if (mode === "reject") {
    return new NextResponse("Webhook misconfigured", { status: 503 });
  }

  const rawBody = await request.text();
  const svixId = request.headers.get("svix-id") ?? "";
  const svixTimestamp = request.headers.get("svix-timestamp") ?? "";
  const svixSignature = request.headers.get("svix-signature") ?? "";

  if (mode === "verify") {
    const ok = verifySvixSignature({
      secret: process.env.RESEND_WEBHOOK_SECRET ?? "",
      svixId,
      svixTimestamp,
      svixSignature,
      rawBody,
    });
    if (!ok) return new NextResponse("Invalid signature", { status: 401 });
  }

  if (!svixId) return ack();

  let payload: EmailEventPayload;
  try {
    payload = JSON.parse(rawBody) as EmailEventPayload;
  } catch {
    // Malformed body — ack so Resend stops retrying. Nothing to record.
    return ack();
  }

  const eventType = pickString(payload.type);
  const emailId = pickString(payload.data?.email_id);

  // Only opens/clicks move the counters today. Everything else
  // (delivered/bounced/complained/etc.) is recorded in the dedupe ledger so
  // future replays are no-ops, but the counters stay untouched.
  // The RPC does both atomically; we just forward the values.
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.rpc("record_email_event", {
    p_svix_id: svixId,
    p_event_type: eventType,
    p_email_id: emailId,
  });

  if (error) {
    // Log without echoing the request body or headers — never leak Svix
    // signatures or secrets into our logs.
    console.error(
      `[resend:webhook] record_email_event failed type=${eventType} code=${error.code ?? "unknown"}`,
    );
    // 500 lets Resend retry; the RPC's dedupe makes that safe.
    return new NextResponse("temporary failure", { status: 500 });
  }

  return ack();
}
