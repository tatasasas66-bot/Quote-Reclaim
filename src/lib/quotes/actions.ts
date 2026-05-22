"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateRecoveryPlan } from "@/lib/ai/generate-recovery-plan";
import { validateMessage } from "@/lib/ai/validate-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
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

const CADENCE_DAYS: Record<1 | 2 | 3, number> = { 1: 1, 2: 3, 3: 7 };

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
      error: `Free limit reached. You have ${silentLabel} of silent quotes in queue. Upgrades land in a later phase.`,
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

  // Final gate: never store a message that fails validation, regardless of
  // its self-reported source/score. This protects against future regressions
  // in the generator.
  const reminderRows = plan
    .filter((m) =>
      validateMessage(m.message, { firstName, trade: input.trade }).ok,
    )
    .map((m) => {
      const sendAt = new Date(quoteSentAt);
      sendAt.setUTCDate(
        sendAt.getUTCDate() + CADENCE_DAYS[m.followup_number],
      );
      return {
        user_id: userData.user.id,
        quote_id: quoteId,
        followup_number: m.followup_number,
        message_type: channel,
        message_text: m.message,
        framework_used: m.framework,
        cta_type: m.cta_type,
        send_at: sendAt.toISOString(),
      };
    });

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

  const updateResult = await userClient
    .from("quotes")
    .update({
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
