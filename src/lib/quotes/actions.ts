"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateRecoveryPlan } from "@/lib/ai/generate-recovery-plan";
import { validateMessage } from "@/lib/ai/validate-message";
import { emitRecoveryEvent } from "@/lib/intelligence/event-emitter";
import { sendRecoveryEmail } from "@/lib/messaging/email-provider";
import { recoveryFromHeader } from "@/lib/messaging/sender-identity";
import { recoveryEmailSubject } from "@/lib/messaging/select-channel";
import { normalizePhone } from "@/lib/messaging/phone";
import { getMessagingService } from "@/lib/messaging/service";
import type { SmsResult } from "@/lib/messaging/types";
import { PAYWALL_PRICE_LABEL } from "@/lib/payments/entitlement";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { titleCaseName } from "@/lib/utils/title-case";
import { CADENCE_DAYS } from "@/lib/recovery/recovery-logic";
import { persistRecoveryPlan, scheduleSendAt } from "./recovery-plan-write";
import { quoteInputSchema, quoteUpdateSchema } from "./schema";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type RawForm = Record<string, FormDataEntryValue>;

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
    project_type: String(raw.project_type ?? ""),
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

function firstStringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function contractorFirstNameOf(user: {
  user_metadata?: Record<string, unknown> | null;
}): string | null {
  const metadata = user.user_metadata ?? {};
  const fullName = firstStringValue(
    metadata.first_name,
    metadata.full_name,
    metadata.name,
    metadata.display_name,
  );
  return fullName ? firstNameOf(fullName) : null;
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
  contractorFirstName?: string | null;
  trade: string;
  projectType: string | null;
  estimateAmount: number;
  jobDescription: string | null;
  city: string | null;
  state: string | null;
};

/**
 * Phase 6 schedule reconciliation. Called after a quote is updated.
 *
 * The recovery schedule re-anchors to NOW (the moment of the edit), never to
 * the estimate date. Days Quiet still tracks quote_sent_at — that column is
 * updated by the caller — but the 1/5/10/14/21/60-day cadence restarts from the
 * edit so an unsent reminder can never be pushed into the past when the
 * contractor bumps a quote's age.
 *
 * Rules:
 *   - If any reminder is already sent: preserve sent rows verbatim and only
 *     re-anchor unsent rows' send_at from now.
 *   - If no reminders are sent yet: regenerate messages and send_at via
 *     generateRecoveryPlan() and update existing rows by followup_number.
 *   - If no reminders exist at all (legacy quote): insert the 6 fresh rows.
 *   - The (quote_id, followup_number) unique index in the DB enforces the
 *     6-row maximum and prevents duplication on update.
 */
async function reconcileReminders(params: {
  serviceClient: ReturnType<typeof createServiceSupabaseClient>;
  userId: string;
  quoteId: string;
  recovery: RecoveryInput;
  channel: "sms" | "email";
}): Promise<void> {
  const { serviceClient, userId, quoteId, recovery, channel } = params;
  // Re-anchor the cadence to the edit moment (now), not the estimate date.
  const scheduleStartMs = Date.now();

  const { data, error } = await serviceClient
    .from("reminders")
    .select("id, followup_number, sent, paused_at, message_text, send_at")
    .eq("quote_id", quoteId)
    .eq("user_id", userId)
    .order("followup_number");

  if (error) return;
  const existing: ReminderShape[] = (data ?? []) as ReminderShape[];

  // Preserve sent rows, refresh every unsent row, and add any newly introduced
  // later step exactly once. The unique quote/step index remains the final
  // duplicate guard.
  const plan = await generateRecoveryPlan({ ...recovery, quoteId });
  const valid = plan.filter(
    (m) =>
      validateMessage(m.message, {
        firstName: recovery.firstName,
        trade: recovery.trade,
        projectType: recovery.projectType,
        followupNumber: m.followup_number,
      }).ok,
  );
  if (valid.length !== 6) return;

  if (existing.length === 0) {
    const rows = valid.map((m) => ({
      user_id: userId,
      quote_id: quoteId,
      followup_number: m.followup_number,
      message_type: channel,
      message_text: m.message,
      framework_used: m.framework,
      cta_type: m.cta_type,
      send_at: scheduleSendAt(scheduleStartMs, CADENCE_DAYS[m.followup_number]),
    }));
    await serviceClient.from("reminders").insert(rows);
    return;
  }

  for (const m of valid) {
    const target = existing.find(
      (r) => r.followup_number === m.followup_number,
    );
    if (!target || target.sent) continue;
    await serviceClient
      .from("reminders")
      .update({
        message_text: m.message,
        framework_used: m.framework,
        cta_type: m.cta_type,
        message_type: channel,
        send_at: scheduleSendAt(scheduleStartMs, CADENCE_DAYS[m.followup_number]),
      })
      .eq("id", target.id);
  }

  const existingSteps = new Set(existing.map((row) => row.followup_number));
  const lastSentStep = existing.reduce(
    (max, row) => (row.sent ? Math.max(max, row.followup_number) : max),
    0,
  );
  const missingRows = valid
    .filter(
      (message) =>
        !existingSteps.has(message.followup_number) &&
        message.followup_number > lastSentStep,
    )
    .map((message) => ({
      user_id: userId,
      quote_id: quoteId,
      followup_number: message.followup_number,
      message_type: channel,
      message_text: message.message,
      framework_used: message.framework,
      cta_type: message.cta_type,
      send_at: scheduleSendAt(
        scheduleStartMs,
        CADENCE_DAYS[message.followup_number],
      ),
    }));
  if (missingRows.length > 0) {
    await serviceClient.from("reminders").insert(missingRows);
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
      error: `Free plan limit reached. You have ${silentLabel} of silent quotes in your queue. Subscribe to unlock unlimited recovery - ${PAYWALL_PRICE_LABEL}.`,
    };
  }

  const normalizedClientName = titleCaseName(input.client_name);
  const normalizedCity = input.city ? titleCaseName(input.city) : "";
  // State is already uppercased + US-validated by the schema transform.

  const insertResult = await userClient
    .from("quotes")
    .insert({
      user_id: userData.user.id,
      trade: input.trade,
      project_type: input.project_type || null,
      city: normalizedCity,
      state: input.state,
      estimate_amount: input.estimate_amount,
      job_description: input.job_description || null,
      days_silent: input.days_silent,
      quote_sent_at: quoteSentAtFromDaysSilent(input.days_silent),
      client_name: normalizedClientName,
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
  // Email is primary; SMS is a fallback for phone-only quotes when Twilio
  // is wired up. With SMS_ENABLED off (default), phone-only quotes generate
  // sms reminders that the cron skips — the contractor uses Copy or "Send
  // early" instead.
  const channel: "sms" | "email" = input.client_email ? "email" : "sms";
  const firstName = firstNameOf(normalizedClientName);
  const contractorFirstName = contractorFirstNameOf(userData.user);

  // Generate + persist the 6-step plan through the ONE shared writer that the
  // bulk-import flow also uses, so reminder shape can never diverge between the
  // two paths again. The schedule starts NOW (default scheduleStartAt) — never
  // the original estimate date — so an old/imported quote can never produce a
  // recovery schedule in the past. Returns the written rows for activity events.
  const planResult = await persistRecoveryPlan({
    serviceClient,
    userId: userData.user.id,
    quoteId,
    channel,
    context: {
      firstName,
      contractorFirstName,
      trade: input.trade,
      projectType: input.project_type || null,
      estimateAmount: input.estimate_amount,
      jobDescription: input.job_description || null,
      city: input.city || null,
      state: input.state || null,
      quoteId,
    },
  });
  if (planResult.inserted !== 6) {
    console.error(
      `[quotes:create] recovery plan insert failed code=${planResult.insertError ?? "unknown"}`,
    );
    return {
      ok: false,
      error:
        "Quote saved, but its recovery plan could not be created. Open the quote and save it again.",
    };
  }
  const reminderRows = planResult.rows;

  // Recovery Graph telemetry — emit estimate_created + one followup_generated
  // per reminder. Fire-and-forget; failures must not break quote creation.
  await emitRecoveryEvent({
    userId: userData.user.id,
    sequenceId: quoteId,
    quoteId,
    eventType: "estimate_created",
    trade: input.trade,
    city: input.city || null,
    state: input.state || null,
    estimateAmount: input.estimate_amount,
    daysSinceEstimate: input.days_silent,
    channel,
  });
  for (const m of reminderRows) {
    await emitRecoveryEvent({
      userId: userData.user.id,
      sequenceId: quoteId,
      quoteId,
      eventType: "followup_generated",
      trade: input.trade,
      estimateAmount: input.estimate_amount,
      followupNumber: m.followup_number,
      messageType: m.message_type,
      frameworkUsed: m.framework_used,
      ctaType: m.cta_type,
      channel,
    });
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
      project_type: input.project_type || null,
      city: input.city ? titleCaseName(input.city) : "",
      state: input.state,
      estimate_amount: input.estimate_amount,
      job_description: input.job_description || null,
      days_silent: input.days_silent,
      quote_sent_at: newQuoteSentAt,
      client_name: titleCaseName(input.client_name),
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

  // Re-anchor the reminder schedule to now (the edit moment). quote_sent_at
  // above carries the new estimate date for Days Quiet; the cadence restarts
  // from now so editing a quote's age never pushes a reminder into the past.
  const serviceClient = createServiceSupabaseClient();
  await reconcileReminders({
    serviceClient,
    userId: userData.user.id,
    quoteId: id,
    channel: input.client_email ? "email" : "sms",
    recovery: {
      firstName: firstNameOf(input.client_name),
      contractorFirstName: contractorFirstNameOf(userData.user),
      trade: input.trade,
      projectType: input.project_type || null,
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

  // Recovery Graph telemetry — emit win_recorded. Pull just the fields needed
  // for benchmarking; ignore errors.
  const { data: wonQuote } = await serviceClient
    .from("quotes")
    .select("trade, city, state, estimate_amount, created_at")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (wonQuote) {
    const daysSince = wonQuote.created_at
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - Date.parse(String(wonQuote.created_at))) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;
    await emitRecoveryEvent({
      userId: userData.user.id,
      sequenceId: id,
      quoteId: id,
      eventType: "win_recorded",
      trade: (wonQuote.trade as string | null) ?? null,
      city: (wonQuote.city as string | null) ?? null,
      state: (wonQuote.state as string | null) ?? null,
      estimateAmount: Number(wonQuote.estimate_amount ?? 0),
      daysSinceEstimate: daysSince,
      isWinningEvent: true,
    });
  }

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

/**
 * Sequence-order guard shared by both manual send paths.
 *
 * Returns an error string when `reminderId` is NOT the next unsent, unpaused
 * follow-up for its quote (earliest send_at, ties broken by followup_number),
 * null when the send is in order. The recovery sequence advances strictly one
 * message at a time — the UI only renders the send button on the next card,
 * and this guard enforces the same rule even against direct action calls.
 */
async function rejectOutOfOrderSend(
  serviceClient: ReturnType<typeof createServiceSupabaseClient>,
  quoteId: string,
  userId: string,
  reminderId: string,
): Promise<string | null> {
  const { data: siblingRows, error } = await serviceClient
    .from("reminders")
    .select("id, followup_number, send_at, sent, paused_at")
    .eq("quote_id", quoteId)
    .eq("user_id", userId);
  if (error) return `Could not verify sequence order: ${error.message}`;

  const nextInSequence = (siblingRows ?? [])
    .filter((s) => !s.sent && !s.paused_at)
    .sort(
      (a, b) =>
        Date.parse(a.send_at) - Date.parse(b.send_at) ||
        a.followup_number - b.followup_number,
    )[0];

  if (nextInSequence && nextInSequence.id !== reminderId) {
    return `Follow-up ${nextInSequence.followup_number} is next in the sequence — send that one first.`;
  }
  return null;
}

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

  // Sequence-order guard: only the next unsent, unpaused follow-up may be
  // sent by hand. Firing #3 while #1 still waits would land messages out of
  // order and read as spam to the homeowner.
  const orderError = await rejectOutOfOrderSend(
    serviceClient,
    reminder.quote_id,
    userId,
    reminderId,
  );
  if (orderError) return { ok: false, error: orderError };

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

type QuoteForEmailSend = {
  id: string;
  user_id: string;
  outcome: string;
  client_email: string | null;
  client_opted_out: boolean;
  trade: string;
  project_type: string | null;
};

/**
 * Manual "Send early" for email-channel reminders.
 *
 * Mirrors sendReminderManualAction's safety pattern: re-authenticate, load
 * via service client, check sent/paused/outcome/opt-out, claim atomically
 * via claim_reminder_manual, send through Resend, write outbound_messages,
 * release claim on failure.
 */
export async function sendReminderManualEmailAction(
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
    .select(
      "id, user_id, outcome, client_email, client_opted_out, trade, project_type",
    )
    .eq("id", reminder.quote_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (quoteError || !quoteData) {
    return { ok: false, error: "Quote not found" };
  }
  const quote = quoteData as QuoteForEmailSend;

  if (quote.outcome !== "pending") {
    return { ok: false, error: "Quote is no longer active" };
  }
  if (!quote.client_email) {
    return { ok: false, error: "No email saved for this client" };
  }
  if (quote.client_opted_out) {
    return { ok: false, error: "Client has opted out of messages" };
  }

  // Sequence-order guard — same rule as the SMS path: one message at a time,
  // always the earliest unsent, unpaused follow-up first.
  const orderError = await rejectOutOfOrderSend(
    serviceClient,
    reminder.quote_id,
    userId,
    reminderId,
  );
  if (orderError) return { ok: false, error: orderError };

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

  // Customer-facing sender identity: the homeowner should see the contractor,
  // not the SaaS brand. Derived from the contractor's account email (the same
  // source the cron uses, so both paths show an identical From). Address stays
  // the verified sending domain.
  const { data: senderProfile } = await serviceClient
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const emailResult = await sendRecoveryEmail({
    to: quote.client_email,
    subject: recoveryEmailSubject(quote.trade, quote.project_type),
    body: reminder.message_text,
    from: recoveryFromHeader({ contractorEmail: senderProfile?.email ?? null }),
  });

  const now = new Date().toISOString();

  await serviceClient.from("outbound_messages").insert({
    user_id: userId,
    quote_id: quote.id,
    reminder_id: reminderId,
    channel: "email",
    recipient: quote.client_email,
    message_text: reminder.message_text,
    status: emailResult.ok ? "sent" : "failed",
    provider_msg_id: emailResult.ok ? emailResult.providerMessageId : null,
    failure_reason: emailResult.ok ? null : emailResult.error,
    sent_at: emailResult.ok ? now : null,
    idempotency_key: `manual:${reminderId}:${userId}`,
  });

  if (!emailResult.ok) {
    await serviceClient
      .from("reminders")
      .update({ claimed_by: null, claimed_at: null })
      .eq("id", reminderId)
      .eq("user_id", userId);
    return { ok: false, error: `Send failed: ${emailResult.error}` };
  }

  await serviceClient
    .from("reminders")
    .update({ sent: true, sent_at: now })
    .eq("id", reminderId)
    .eq("user_id", userId);

  await emitRecoveryEvent({
    userId,
    sequenceId: quote.id,
    quoteId: quote.id,
    eventType: "message_sent",
    trade: quote.trade,
    channel: "email",
    sourceEventId: emailResult.providerMessageId,
  });

  revalidatePath(`/quotes/${quote.id}`);
  return { ok: true };
}
