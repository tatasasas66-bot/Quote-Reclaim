import { type NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  shouldVerifyPaddleMode,
  verifyPaddleSignature,
} from "@/lib/payments/paddle-signature";
import {
  mapPaddleEvent,
  parsePaddleWebhookPayload,
  type SubscriptionTransition,
} from "@/lib/payments/paddle-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paddle billing webhook.
 *
 * Verifies the `paddle-signature` header against the raw body using
 * PADDLE_WEBHOOK_SECRET (HMAC-SHA256), then idempotently processes the
 * subscription lifecycle event. The endpoint returns 200 fast on every
 * already-seen event so Paddle's at-least-once retries never double-apply.
 *
 * The user_id is pulled from `data.custom_data.user_id` — the checkout
 * button is required to attach the authenticated user's id there. We
 * never trust a Paddle event to flip entitlement for an arbitrary user
 * without that pinning.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const mode = shouldVerifyPaddleMode(process.env);
  if (mode === "reject") {
    return new NextResponse("Webhook misconfigured", { status: 503 });
  }

  const rawBody = await request.text();
  const sigHeader = request.headers.get("paddle-signature") ?? "";

  if (mode === "verify") {
    const ok = verifyPaddleSignature({
      secret: process.env.PADDLE_WEBHOOK_SECRET ?? "",
      header: sigHeader,
      rawBody,
    });
    if (!ok) return new NextResponse("Invalid signature", { status: 401 });
  }

  let parsed: ReturnType<typeof parsePaddleWebhookPayload>;
  try {
    parsed = parsePaddleWebhookPayload(JSON.parse(rawBody));
  } catch {
    // Malformed body — ack so Paddle stops retrying. Nothing to record.
    return NextResponse.json({ ok: true });
  }
  if (!parsed) return NextResponse.json({ ok: true });

  const supabase = createServiceSupabaseClient();

  // Idempotency: if we have already processed this event_id, ack and stop.
  // `insert` with the event_id as PK fails with 23505 on the second delivery,
  // so we use a select-then-insert pattern; a duplicate insert race still
  // yields the same outcome thanks to the PK constraint.
  const { data: seen } = await supabase
    .from("paddle_events")
    .select("event_id")
    .eq("event_id", parsed.eventId)
    .maybeSingle();
  if (seen) return NextResponse.json({ ok: true, idempotent: true });

  const { error: ledgerError } = await supabase.from("paddle_events").insert({
    event_id: parsed.eventId,
    event_type: parsed.eventType,
    subscription_id: parsed.subscriptionId,
  });
  if (ledgerError && ledgerError.code !== "23505") {
    // Couldn't record the event — let Paddle retry. Returning 5xx triggers
    // their backoff queue; the idempotency check above keeps the retry safe.
    console.error(
      `[paddle:webhook] ledger insert failed type=${parsed.eventType} code=${ledgerError.code ?? "unknown"}`,
    );
    return new NextResponse("temporary failure", { status: 500 });
  }
  if (ledgerError?.code === "23505") {
    // Lost a race with a concurrent delivery of the same event — that other
    // call will apply the transition. We're done.
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const transition = mapPaddleEvent(parsed);
  if (transition.noop) return NextResponse.json({ ok: true, noop: true });

  await applyTransition(supabase, transition);

  return NextResponse.json({ ok: true });
}

async function applyTransition(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  t: SubscriptionTransition,
): Promise<void> {
  // Resolve the user_id. Prefer the one Paddle echoed back in custom_data,
  // fall back to the subscription row we may already have for this Paddle
  // subscription id (covers updated/canceled events that don't always
  // re-echo custom_data).
  let userId = t.userId;
  if (!userId && t.subscriptionId) {
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("paddle_subscription_id", t.subscriptionId)
      .maybeSingle();
    userId = (existing?.user_id as string | undefined) ?? null;
  }
  if (!userId) {
    console.warn(
      `[paddle:webhook] no user_id resolvable sub=${t.subscriptionId ?? "?"} status=${t.status ?? "?"}`,
    );
    return;
  }

  // Upsert the subscriptions row. `user_id` is PK on this table, so this
  // collapses created/activated/updated/canceled into one path.
  const updatePayload: Record<string, unknown> = {
    user_id: userId,
    status: t.status ?? "inactive",
    paddle_subscription_id: t.subscriptionId,
    paddle_customer_id: t.customerId,
    current_period_start: t.currentPeriodStart,
    current_period_end: t.currentPeriodEnd,
  };
  const { error: upsertError } = await supabase
    .from("subscriptions")
    .upsert(updatePayload, { onConflict: "user_id" });
  if (upsertError) {
    console.error(
      `[paddle:webhook] subscriptions upsert failed code=${upsertError.code ?? "unknown"}`,
    );
    // Don't 500 — the event has been ack'd in the ledger and re-processing
    // the same event would just hit the dedupe check. The next webhook will
    // re-converge the row.
    return;
  }

  // Flip the entitlement flag. Migration 011 restricts this column to
  // service-role, which is exactly what we're using here.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ is_paid: t.entitled })
    .eq("id", userId);
  if (profileError) {
    console.error(
      `[paddle:webhook] profiles.is_paid update failed code=${profileError.code ?? "unknown"}`,
    );
  }
}
