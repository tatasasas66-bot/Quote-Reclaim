import { type NextRequest, NextResponse } from "next/server";
import { recordAuditAttribution } from "@/lib/auto-marketing/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/auto-marketing/audit-attribution
 *
 * Anonymous /audit funnel attribution. Receives bucketed, PII-free event
 * data from the audit page client and stores it for campaign analysis.
 *
 * HARD PII RULES (enforced by the schema + this handler):
 *   - No homeowner names, emails, phones, addresses.
 *   - No raw quote amounts (only bucketed ranges).
 *   - visitor_hash is a truncated SHA-256 of IP + salt (not raw IP).
 *
 * This endpoint is intentionally public (no admin guard) because it receives
 * anonymous events from the public /audit page. The only data accepted is
 * the closed set of fields below — anything else is silently dropped.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Whitelist + coerce — never trust the client to send only safe fields.
  const safe = {
    utm_source: asString(payload.utm_source),
    utm_campaign: asString(payload.utm_campaign),
    utm_trade: asString(payload.utm_trade),
    utm_city: asString(payload.utm_city),
    visitor_hash: asString(payload.visitor_hash),
    audit_started: asBool(payload.audit_started),
    audit_completed: asBool(payload.audit_completed),
    total_quiet_value_bucket: asString(payload.total_quiet_value_bucket),
    top_recovery_window: asString(payload.top_recovery_window),
    cta_clicked: asBool(payload.cta_clicked),
    signup_started: asBool(payload.signup_started),
    checkout_started: asBool(payload.checkout_started),
    paid_customer: asBool(payload.paid_customer),
  };

  await recordAuditAttribution(safe);
  return NextResponse.json({ ok: true });
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v.slice(0, 200) : null;
}
function asBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}
