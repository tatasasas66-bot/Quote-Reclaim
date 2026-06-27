"use server";

import { recordAuditEvent, type AuditEventType } from "@/lib/audit-events";
import { requireUser } from "@/lib/auth/require-user";

export async function recordQuoteAuditAction(input: {
  quoteId: string;
  type: Extract<
    AuditEventType,
    "scope_comparison_sent" | "payment_plan_sent"
  >;
}): Promise<{ ok: boolean }> {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) return { ok: false };
  const { data: quote } = await supabase
    .from("quotes")
    .select("id")
    .eq("id", input.quoteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!quote) return { ok: false };
  return {
    ok: await recordAuditEvent(supabase, {
      userId: user.id,
      quoteId: input.quoteId,
      type: input.type,
    }),
  };
}
