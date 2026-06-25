import { redirect } from "next/navigation";
import { requireFullAutoMarketingAdmin } from "@/lib/marketing/admin";
import { getMarketingSetupStatus } from "@/lib/marketing/config";
import {
  getMarketingMetrics,
  listMarketingCampaigns,
  listMarketingLeads,
  listMarketingRuns,
} from "@/lib/marketing/repo";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { FullAutoMarketingClient } from "./FullAutoMarketingClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FullAutoMarketingPage() {
  const access = await requireFullAutoMarketingAdmin();
  if (access.reason === "no_session") {
    redirect(safeRedirectPath("/sign-in?next=/admin/full-auto-marketing"));
  }
  if (access.reason === "not_admin") {
    redirect(safeRedirectPath("/dashboard"));
  }

  const [campaigns, runs, leads, metrics] = await Promise.all([
    listMarketingCampaigns(),
    listMarketingRuns(),
    listMarketingLeads(undefined, 300),
    getMarketingMetrics(),
  ]);

  return (
    <FullAutoMarketingClient
      setup={getMarketingSetupStatus()}
      campaigns={campaigns}
      runs={runs}
      leads={leads}
      metrics={metrics}
    />
  );
}
