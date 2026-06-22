import { redirect } from "next/navigation";
import { requireAdmin, isAdminConfigured } from "@/lib/auth/require-admin";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import {
  getOverviewStats,
  listLeads,
  listCampaigns,
  listReplies,
  ensureDefaultCampaign,
  listSuppressedEmails,
} from "@/lib/auto-marketing/repo";
import { AutoMarketingClient } from "./AutoMarketingClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /admin/auto-marketing — Full Auto Acquisition Command Center.
 *
 * Admin-gated via ADMIN_USER_IDS env allowlist. If the allowlist is empty,
 * the feature is disabled (fail closed). If the visitor is not signed in,
 * redirect to /sign-in. If signed in but not an admin, redirect to /dashboard.
 */
export default async function AutoMarketingPage() {
  const result = await requireAdmin();

  if (result.reason === "no_session" || !result.user) {
    redirect(safeRedirectPath(`/sign-in?next=/admin/auto-marketing`));
  }
  if (result.reason === "not_admin") {
    redirect(safeRedirectPath("/dashboard"));
  }

  // Ensure the default campaign exists.
  await ensureDefaultCampaign();

  const [stats, leads, campaigns, replies, suppressed] = await Promise.all([
    getOverviewStats(),
    listLeads({ limit: 300 }),
    listCampaigns(),
    listReplies({ limit: 100 }),
    listSuppressedEmails(),
  ]);

  const smartleadConfigured = Boolean(process.env.SMARTLEAD_API_KEY?.trim());
  const apifyConfigured = Boolean(process.env.APIFY_API_TOKEN?.trim());
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const adminEnabled = isAdminConfigured();

  return (
    <AutoMarketingClient
      stats={stats}
      leads={leads}
      campaigns={campaigns}
      replies={replies}
      suppressedEmails={suppressed}
      smartleadConfigured={smartleadConfigured}
      apifyConfigured={apifyConfigured}
      openaiConfigured={openaiConfigured}
      adminEnabled={adminEnabled}
    />
  );
}
