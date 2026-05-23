import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/security/require-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_NAME = "weekly_briefing";
const BRIEFING_HORIZON_DAYS = 7;

type BriefingRow = {
  user_id: string;
  pending_count: number;
  silent_value: number;
  recovered_this_month: number;
  next_due_count: number;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleBriefing(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleBriefing(request);
}

async function handleBriefing(request: NextRequest): Promise<NextResponse> {
  const auth = requireCronAuth(request);
  if (!auth.ok) {
    return new NextResponse(auth.error, { status: auth.status });
  }

  const supabase = createServiceSupabaseClient();
  const cronRunId = randomUUID();

  await supabase.from("cron_runs").insert({
    id: cronRunId,
    cron_name: CRON_NAME,
    status: "running",
  });

  // Find every user with at least one pending quote — those are the
  // contractors who'd want a briefing this week.
  const { data: pendingQuotes, error: qError } = await supabase
    .from("quotes")
    .select("user_id, estimate_amount, outcome, won_at")
    .eq("outcome", "pending");

  if (qError) {
    await supabase
      .from("cron_runs")
      .update({
        status: "failed",
        errors: [{ stage: "pending_query", error: qError.message }],
        completed_at: new Date().toISOString(),
      })
      .eq("id", cronRunId);
    return NextResponse.json(
      { error: "Query failed", cron_run_id: cronRunId },
      { status: 500 },
    );
  }

  const pendingByUser = new Map<string, { count: number; value: number }>();
  for (const q of pendingQuotes ?? []) {
    const userId = q.user_id as string;
    const cur = pendingByUser.get(userId) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(q.estimate_amount ?? 0);
    pendingByUser.set(userId, cur);
  }

  const horizonIso = new Date(
    Date.now() + BRIEFING_HORIZON_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const monthStartIso = (() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  const briefings: BriefingRow[] = [];

  for (const [userId, agg] of Array.from(pendingByUser.entries())) {
    const [dueRes, recoveredRes] = await Promise.all([
      supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("sent", false)
        .is("paused_at", null)
        .lte("send_at", horizonIso),
      supabase
        .from("quotes")
        .select("estimate_amount")
        .eq("user_id", userId)
        .eq("outcome", "won")
        .gte("won_at", monthStartIso),
    ]);

    const nextDueCount = dueRes.count ?? 0;
    const recoveredThisMonth = (recoveredRes.data ?? []).reduce(
      (sum, q) => sum + Number(q.estimate_amount ?? 0),
      0,
    );

    briefings.push({
      user_id: userId,
      pending_count: agg.count,
      silent_value: agg.value,
      recovered_this_month: recoveredThisMonth,
      next_due_count: nextDueCount,
    });
  }

  // TODO (Phase 11+): when SMS briefing is explicitly enabled per-user and
  // the messaging service is configured, deliver these summaries via SMS.
  // For Phase 10 we only compute and store the snapshot in cron_runs.metadata
  // so ops can verify the foundation works.

  await supabase
    .from("cron_runs")
    .update({
      status: "success",
      metadata: {
        candidates: briefings.length,
        horizon_days: BRIEFING_HORIZON_DAYS,
        // Cap stored sample so cron_runs row stays small; full set lives in
        // the per-user computation above.
        sample: briefings.slice(0, 25),
      },
      completed_at: new Date().toISOString(),
    })
    .eq("id", cronRunId);

  return NextResponse.json({
    cron_run_id: cronRunId,
    candidates: briefings.length,
    briefings,
  });
}
