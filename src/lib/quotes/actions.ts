"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function buildReminders(params: {
  userId: string;
  quoteId: string;
  quoteSentAt: string;
  clientName: string;
  trade: string;
  estimateAmount: number;
  channel: "sms" | "email";
}) {
  const { userId, quoteId, quoteSentAt, clientName, trade, estimateAmount, channel } =
    params;
  const base = new Date(quoteSentAt);
  const amount = usd.format(estimateAmount);

  const steps: Array<{
    followup_number: 1 | 2 | 3;
    daysAfter: number;
    framework_used: string;
    cta_type: string;
    message_text: string;
  }> = [
    {
      followup_number: 1,
      daysAfter: 1,
      framework_used: "direct",
      cta_type: "question",
      message_text: `Hi ${clientName}, just following up on the ${trade} estimate I sent over. Any questions or adjustments needed? Happy to help.`,
    },
    {
      followup_number: 2,
      daysAfter: 3,
      framework_used: "value",
      cta_type: "offer",
      message_text: `Hi ${clientName}, checking back on the ${trade} quote for ${amount}. I can work with your schedule — would this week or next work for you?`,
    },
    {
      followup_number: 3,
      daysAfter: 7,
      framework_used: "final",
      cta_type: "close",
      message_text: `Hi ${clientName}, one final follow-up on the ${trade} estimate. If the timing isn't right, no problem — I'll keep your quote on file whenever you're ready.`,
    },
  ];

  return steps.map(({ followup_number, daysAfter, framework_used, cta_type, message_text }) => {
    const sendAt = new Date(base);
    sendAt.setUTCDate(sendAt.getUTCDate() + daysAfter);
    return {
      user_id: userId,
      quote_id: quoteId,
      followup_number,
      message_type: channel,
      message_text,
      framework_used,
      cta_type,
      send_at: sendAt.toISOString(),
    };
  });
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
  const gateResult = gate.data as { allowed: boolean; silent_quote_value?: number } | null;
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
    return { ok: false, error: `Could not save quote: ${insertResult.error.message}` };
  }

  const quoteId = insertResult.data.id;
  const channel: "sms" | "email" = input.client_phone ? "sms" : "email";
  const quoteSentAt = quoteSentAtFromDaysSilent(input.days_silent);

  await serviceClient.from("reminders").insert(
    buildReminders({
      userId: userData.user.id,
      quoteId,
      quoteSentAt,
      clientName: input.client_name,
      trade: input.trade,
      estimateAmount: input.estimate_amount,
      channel,
    }),
  );

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
    return { ok: false, error: `Could not update quote: ${updateResult.error.message}` };
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
