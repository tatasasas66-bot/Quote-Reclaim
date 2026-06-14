/**
 * Paddle event → entitlement transition.
 *
 * The mapping table is the single source of truth for which Paddle event
 * grants Pro and which revokes it. These tests pin the conservative defaults:
 *
 *   - Only "active" and "trialing" entitle.
 *   - canceled / past_due / paused all revoke, regardless of the status
 *     string Paddle attaches.
 *   - Events with no subscription_id are noop (we have nothing durable to
 *     attach them to, and the contractor's entitlement is not affected).
 *   - The parser tolerates malformed payloads without throwing.
 */
import { describe, expect, it } from "vitest";

import {
  isEntitledStatus,
  mapPaddleEvent,
  parsePaddleWebhookPayload,
  type PaddleParsedEvent,
} from "../lib/payments/paddle-events";

const SUB_ID = "sub_01abc";
const CUS_ID = "ctm_01xyz";
const USER_ID = "00000000-0000-4000-8000-000000000001";

function makeEvent(overrides: Partial<PaddleParsedEvent> = {}): PaddleParsedEvent {
  return {
    eventId: "evt_1",
    eventType: "subscription.activated",
    subscriptionId: SUB_ID,
    customerId: CUS_ID,
    status: "active",
    customData: { user_id: USER_ID },
    currentPeriodStart: "2026-06-01T00:00:00Z",
    currentPeriodEnd: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("isEntitledStatus", () => {
  it("entitles 'active' and 'trialing' (case-insensitive)", () => {
    for (const s of ["active", "ACTIVE", "trialing", "Trialing"]) {
      expect(isEntitledStatus(s)).toBe(true);
    }
  });

  it("revokes for every other status", () => {
    for (const s of [
      "past_due",
      "canceled",
      "cancelled",
      "paused",
      "inactive",
      "unknown",
      "paid",
      "",
      null,
      undefined,
    ] as const) {
      expect(isEntitledStatus(s)).toBe(false);
    }
  });
});

describe("mapPaddleEvent — subscription.* lifecycle", () => {
  it("activated with status=active → entitled", () => {
    const t = mapPaddleEvent(makeEvent({ eventType: "subscription.activated" }));
    expect(t.entitled).toBe(true);
    expect(t.status).toBe("active");
    expect(t.userId).toBe(USER_ID);
    expect(t.subscriptionId).toBe(SUB_ID);
    expect(t.customerId).toBe(CUS_ID);
    expect(t.noop).toBe(false);
  });

  it("created with status=trialing → entitled", () => {
    const t = mapPaddleEvent(
      makeEvent({ eventType: "subscription.created", status: "trialing" }),
    );
    expect(t.entitled).toBe(true);
    expect(t.status).toBe("trialing");
  });

  it("updated keeps the canonical Paddle status (e.g. 'active' on plan change)", () => {
    const t = mapPaddleEvent(
      makeEvent({ eventType: "subscription.updated", status: "active" }),
    );
    expect(t.entitled).toBe(true);
    expect(t.status).toBe("active");
  });

  it("past_due → not entitled, status pinned to 'past_due'", () => {
    const t = mapPaddleEvent(
      makeEvent({ eventType: "subscription.past_due", status: "past_due" }),
    );
    expect(t.entitled).toBe(false);
    expect(t.status).toBe("past_due");
  });

  it("canceled → not entitled, status pinned to 'canceled' even if Paddle echoes a different status", () => {
    const t = mapPaddleEvent(
      makeEvent({ eventType: "subscription.canceled", status: "active" }),
    );
    expect(t.entitled).toBe(false);
    expect(t.status).toBe("canceled");
  });

  it("paused → not entitled, status pinned to 'paused'", () => {
    const t = mapPaddleEvent(
      makeEvent({ eventType: "subscription.paused", status: "paused" }),
    );
    expect(t.entitled).toBe(false);
    expect(t.status).toBe("paused");
  });

  it("resumed back to active → entitled", () => {
    const t = mapPaddleEvent(
      makeEvent({ eventType: "subscription.resumed", status: "active" }),
    );
    expect(t.entitled).toBe(true);
    expect(t.status).toBe("active");
  });

  it("any unknown Paddle status defaults to NOT entitled (fail-closed)", () => {
    const t = mapPaddleEvent(
      makeEvent({ eventType: "subscription.updated", status: "weird_status" }),
    );
    expect(t.entitled).toBe(false);
    expect(t.status).toBe("weird_status");
  });

  it("noop when subscription_id is missing — nothing durable to attach to", () => {
    const t = mapPaddleEvent(
      makeEvent({ eventType: "subscription.updated", subscriptionId: null }),
    );
    expect(t.noop).toBe(true);
  });
});

describe("mapPaddleEvent — transaction.completed", () => {
  it("does NOT flip entitlement on its own — it's a signal, not the source of truth", () => {
    const t = mapPaddleEvent(
      makeEvent({ eventType: "transaction.completed", status: null }),
    );
    expect(t.entitled).toBe(false);
    expect(t.status).toBeNull();
  });

  it("still propagates the user_id + customer_id when present (so the next subscription.* webhook can resolve us)", () => {
    const t = mapPaddleEvent(
      makeEvent({ eventType: "transaction.completed", status: null }),
    );
    expect(t.userId).toBe(USER_ID);
    expect(t.customerId).toBe(CUS_ID);
  });

  it("is noop only when both user_id and subscription_id are missing", () => {
    const t = mapPaddleEvent(
      makeEvent({
        eventType: "transaction.completed",
        subscriptionId: null,
        customData: null,
      }),
    );
    expect(t.noop).toBe(true);
  });
});

describe("parsePaddleWebhookPayload", () => {
  function valid() {
    return {
      event_id: "evt_01abc",
      event_type: "subscription.activated",
      data: {
        id: SUB_ID,
        status: "active",
        customer_id: CUS_ID,
        custom_data: { user_id: USER_ID, app: "quote_reclaim" },
        current_billing_period: {
          starts_at: "2026-06-01T00:00:00Z",
          ends_at: "2026-07-01T00:00:00Z",
        },
      },
    };
  }

  it("parses a full payload", () => {
    const parsed = parsePaddleWebhookPayload(valid());
    expect(parsed).not.toBeNull();
    expect(parsed?.eventId).toBe("evt_01abc");
    expect(parsed?.eventType).toBe("subscription.activated");
    expect(parsed?.subscriptionId).toBe(SUB_ID);
    expect(parsed?.customerId).toBe(CUS_ID);
    expect(parsed?.status).toBe("active");
    expect(parsed?.customData?.user_id).toBe(USER_ID);
    expect(parsed?.currentPeriodStart).toBe("2026-06-01T00:00:00Z");
    expect(parsed?.currentPeriodEnd).toBe("2026-07-01T00:00:00Z");
  });

  it("returns null for missing event_id or event_type", () => {
    expect(parsePaddleWebhookPayload({})).toBeNull();
    expect(parsePaddleWebhookPayload({ event_id: "x" })).toBeNull();
    expect(parsePaddleWebhookPayload({ event_type: "x" })).toBeNull();
  });

  it("never throws on garbage input", () => {
    for (const input of [null, undefined, "string", 42, [], { data: "not-an-object" }]) {
      expect(() => parsePaddleWebhookPayload(input)).not.toThrow();
    }
  });

  it("tolerates a missing data block — eventId+eventType still surface", () => {
    const parsed = parsePaddleWebhookPayload({
      event_id: "evt_2",
      event_type: "subscription.canceled",
    });
    expect(parsed?.eventId).toBe("evt_2");
    expect(parsed?.subscriptionId).toBeNull();
    expect(parsed?.status).toBeNull();
  });

  it("custom_data must be an object — strings/numbers are ignored", () => {
    const base = valid();
    const parsed = parsePaddleWebhookPayload({
      ...base,
      data: { ...base.data, custom_data: "not-an-object" },
    });
    expect(parsed?.customData).toBeNull();
  });
});
