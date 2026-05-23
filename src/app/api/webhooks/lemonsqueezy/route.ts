import { type NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  shouldVerifyLemonMode,
  verifyLemonSignature,
} from "@/lib/payments/verify-webhook";
import { isPaidStatus } from "@/lib/payments/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LemonWebhookBody = {
  meta?: {
    event_name?: string;
    custom_data?: { user_id?: string };
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      status?: string;
      order_id?: number;
      subscription_id?: number;
      renews_at?: string | null;
      ends_at?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
  };
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const mode = shouldVerifyLemonMode(process.env);
  if (mode === "reject") {
    // Production without LEMONSQUEEZY_WEBHOOK_SECRET => fail closed.
    return new NextResponse("Webhook misconfigured", { status: 503 });
  }

  const rawBody = await request.text();

  if (mode === "verify") {
    const signature = request.headers.get("X-Signature") ?? "";
    const ok = verifyLemonSignature({
      secret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "",
      body: rawBody,
      signature,
    });
    if (!ok) return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: LemonWebhookBody;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Malformed body — accept (do not have Lemon retry forever).
    return new NextResponse("ok", { status: 200 });
  }

  const eventName = payload?.meta?.event_name ?? "";
  if (!eventName.startsWith("subscription_")) {
    // Phase 9 only handles subscription_* events. Ack anything else.
    return new NextResponse("ok", { status: 200 });
  }

  const userId = payload?.meta?.custom_data?.user_id;
  if (!userId || typeof userId !== "string") {
    // user_id is required for tenant attribution. 500 makes Lemon retry —
    // gives ops a window to fix a misconfigured checkout link if needed.
    return new NextResponse("Missing user_id", { status: 500 });
  }

  const attrs = payload.data?.attributes ?? {};
  const status = (attrs.status ?? "").toLowerCase();
  const paid = isPaidStatus(status);

  const supabase = createServiceSupabaseClient();

  const subscriptionId = payload.data?.id ?? null;
  const orderId = attrs.order_id != null ? String(attrs.order_id) : null;

  // Upsert subscriptions row. Idempotent on retry: same primary key (user_id)
  // overwrites with the same values when the webhook is replayed.
  const { error: subError } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      ls_subscription_id: subscriptionId,
      ls_order_id: orderId,
      status: status || "unknown",
      current_period_start: attrs.created_at ?? null,
      current_period_end: attrs.renews_at ?? attrs.ends_at ?? null,
    },
    { onConflict: "user_id" },
  );
  if (subError) {
    console.error("[lemon:webhook] subscription upsert failed", subError.message);
    return new NextResponse("Upsert failed", { status: 500 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ is_paid: paid })
    .eq("id", userId)
    .select("id");

  if (updateError) {
    console.error("[lemon:webhook] profile update failed", updateError.message);
    return new NextResponse("Update failed", { status: 500 });
  }
  if (!updated || updated.length === 0) {
    // No matching profile — let Lemon retry while ops investigates the
    // mismatch (e.g., user deleted their account between checkout and webhook).
    return new NextResponse("User not found", { status: 500 });
  }

  return new NextResponse("ok", { status: 200 });
}
