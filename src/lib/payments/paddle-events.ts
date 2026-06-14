/**
 * Paddle subscription event → entitlement transition.
 *
 * Pure, table-driven. The webhook handler reads the parsed event, calls
 * `mapPaddleEvent`, and applies the resulting transition against the
 * `subscriptions` table and `profiles.is_paid` — all the lifecycle logic
 * lives here so it can be unit-tested without a database or HTTP layer.
 *
 * Conservative defaults:
 *   - Only `active` and `trialing` map to `entitled = true`. Everything else
 *     (past_due / canceled / paused / unknown) revokes entitlement so a
 *     missed/late webhook never leaves a non-paying user in the Pro state.
 *   - `transaction.completed` is treated as a *signal* that something good
 *     happened; the source of truth for entitlement remains the subscription
 *     row written by `subscription.*`. We only persist the customer_id from
 *     it when we don't already have one (so future webhooks resolve the user).
 */

export type PaddleEventType =
  | "transaction.completed"
  | "subscription.created"
  | "subscription.activated"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.past_due"
  | "subscription.paused"
  | "subscription.resumed";

const ENTITLED_STATUSES: ReadonlySet<string> = new Set(["active", "trialing"]);

export function isEntitledStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ENTITLED_STATUSES.has(status.toLowerCase());
}

export type PaddleParsedEvent = {
  eventId: string;
  eventType: string;
  subscriptionId: string | null;
  customerId: string | null;
  status: string | null;
  customData: { user_id?: string | null } | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
};

export type SubscriptionTransition = {
  /** When known, the auth user_id to attach this subscription to. */
  userId: string | null;
  /** Paddle subscription id — present for every subscription.* event. */
  subscriptionId: string | null;
  /** Paddle customer id — propagated when present. */
  customerId: string | null;
  /** Normalized lowercase Paddle status, or null if the event has none. */
  status: string | null;
  /** Whether the contractor should be entitled after this event. */
  entitled: boolean;
  /** Period boundaries when Paddle reports them. */
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** True when the event carries no actionable subscription state at all
   *  (e.g. transaction.completed without custom_data). */
  noop: boolean;
};

export function mapPaddleEvent(event: PaddleParsedEvent): SubscriptionTransition {
  const userId = event.customData?.user_id?.trim() || null;
  const status = event.status ? event.status.toLowerCase() : null;

  if (event.eventType === "transaction.completed") {
    return {
      userId,
      subscriptionId: event.subscriptionId,
      customerId: event.customerId,
      status: null,
      entitled: false,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      noop: !userId && !event.subscriptionId,
    };
  }

  if (event.eventType === "subscription.canceled") {
    return {
      userId,
      subscriptionId: event.subscriptionId,
      customerId: event.customerId,
      status: "canceled",
      entitled: false,
      currentPeriodStart: event.currentPeriodStart,
      currentPeriodEnd: event.currentPeriodEnd,
      noop: !event.subscriptionId,
    };
  }

  if (event.eventType === "subscription.past_due") {
    return {
      userId,
      subscriptionId: event.subscriptionId,
      customerId: event.customerId,
      status: "past_due",
      entitled: false,
      currentPeriodStart: event.currentPeriodStart,
      currentPeriodEnd: event.currentPeriodEnd,
      noop: !event.subscriptionId,
    };
  }

  if (event.eventType === "subscription.paused") {
    return {
      userId,
      subscriptionId: event.subscriptionId,
      customerId: event.customerId,
      status: "paused",
      entitled: false,
      currentPeriodStart: event.currentPeriodStart,
      currentPeriodEnd: event.currentPeriodEnd,
      noop: !event.subscriptionId,
    };
  }

  // created / activated / updated / resumed all carry the canonical status
  // string on the subscription itself. Trust that field.
  return {
    userId,
    subscriptionId: event.subscriptionId,
    customerId: event.customerId,
    status,
    entitled: isEntitledStatus(status),
    currentPeriodStart: event.currentPeriodStart,
    currentPeriodEnd: event.currentPeriodEnd,
    noop: !event.subscriptionId,
  };
}

/**
 * Defensive parser for the Paddle webhook envelope.
 *
 * Paddle's payload shape per docs:
 *   {
 *     "event_id": "evt_...",
 *     "event_type": "subscription.activated",
 *     "occurred_at": "...",
 *     "data": {
 *       "id": "sub_...",
 *       "status": "active",
 *       "customer_id": "ctm_...",
 *       "custom_data": { "user_id": "<uuid>", "email": "...", "app": "quote_reclaim" },
 *       "current_billing_period": { "starts_at": "...", "ends_at": "..." }
 *     }
 *   }
 *
 * Anything missing → null in the parsed shape so `mapPaddleEvent` can decide
 * whether the event is actionable. We never throw on a malformed payload.
 */
export function parsePaddleWebhookPayload(input: unknown): PaddleParsedEvent | null {
  if (!input || typeof input !== "object") return null;
  const root = input as Record<string, unknown>;
  const eventId = pickString(root.event_id);
  const eventType = pickString(root.event_type);
  if (!eventId || !eventType) return null;

  const data = (root.data && typeof root.data === "object")
    ? (root.data as Record<string, unknown>)
    : null;
  const subscriptionId = data ? pickString(data.id) || pickString(data.subscription_id) : "";
  const customerId = data ? pickString(data.customer_id) : "";
  const status = data ? pickString(data.status) : "";

  const customDataRaw = data && data.custom_data && typeof data.custom_data === "object"
    ? (data.custom_data as Record<string, unknown>)
    : null;
  const customData: { user_id?: string | null } | null = customDataRaw
    ? { user_id: pickString(customDataRaw.user_id) || null }
    : null;

  const period = data && data.current_billing_period && typeof data.current_billing_period === "object"
    ? (data.current_billing_period as Record<string, unknown>)
    : null;
  const currentPeriodStart = period ? pickString(period.starts_at) || null : null;
  const currentPeriodEnd = period ? pickString(period.ends_at) || null : null;

  return {
    eventId,
    eventType,
    subscriptionId: subscriptionId || null,
    customerId: customerId || null,
    status: status || null,
    customData,
    currentPeriodStart,
    currentPeriodEnd,
  };
}

function pickString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
