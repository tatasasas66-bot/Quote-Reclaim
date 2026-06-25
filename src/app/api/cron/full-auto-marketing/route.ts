import { type NextRequest, NextResponse } from "next/server";
import { requireMarketingAutomationSecret } from "@/lib/marketing/admin";
import { marketingAutomationEnabled } from "@/lib/marketing/config";
import { runAllActiveCampaigns } from "@/lib/marketing/full-auto-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!marketingAutomationEnabled()) {
    return NextResponse.json({ ok: true, enabled: false, results: [] });
  }
  const auth = requireMarketingAutomationSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const results = await runAllActiveCampaigns();
  return NextResponse.json({ ok: true, enabled: true, results });
}

export const POST = GET;
