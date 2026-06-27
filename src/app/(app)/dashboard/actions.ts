"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit-events";
import { requireUser } from "@/lib/auth/require-user";
import { calculateRecoveryStreak } from "@/lib/recovery/daily-loop";
import { listAuditEvents } from "@/lib/audit-events";

export async function recordSmsOpenedAction(input: {
  quoteId: string;
  messageFamily: string;
  step: number;
}): Promise<{ ok: boolean }> {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) return { ok: false };

  const quote = await supabase
    .from("quotes")
    .select("id")
    .eq("id", input.quoteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!quote.data) return { ok: false };

  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const existing = await supabase
    .from("audit_events")
    .select("id")
    .eq("user_id", user.id)
    .eq("event_type", "sms_opened")
    .gte("created_at", dayStart.toISOString())
    .limit(1);

  const logged = await recordAuditEvent(supabase, {
    userId: user.id,
    quoteId: input.quoteId,
    type: "sms_opened",
    meta: {
      messageFamily: input.messageFamily.slice(0, 80),
      step: Math.max(1, Math.min(5, Math.floor(input.step))),
    },
  });
  if (!logged) return { ok: false };

  if ((existing.data?.length ?? 0) === 0) {
    const events = await listAuditEvents(supabase, user.id);
    const streak = calculateRecoveryStreak(events, now);
    await recordAuditEvent(supabase, {
      userId: user.id,
      type: streak.resetYesterday ? "streak_reset" : "streak_incremented",
      meta: streak.resetYesterday ? {} : { value: streak.count },
    });
    if (streak.resetYesterday) {
      await recordAuditEvent(supabase, {
        userId: user.id,
        type: "streak_incremented",
        meta: { value: 1 },
      });
    }
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function recordReplyCheckAction(input: {
  quoteId: string;
  answer: "yes" | "no" | "not_yet";
  reaskCount: number;
}): Promise<{ ok: boolean; href?: string }> {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) return { ok: false };
  const quote = await supabase
    .from("quotes")
    .select("id")
    .eq("id", input.quoteId)
    .eq("user_id", user.id)
    .eq("outcome", "pending")
    .maybeSingle();
  if (!quote.data) return { ok: false };

  await recordAuditEvent(supabase, {
    userId: user.id,
    quoteId: input.quoteId,
    type: input.answer === "yes" ? "reply_received" : "no_reply_yet",
    meta:
      input.answer === "yes"
        ? { branch: "unclassified" }
        : {
            answer: input.answer,
            reaskCount: Math.min(3, Math.max(0, input.reaskCount + 1)),
          },
  });
  revalidatePath("/dashboard");
  return {
    ok: true,
    href:
      input.answer === "yes"
        ? `/quotes/${input.quoteId}?reply=1#reply-rescue-paths`
        : undefined,
  };
}
