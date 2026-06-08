"use server";

import { revalidatePath } from "next/cache";
import { generateRecoveryPlan } from "@/lib/ai/generate-recovery-plan";
import { emitRecoveryEvent } from "@/lib/intelligence/event-emitter";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { titleCaseName } from "@/lib/utils/title-case";
import { MAX_IMPORT_ROWS, type ParsedQuote } from "./parse-quotes";

export type ImportResult =
  | {
      ok: true;
      imported: number;
      skippedByGate: number;
      totalSilent: number;
      remainingSilent: number;
    }
  | { ok: false; error: string };

const ALLOWED_TRADES = new Set([
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Remodeling",
  "General Contracting",
  "Painting",
  "Landscaping",
  "Concrete",
]);

const MAX_AMOUNT_USD = 10_000_000;
const MAX_NAME_LEN = 200;

function sanitizeServerRow(row: ParsedQuote): ParsedQuote | null {
  const name = String(row.name ?? "").trim().slice(0, MAX_NAME_LEN);
  const amount = Number(row.amount);
  const daysSilent = Math.max(
    0,
    Math.min(365, Math.floor(Number(row.daysSilent) || 0)),
  );
  if (!name) return null;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT_USD) return null;
  const email = typeof row.email === "string" && row.email.trim()
    ? row.email.trim().toLowerCase().slice(0, 320)
    : null;
  return { name, amount, daysSilent, email };
}

function quoteSentAtFromDaysSilent(daysSilent: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysSilent);
  return d.toISOString();
}

/**
 * Bulk-import silent quotes from the Reveal flow. Server is the security
 * boundary — re-validates every row, caps at MAX_IMPORT_ROWS, and uses the
 * existing per-row free-trial gate (check_and_increment_usage). Free users
 * land their top 3 by amount; the rest are skipped (the dashboard paywall
 * surfaces the remaining $ as upgrade pressure). Paid users land all rows.
 *
 * Always marks onboarding_done = true so the user is never bounced back to
 * this flow on the next sign-in.
 */
export async function importSilentQuotesAction(input: {
  trade: string;
  rows: ParsedQuote[];
}): Promise<ImportResult> {
  const userClient = createServerSupabaseClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const trade = String(input.trade ?? "").trim();
  if (!ALLOWED_TRADES.has(trade)) {
    return { ok: false, error: "Unrecognized trade" };
  }

  const rawRows = Array.isArray(input.rows) ? input.rows : [];
  if (rawRows.length === 0) {
    return { ok: false, error: "Nothing to import" };
  }

  // Re-validate every row server-side — never trust the client-parsed shape.
  const cleaned: ParsedQuote[] = [];
  for (const r of rawRows.slice(0, MAX_IMPORT_ROWS)) {
    const ok = sanitizeServerRow(r);
    if (ok) cleaned.push(ok);
  }
  if (cleaned.length === 0) {
    return { ok: false, error: "No valid rows after validation" };
  }

  // Sort by amount desc so the free-trial gate consumes the contractor's
  // top 3 by value (highest-value silent quotes get the best shot at a
  // reply during the trial).
  cleaned.sort((a, b) => b.amount - a.amount);

  const serviceClient = createServiceSupabaseClient();
  const userId = userData.user.id;

  let imported = 0;
  let skippedByGate = 0;
  const totalSilent = cleaned.reduce((s, r) => s + r.amount, 0);

  for (const row of cleaned) {
    // Use the existing per-row gate — never bypass the free allowance,
    // even for bulk imports. This is the security contract of the trial.
    const gate = await serviceClient.rpc("check_and_increment_usage", {
      p_user_id: userId,
    });
    const gateResult = gate.data as { allowed: boolean } | null;
    if (gate.error || !gateResult || !gateResult.allowed) {
      skippedByGate++;
      continue;
    }

    const normalizedName = titleCaseName(row.name);
    const normalizedEmail = row.email ?? null;
    // Match the single-quote flow's convention exactly (createQuoteAction):
    //   has email  -> "email"  (cron auto-sends via Resend)
    //   no email   -> "sms"    (with SMS off by default = copy/manual mode;
    //                           the cron leaves it alone, the contractor copies
    //                           each message from the quote page)
    // This guarantees bulk-imported rows behave identically to manually-added
    // ones — no row is ever stored as "email" with a null recipient.
    const messageType: "email" | "sms" = normalizedEmail ? "email" : "sms";

    const insertResult = await userClient
      .from("quotes")
      .insert({
        user_id: userId,
        trade,
        city: "",
        state: "",
        estimate_amount: row.amount,
        job_description: null,
        days_silent: row.daysSilent,
        quote_sent_at: quoteSentAtFromDaysSilent(row.daysSilent),
        client_name: normalizedName,
        client_email: normalizedEmail,
        client_phone: null,
      })
      .select("id, sequence_id")
      .single();

    if (insertResult.error || !insertResult.data) {
      // Don't refund the gate — partial failure shouldn't open a free
      // re-attempt loop. Move on.
      skippedByGate++;
      continue;
    }

    const quoteId = String(insertResult.data.id);
    const sequenceId = String(insertResult.data.sequence_id ?? "");

    // Best-effort plan generation + activity event. Failures here are
    // non-fatal — the quote is on the dashboard either way. The contractor
    // can manually trigger / fix sends per quote later.
    try {
      const plan = await generateRecoveryPlan({
        firstName: normalizedName.split(/\s+/)[0] || "there",
        contractorFirstName: null,
        trade,
        estimateAmount: row.amount,
        jobDescription: null,
        city: null,
        state: null,
        quoteId,
        daysSilent: row.daysSilent,
      });

      if (plan.length === 5 && sequenceId) {
        const baseSentAt = quoteSentAtFromDaysSilent(row.daysSilent);
        const sendAtFor = (daysAfter: number): string => {
          const d = new Date(baseSentAt);
          d.setUTCDate(d.getUTCDate() + daysAfter);
          return d.toISOString();
        };
        const cadence: Record<1 | 2 | 3 | 4 | 5, number> = {
          1: 1,
          2: 3,
          3: 7,
          4: 14,
          5: 30,
        };
        const reminderRows = plan.map((m) => ({
          user_id: userId,
          quote_id: quoteId,
          sequence_id: sequenceId,
          followup_number: m.followup_number,
          message_type: messageType,
          message_text: m.message,
          framework_used: m.framework,
          cta_type: m.cta_type,
          send_at: sendAtFor(cadence[m.followup_number]),
        }));
        await serviceClient.from("reminders").insert(reminderRows);
      }
    } catch {
      /* non-fatal */
    }

    try {
      await emitRecoveryEvent({
        userId,
        sequenceId,
        quoteId,
        eventType: "estimate_created",
        trade,
        estimateAmount: row.amount,
      });
    } catch {
      /* non-fatal */
    }

    imported++;
  }

  // Always mark onboarding done — even if zero quotes were imported (e.g.
  // every row failed gate). The reveal experience has happened; the user
  // should not be bounced back here.
  await userClient
    .from("profiles")
    .update({ onboarding_done: true })
    .eq("id", userId);

  revalidatePath("/dashboard");

  const remainingSilent = cleaned
    .slice(imported)
    .reduce((s, r) => s + r.amount, 0);

  return {
    ok: true,
    imported,
    skippedByGate,
    totalSilent,
    remainingSilent,
  };
}

/**
 * Skip onboarding without importing — marks the profile so future logins
 * land on the dashboard instead of the reveal page.
 */
export async function skipOnboardingAction(): Promise<{ ok: boolean }> {
  const userClient = createServerSupabaseClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return { ok: false };
  await userClient
    .from("profiles")
    .update({ onboarding_done: true })
    .eq("id", userData.user.id);
  revalidatePath("/dashboard");
  return { ok: true };
}
