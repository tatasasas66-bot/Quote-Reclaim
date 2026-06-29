/**
 * One-Tap Reply — server-only helpers. These touch the service Supabase
 * client, so they must NEVER be imported from a public ("use client")
 * boundary. The cron send path and the public reply page both use them.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildReplyUrl,
  generateToken,
  hashToken,
  mapAnswerTypeToReplyIntent,
  type OneTapAnswerType,
} from "./one-tap-reply";
import { ONE_TAP_CHOICES } from "./one-tap-choices";
import { recordAuditEvent } from "@/lib/audit-events";

export type IssuedLink = {
  /** The full public URL the email should embed. */
  url: string;
  /** The id of the one_tap_reply_links row that was created. */
  linkId: string;
};

/**
 * Mint a fresh per-send token, persist its SHA-256 hash, return the public
 * URL containing the raw token. The raw token only exists in memory here
 * and in the email body about to go out — it is never written to the
 * database.
 *
 * outboundMessageId can be null when the contractor mints a link from the
 * dashboard "Copy link" button. The row keeps the linkage when known.
 */
export async function issueOneTapLink(
  supabase: SupabaseClient,
  quoteId: string,
  outboundMessageId: string | null,
): Promise<IssuedLink | null> {
  const { token, tokenHash } = generateToken();
  const { data, error } = await supabase
    .from("one_tap_reply_links")
    .insert({
      quote_id: quoteId,
      outbound_message_id: outboundMessageId,
      token_hash: tokenHash,
    })
    .select("id")
    .single();
  if (error || !data) {
    // Log only the error code — never the raw token.
    console.error(
      `[one-tap] issueOneTapLink failed code=${error?.code ?? "unknown"}`,
    );
    return null;
  }
  return { url: buildReplyUrl(token), linkId: String(data.id) };
}

// ---------------------------------------------------------------------------
// Token resolution for the public page
// ---------------------------------------------------------------------------

export type ResolvedLink = {
  linkId: string;
  quoteId: string;
  outboundMessageId: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  usedAt: string | null;
};

/**
 * Resolve a URL token to its stored link row by SHA-256 hash. Returns null
 * when no row matches — callers must show the same "link unavailable" page
 * regardless of which gate fails, so we never leak existence.
 */
export async function resolveOneTapLink(
  supabase: SupabaseClient,
  rawToken: string,
): Promise<ResolvedLink | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const { data, error } = await supabase
    .from("one_tap_reply_links")
    .select(
      "id, quote_id, outbound_message_id, revoked_at, expires_at, used_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data) return null;
  return {
    linkId: String(data.id),
    quoteId: String(data.quote_id),
    outboundMessageId: data.outbound_message_id
      ? String(data.outbound_message_id)
      : null,
    revokedAt: data.revoked_at,
    expiresAt: data.expires_at,
    usedAt: data.used_at,
  };
}

// ---------------------------------------------------------------------------
// Recording a reply
// ---------------------------------------------------------------------------

const DUP_WINDOW_MS = 5_000;

type RecordReplyInput = {
  quoteId: string;
  userId: string;
  sequenceId: string;
  outboundMessageId: string | null;
  answerType: OneTapAnswerType;
  questionText?: string | null;
  selectedOptionId?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  trade: string;
  city: string | null;
  state: string | null;
  estimateAmount: number;
};

export type RecordReplyResult = "recorded" | "duplicate" | "error";

/**
 * Persist a homeowner reply. Writes two coordinated effects in one logical
 * transaction-by-convention (Supabase JS does not expose multi-statement
 * transactions outside RPCs, but each insert is small and tolerant of
 * partial failure):
 *
 *   1. one_tap_replies — durable record of the tap itself.
 *   2. recovery_events — a 'reply_received' event with channel='one_tap'
 *      and the mapped reply_intent, so Quiet Signal and Reply Radar pick
 *      up the reply through their existing code paths.
 *
 * Returns 'duplicate' if an identical answer landed within the last
 * 5 seconds (rapid double-tap protection). The contractor still sees the
 * earlier row, and the page shows the same "Thanks" copy.
 */
export async function recordOneTapReply(
  supabase: SupabaseClient,
  input: RecordReplyInput,
): Promise<RecordReplyResult> {
  const cutoffIso = new Date(Date.now() - DUP_WINDOW_MS).toISOString();
  const { data: recent } = await supabase
    .from("one_tap_replies")
    .select("id, answer_type")
    .eq("quote_id", input.quoteId)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(1);
  if (recent && recent.length > 0 && recent[0].answer_type === input.answerType) {
    return "duplicate";
  }

  const { error: replyError } = await supabase.from("one_tap_replies").insert({
    quote_id: input.quoteId,
    outbound_message_id: input.outboundMessageId,
    answer_type: input.answerType,
    question_text: input.questionText ?? null,
    selected_option_id: input.selectedOptionId ?? null,
    user_agent: input.userAgent ?? null,
    ip_hash: input.ipHash ?? null,
  });
  if (replyError) {
    console.error(
      `[one-tap] one_tap_replies insert failed code=${replyError.code ?? "unknown"}`,
    );
    return "error";
  }

  const replyIntent = mapAnswerTypeToReplyIntent(input.answerType);
  const replyText = buildReplyTextFor(input);

  const { error: evtError } = await supabase.from("recovery_events").insert({
    user_id: input.userId,
    sequence_id: input.sequenceId,
    quote_id: input.quoteId,
    event_type: "reply_received",
    trade: input.trade,
    city: input.city,
    state: input.state,
    estimate_amount: input.estimateAmount,
    channel: "one_tap",
    reply_text: replyText,
    reply_intent: replyIntent,
  });
  if (evtError && evtError.code !== "23505") {
    console.error(
      `[one-tap] recovery_events insert failed code=${evtError.code ?? "unknown"}`,
    );
  }

  await recordAuditEvent(supabase, {
    userId: input.userId,
    quoteId: input.quoteId,
    type: "one_tap_reply",
    meta: {
      option:
        input.answerType === "question" && input.questionText
          ? input.questionText
          : input.answerType,
    },
  });

  // Pause unsent reminders — exactly what email-inbound / twilio-inbound do.
  // A reply through any channel should stop the rest of the sequence.
  await supabase
    .from("reminders")
    .update({ paused_at: new Date().toISOString() })
    .eq("quote_id", input.quoteId)
    .eq("user_id", input.userId)
    .eq("sent", false)
    .is("paused_at", null);

  return "recorded";
}

function buildReplyTextFor(input: RecordReplyInput): string {
  const selectedChoice = ONE_TAP_CHOICES.find(
    (choice) =>
      choice.answerType === input.answerType &&
      (choice.answerType !== "question" ||
        choice.questionText === input.questionText),
  );
  if (selectedChoice) {
    return `[One-tap] The customer tapped: ${selectedChoice.label}`;
  }

  switch (input.answerType) {
    case "question":
      return (input.questionText ?? "").trim() || "[One-tap] (no question text)";
    case "not_now":
      return "[One-tap] The customer tapped: Not right now.";
    case "option_selected":
      return "[One-tap] The customer chose an approved option.";
    default:
      return `[One-tap] The customer tapped: ${input.answerType}`;
  }
}

// ---------------------------------------------------------------------------
// Reads for the dashboard
// ---------------------------------------------------------------------------

export type LatestOneTapReply = {
  id: string;
  answerType: OneTapAnswerType;
  questionText: string | null;
  selectedOptionId: string | null;
  createdAt: string;
};

export async function getLatestOneTapReply(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<LatestOneTapReply | null> {
  const { data, error } = await supabase
    .from("one_tap_replies")
    .select(
      "id, answer_type, question_text, selected_option_id, created_at",
    )
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    answerType: data.answer_type as OneTapAnswerType,
    questionText: data.question_text,
    selectedOptionId: data.selected_option_id
      ? String(data.selected_option_id)
      : null,
    createdAt: String(data.created_at),
  };
}

export type ReplyOption = {
  id: string;
  label: string;
  amountCents: number | null;
  note: string | null;
  isActive: boolean;
};

export async function listActiveReplyOptions(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<ReplyOption[]> {
  const { data, error } = await supabase
    .from("one_tap_reply_options")
    .select("id, label, amount_cents, note, is_active")
    .eq("quote_id", quoteId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: String(r.id),
    label: String(r.label),
    amountCents: r.amount_cents == null ? null : Number(r.amount_cents),
    note: r.note,
    isActive: Boolean(r.is_active),
  }));
}
