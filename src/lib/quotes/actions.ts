"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateRecoveryPlan } from "@/lib/ai/generate-recovery-plan";
import { validateMessage } from "@/lib/ai/validate-message";
import { normalizePhone } from "@/lib/messaging/phone";
import { getMessagingService } from "@/lib/messaging/service";
import type { SmsResult } from "@/lib/messaging/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { quoteInputSchema, quoteUpdateSchema } from "./schema";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type RawForm = Record<string, FormDataEntryValue>;

const CADENCE_DAYS: Record<1 | 2 | 3, number> = { 1: 1, 2: 3, 3: 7 };

function readForm(formData: FormData): RawForm {
  return Object.fromEntries(formData.entries());
}

function toCandidate(raw: RawForm) {
  const num = (v: FormDataEntryValue | undefined) => {
    if (v == null || v === "") return Number.NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : Number.NaN;
  };
  return {
    client_name: String(raw.client_name ?? ""),
    trade: String(raw.trade ?? ""),
    estimate_amount: num(raw.estimate_amount),
    days_silent: num(raw.days_silent),
    client_email: String(raw.client_email ?? ""),
    client_phone: String(raw.client_phone ?? ""),
    city: String(raw.city ?? ""),
    state: String(raw.state ?? ""),
    job_description: String(raw.job_description ?? ""),
  };
}

function quoteSentAtFromDaysSilent(daysSilent: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysSilent);
  return d.toISOString();
}

function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first.replace(/[.,]/g, "");
}

function sendAtFromBase(quoteSentAt: string, daysAfter: number): string {
  const d = new Date(quoteSentAt);
  d.setUTCDate(d.getUTCDate() + daysAfter);
  return d.toISOString();
}

type ReminderShape = {
  id: string;
  followup_number: number;
  sent: boolean;
  paused_at: string | null;
  message_text: string;
  send_at: string;
};

type RecoveryInput = {
  firstName: string;
  trade: string;
  estimateAmount: number;
  jobDescription: string | null;
  city: string | null;
  state: string | null;
};

/**
 * Phase 6 schedule reconciliation. Called after a quote is updated.
 *
 * Rules:
 *   - If any reminder is already sent: preserve sent rows verbatim and only
 *     update unsent rows' send_at to match the new quote_sent_at.
 *   - If no reminders are sent yet: regenerate messages and send_at via
 *     generateRecoveryPlan() and update existing rows by followup_number.
 *   - If no reminders exist at all (legacy quote): insert the 3 fresh rows.
 *   - The (quote_id, followup_number) unique index in the DB enforces the
 *     3-row maximum and prevents duplication on update.
 */
async function reconcileReminders(params: {
  serviceClient: ReturnType<typeof createServiceSupabaseClient>;
  userId: string;
  quoteId: string;
  newQuoteSentAt: string;
  recovery: RecoveryInput;
  channel: "sms" | "email";
}): Promise<void> {
  const { serviceClient, userId, quoteId, newQuoteSentAt, recovery, channel } =
    params;

  const { data, error } = await serviceClient
    .from("reminders")
    .select("id, followup_number, sent, paused_at, message_text, send_at")
    .eq("quote_id", quoteId)
    .eq("user_id", userId)
    .order("followup_number");

  if (error) return;
  const existing: ReminderShape[] = (data ?? []) as ReminderShape[];

  const anySent = existing.some((r) => r.sent);

  if (anySent) {
    for (const r of existing.filter((x) => !x.sent)) {
      const fn = r.followup_number as 1 | 2 | 3;
      if (!CADENCE_DAYS[fn]) continue;
      const sendAt = sendAtFromBase(newQuoteSentAt, CADENCE_DAYS[fn]);
      await serviceClient
        .from("reminders")
        .update({ send_at: sendAt })
        .eq("id", r.id);
    }
    return;
  }

  // No reminders sent — regenerate message text + schedule.
  const plan = await generateRecoveryPlan(recovery);
  const valid = plan.filter(
    (m) =>
      validateMessage(m.message, {
        firstName: recovery.firstName,
        trade: recovery.trade,
      }).ok,
  );
  if (valid.length !== 3) return;

  if (existing.length === 0) {
    const rows = valid.map((m) => ({
      user_id: userId,
      quote_id: quoteId,
      followup_number: m.followup_number,
      message_type: channel,
      message_text: m.message,
      framework_used: m.framework,
      cta_type: m.cta_type,
      send_at: sendAtFromBase(newQuoteSentAt, CADENCE_DAYS[m.followup_number]),
    }));
    await serviceClient.from("reminders").insert(rows);
    return;
  }

  for (const m of valid) {
    const target = existing.find(
      (r) => r.followup_number === m.followup_number,
    );
    if (!target) continue;
    await serviceClient
      .from("reminders")
      .update({
        message_text: m.message,
        framework_used: m.framework,
        cta_type: m.cta_type,
        message_type: channel,
        send_at: sendAtFromBase(newQuoteSentAt, CADENCE_DAYS[m.followup_number]),
      })
      .eq("id", target.id);
  }
}

export async function createQuoteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userClient = createServerSupabaseClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const parsed = quoteInputSchema.safeParse(toCandidate(readForm(formData)));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const input = parsed.data;

  const serviceClient = createServiceSupabaseClient();
  const gate = await serviceClient.rpc("check_and_increment_usage", {
    p_user_id: userData.user.id,
  });
  if (gate.error) {
    return { ok: false, error: `Usage check failed: ${gate.error.message}` };
  }
  const gateResult = gate.data as
    | { allowed: boolean; silent_quote_value?: number }
    | null;
  if (!gateResult || !gateResult.allowed) {
    const silent = Number(gateResult?.silent_quote_value ?? 0);
    const silentLabel = silent.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    return {
      ok: false,
      error: `Free plan limit reached. You have ${silentLabel} of silent quotes in your queue. Subscribe to unlock unlimited recovery — $79/month.`,
    };
  }

  const insertResult = await userClient
    .from("quotes")
    .insert({
      user_id: userData.user.id,
      trade: input.trade,
      city: input.city,
      state: input.state,
      estimate_amount: input.estimate_amount,
      job_description: input.job_description || null,
      days_silent: input.days_silent,
      quote_sent_at: quoteSentAtFromDaysSilent(input.days_silent),
      client_name: input.client_name,
      client_email: input.client_email || null,
      client_phone: input.client_phone || null,
    })
    .select("id")
    .single();

  if (insertResult.error) {
    return {
      ok: false,
      error: `Could not save quote: ${insertResult.error.message}`,
    };
  }

  const quoteId = insertResult.data.id;
  const channel: "sms" | "email" = input.client_phone ? "sms" : "email";
  const quoteSentAt = quoteSentAtFromDaysSilent(input.days_silent);
  const firstName = firstNameOf(input.client_name);

  const plan = await generateRecoveryPlan({
    firstName,
    trade: input.trade,
    estimateAmount: input.estimate_amount,
    jobDescription: input.job_description || null,
    city: input.city || null,
    state: input.state || null,
  });

  const reminderRows = plan
    .filter((m) =>
      validateMessage(m.message, { firstName, trade: input.trade }).ok,
    )
    .map((m) => ({
      user_id: userData.user.id,
      quote_id: quoteId,
      followup_number: m.followup_number,
      message_type: channel,
      message_text: m.message,
      framework_used: m.framework,
      cta_type: m.cta_type,
      send_at: sendAtFromBase(quoteSentAt, CADENCE_DAYS[m.followup_number]),
    }));

  if (reminderRows.length === 3) {
    await serviceClient.from("reminders").insert(reminderRows);
  }

  revalidatePath("/dashboard");
  redirect(`/quotes/${quoteId}`);
}

export async function updateQuoteAction(
  id: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userClient = createServerSupabaseClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const parsed = quoteUpdateSchema.safeParse(toCandidate(readForm(formData)));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const input = parsed.data;
  const newQuoteSentAt = quoteSentAtFromDaysSilent(input.days_silent);

  const updateResult = await userClient
    .from("quotes")
    .update({
      trade: input.trade,
      city: input.city,
      state: input.state,
      estimate_amount: input.estimate_amount,
      job_description: input.job_description || null,
      days_silent: input.days_silent,
      quote_sent_at: newQuoteSentAt,
      client_name: input.client_name,
      client_email: input.client_email || null,
      client_phone: input.client_phone || null,
    })
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .select("id")
    .maybeSingle();

  if (updateResult.error) {
    return {
      ok: false,
      error: `Could not update quote: ${updateResult.error.message}`,
    };
  }
  if (!updateResult.data) {
    return { ok: false, error: "Quote not found" };
  }

  // Phase 6: keep the reminder schedule consistent with the new quote_sent_at.
  const serviceClient = createServiceSupabaseClient();
  await reconcileReminders({
    serviceClient,
    userId: userData.user.id,
    quoteId: id,
    newQuoteSentAt,
    channel: input.client_phone ? "sms" : "email",
    recovery: {
      firstName: firstNameOf(input.client_name),
      trade: input.trade,
      estimateAmount: input.estimate_amount,
      jobDescription: input.job_description || null,
      city: input.city || null,
      state: input.state || null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/quotes/${id}`);
  redirect(`/quotes/${id}`);
}

export async function markQuoteWonAction(id: string): Promise<ActionResult> {
  const userClient = createServerSupabaseClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient.rpc("mark_quote_won", {
    p_quote_id: id,
    p_user_id: userData.user.id,
  });
  if (error) return { ok: false, error: `Mark won failed: ${error.message}` };
  const rpcResult = data as { error?: string } | null;
  if (rpcResult?.error) return { ok: false, error: rpcResult.error };

  revalidatePath("/dashboard");
  revalidatePath(`/quotes/${id}`);
  return { ok: true };
}

export async function closeQuoteAction(id: string): Promise<ActionResult> {
  const userClient = createServerSupabaseClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const result = await userClient
    .from("quotes")
    .update({ outcome: "closed", closed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .eq("outcome", "pending")
    .select("id")
    .maybeSingle();

  if (result.error) return { ok: false, error: `Close failed: ${result.error.message}` };
  if (!result.data) return { ok: false, error: "Quote not found or already resolved" };

  revalidatePath("/dashboard");
  revalidatePath(`/quotes/${id}`);
  return { ok: true };
}

export async function pauseSequenceAction(
  id: string,
): Promise<ActionResult> {
  const userClient = createServerSupabaseClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient.rpc("toggle_sequence_pause", {
    p_quote_id: id,
    p_user_id: userData.user.id,
    p_paused: true,
  });
  if (error) return { ok: false, error: `Pause failed: ${error.message}` };
  const rpcResult = data as { error?: string } | null;
  if (rpcResult?.error) return { ok: false, error: rpcResult.error };

  revalidatePath(`/quotes/${id}`);
  return { ok: true };
}

export async function resumeSequenceAction(
  id: string,
): Promise<ActionResult> {
  const userClient = createServerSupabaseClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient.rpc("toggle_sequence_pause", {
    p_quote_id: id,
    p_user_id: userData.user.id,
    p_paused: false,
  });
  if (error) return { ok: false, error: `Resume failed: ${error.message}` };
  const rpcResult = data as { error?: string } | null;
  if (rpcResult?.error) return { ok: false, error: rpcResult.error };

  revalidatePath(`/quotes/${id}`);
  return { ok: true };
}

type ReminderForSend = {
  id: string;
  user_id: string;
  quote_id: string;
  sent: boolean;
  paused_at: string | null;
  message_text: string;
  message_type: string;
};

type QuoteForSend = {
  id: string;
  user_id: string;
  outcome: string;
  client_phone: string | null;
  client_opted_out: boolean;
};

export async function sendReminderManualAction(
  reminderId: string,
): Promise<ActionResult> {
  const userClient = createServerSupabaseClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const userId = userData.user.id;
  const serviceClient = createServiceSupabaseClient();

  const { data: reminderData, error: reminderError } = await serviceClient
    .from("reminders")
    .select("id, user_id, quote_id, sent, paused_at, message_text, message_type")
    .eq("id", reminderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (reminderError || !reminderData) {
    return { ok: false, error: "Reminder not found" };
  }

  const reminder = reminderData as ReminderForSend;

  if (reminder.sent) return { ok: false, error: "Already sent" };
  if (reminder.paused_at) return { ok: false, error: "Sequence is paused" };

  const { data: quoteData, error: quoteError } = await serviceClient
    .from("quotes")
    .select("id, user_id, outcome, client_phone, client_opted_out")
    .eq("id", reminder.quote_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (quoteError || !quoteData) {
    return { ok: false, error: "Quote not found" };
  }

  const quote = quoteData as QuoteForSend;

  if (quote.outcome !== "pending") {
    return { ok: false, error: "Quote is no longer active" };
  }
  if (!quote.client_phone) {
    return { ok: false, error: "No phone number saved for this client" };
  }
  if (quote.client_opted_out) {
    return { ok: false, error: "Client has opted out of messages" };
  }

  // Normalize to E.164 so outbound + inbound webhook attribution match.
  const normalizedPhone = normalizePhone(quote.client_phone);
  if (!normalizedPhone) {
    return { ok: false, error: "Phone number is not a valid format" };
  }

  // Atomic claim — prevents double send even under concurrent requests.
  const { data: claimed, error: claimError } = await serviceClient.rpc(
    "claim_reminder_manual",
    { p_reminder_id: reminderId, p_user_id: userId },
  );

  if (claimError) {
    return { ok: false, error: `Could not claim reminder: ${claimError.message}` };
  }
  if (!claimed) {
    return {
      ok: false,
      error: "Send already in progress — check if it was sent recently",
    };
  }

  let smsResult: SmsResult;
  try {
    const provider = getMessagingService();
    smsResult = await provider.send({
      to: normalizedPhone,
      body: reminder.message_text,
    });
  } catch (err) {
    smsResult = {
      ok: false,
      error: err instanceof Error ? err.message : "Messaging service unavailable",
    };
  }

  const now = new Date().toISOString();

  await serviceClient.from("outbound_messages").insert({
    user_id: userId,
    quote_id: quote.id,
    reminder_id: reminderId,
    channel: "sms",
    recipient: normalizedPhone,
    message_text: reminder.message_text,
    status: smsResult.ok ? "sent" : "failed",
    provider_msg_id: smsResult.ok ? smsResult.providerMessageId : null,
    failure_reason: smsResult.ok ? null : smsResult.error,
    sent_at: smsResult.ok ? now : null,
    idempotency_key: `manual:${reminderId}:${userId}`,
  });

  if (!smsResult.ok) {
    // Release the atomic claim so the user can retry once the underlying
    // issue is resolved. Twilio returns an error response only when the
    // message was NOT queued for delivery, so this is safe.
    await serviceClient
      .from("reminders")
      .update({ claimed_by: null, claimed_at: null })
      .eq("id", reminderId)
      .eq("user_id", userId);
    return { ok: false, error: `Send failed: ${smsResult.error}` };
  }

  await serviceClient
    .from("reminders")
    .update({ sent: true, sent_at: now })
    .eq("id", reminderId)
    .eq("user_id", userId);

  revalidatePath(`/quotes/${quote.id}`);
  return { ok: true };
}
