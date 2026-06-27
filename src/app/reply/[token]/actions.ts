"use server";

import { headers } from "next/headers";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { canRenderReplyPage, hashIp } from "@/lib/quotes/one-tap-reply";
import {
  recordOneTapReply,
  resolveOneTapLink,
} from "@/lib/quotes/one-tap-reply-server";
import type { OneTapAnswerType } from "@/lib/quotes/one-tap-reply";

const SAFE_GENERIC_FAILURE = "Sorry — this link isn't available anymore.";

export type ReplyActionResult =
  | {
      ok: true;
      kind: OneTapAnswerType;
      contractorFirstName: string;
      contractorEmail: string | null;
      contractorPhone: string | null;
    }
  | { ok: false; reason: string };

type SubmitInput = {
  token: string;
  answerType: OneTapAnswerType;
  questionText?: string;
  selectedOptionId?: string;
};

/**
 * Single entry point for every reply tap. Resolves the token, re-runs the
 * gating (no trust in the client), persists the reply + the recovery_event,
 * and returns a uniform shape. Failures collapse to the same safe message so
 * we never leak which gate tripped.
 */
export async function submitOneTapReply(
  input: SubmitInput,
): Promise<ReplyActionResult> {
  const supabase = createServiceSupabaseClient();

  // Resolve and gate. Any failure → the same generic message.
  const link = await resolveOneTapLink(supabase, input.token);
  if (!link) return { ok: false, reason: SAFE_GENERIC_FAILURE };

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, user_id, sequence_id, client_name, trade, city, state, estimate_amount, outcome, client_opted_out",
    )
    .eq("id", link.quoteId)
    .maybeSingle();
  if (!quote) return { ok: false, reason: SAFE_GENERIC_FAILURE };

  const okToReply = canRenderReplyPage(
    {
      outcome: (quote.outcome ?? "pending") as "pending" | "won" | "closed",
      client_opted_out: quote.client_opted_out,
    },
    { revoked_at: link.revokedAt, expires_at: link.expiresAt },
  );
  if (!okToReply) return { ok: false, reason: SAFE_GENERIC_FAILURE };

  // Per-answer-type validation. Question MUST carry text.
  let questionText: string | null = null;
  if (input.answerType === "question") {
    const t = (input.questionText ?? "").trim();
    if (!t) return { ok: false, reason: "Please type your question." };
    questionText = t.slice(0, 1_000);
  }

  // Option selection MUST reference an active option for this quote.
  let selectedOptionId: string | null = null;
  if (input.answerType === "option_selected") {
    if (!input.selectedOptionId) {
      return { ok: false, reason: SAFE_GENERIC_FAILURE };
    }
    const { data: opt } = await supabase
      .from("one_tap_reply_options")
      .select("id, is_active, quote_id")
      .eq("id", input.selectedOptionId)
      .maybeSingle();
    if (!opt || !opt.is_active || String(opt.quote_id) !== String(quote.id)) {
      return { ok: false, reason: SAFE_GENERIC_FAILURE };
    }
    selectedOptionId = String(opt.id);
  }

  // Capture lightweight abuse-telemetry — never the raw IP.
  const h = await headers();
  const ua = (h.get("user-agent") ?? "").slice(0, 200);
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;

  const result = await recordOneTapReply(supabase, {
    quoteId: String(quote.id),
    userId: String(quote.user_id),
    sequenceId: String(quote.sequence_id),
    outboundMessageId: link.outboundMessageId,
    answerType: input.answerType,
    questionText,
    selectedOptionId,
    userAgent: ua || null,
    ipHash: hashIp(ip),
    trade: String(quote.trade ?? ""),
    city: quote.city ?? null,
    state: quote.state ?? null,
    estimateAmount: Number(quote.estimate_amount ?? 0),
  });
  if (result === "error") {
    return { ok: false, reason: SAFE_GENERIC_FAILURE };
  }

  // Mark the link as used (best-effort; idempotent — multiple uses are fine).
  await supabase
    .from("one_tap_reply_links")
    .update({ used_at: new Date().toISOString() })
    .eq("id", link.linkId)
    .is("used_at", null);

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, contractor_phone")
    .eq("id", quote.user_id)
    .maybeSingle();
  const contractorFirstName = pickContractorName(profile?.email);

  return {
    ok: true,
    kind: input.answerType,
    contractorFirstName,
    contractorEmail: profile?.email ?? null,
    contractorPhone: profile?.contractor_phone ?? null,
  };
}

function pickContractorName(email: string | null | undefined): string {
  if (!email) return "your contractor";
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._\-+]+/g, " ").trim();
  if (!cleaned) return "your contractor";
  const first = cleaned.split(/\s+/)[0] ?? "";
  return first.charAt(0).toUpperCase() + first.slice(1) || "your contractor";
}
