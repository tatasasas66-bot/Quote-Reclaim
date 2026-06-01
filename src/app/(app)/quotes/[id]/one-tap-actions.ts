"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { issueOneTapLink } from "@/lib/quotes/one-tap-reply-server";

const MAX_ACTIVE_OPTIONS = 2;

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function authenticateForQuote(
  quoteId: string,
): Promise<{ userId: string } | null> {
  const { user, supabase } = await requireUser();
  if (!user || !supabase) return null;
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, user_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || String(quote.user_id) !== user.id) return null;
  return { userId: user.id };
}

/**
 * Mint a fresh One-Tap Reply URL for the contractor to copy/share. Always
 * issues a new token — old links remain valid until the quote is won /
 * closed / opted-out.
 */
export async function createOneTapLinkForQuote(
  quoteId: string,
): Promise<ActionResult<{ url: string }>> {
  const session = await authenticateForQuote(quoteId);
  if (!session) return { ok: false, error: "Not authorized." };

  const supabase = createServiceSupabaseClient();
  const link = await issueOneTapLink(supabase, quoteId, null);
  if (!link) return { ok: false, error: "Could not generate link." };
  return { ok: true, data: { url: link.url } };
}

// ---------------------------------------------------------------------------
// Options management
// ---------------------------------------------------------------------------

export type AddOptionInput = {
  quoteId: string;
  label: string;
  amount: number | null;
  note?: string | null;
};

export async function addReplyOption(
  input: AddOptionInput,
): Promise<ActionResult> {
  const session = await authenticateForQuote(input.quoteId);
  if (!session) return { ok: false, error: "Not authorized." };

  const label = (input.label ?? "").trim().slice(0, 80);
  if (!label) return { ok: false, error: "Option needs a label." };

  if (input.amount != null && (!Number.isFinite(input.amount) || input.amount < 0)) {
    return { ok: false, error: "Amount must be a positive number." };
  }

  const supabase = createServiceSupabaseClient();

  const { data: existing } = await supabase
    .from("one_tap_reply_options")
    .select("id")
    .eq("quote_id", input.quoteId)
    .eq("is_active", true);
  if ((existing?.length ?? 0) >= MAX_ACTIVE_OPTIONS) {
    return {
      ok: false,
      error: `You can have up to ${MAX_ACTIVE_OPTIONS} active options. Remove one first.`,
    };
  }

  const { error } = await supabase.from("one_tap_reply_options").insert({
    quote_id: input.quoteId,
    label,
    amount_cents: input.amount == null ? null : Math.round(input.amount * 100),
    note: (input.note ?? "").trim().slice(0, 200) || null,
    is_active: true,
  });
  if (error) return { ok: false, error: "Could not add option." };

  revalidatePath(`/quotes/${input.quoteId}`);
  return { ok: true };
}

export async function removeReplyOption(input: {
  quoteId: string;
  optionId: string;
}): Promise<ActionResult> {
  const session = await authenticateForQuote(input.quoteId);
  if (!session) return { ok: false, error: "Not authorized." };

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("one_tap_reply_options")
    .update({ is_active: false })
    .eq("id", input.optionId)
    .eq("quote_id", input.quoteId);
  if (error) return { ok: false, error: "Could not remove option." };

  revalidatePath(`/quotes/${input.quoteId}`);
  return { ok: true };
}
