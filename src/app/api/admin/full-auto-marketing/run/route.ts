import { type NextRequest, NextResponse } from "next/server";
import { forbiddenIfNotFullAutoAdminOrSecret } from "@/lib/marketing/admin";
import {
  campaignActivationAllowed,
  getCompliancePostalAddress,
  LIVE_COMPLIANCE_BLOCK_REASON,
  marketingModeAllowed,
  normalizeDailyCap,
} from "@/lib/marketing/config";
import {
  ingestLatestApifyRun,
  runCampaignCycle,
  startCampaignLeadSearch,
  syncCampaignSmartlead,
  uploadCampaignLeads,
  verifyCampaignEmails,
} from "@/lib/marketing/full-auto-orchestrator";
import {
  createMarketingCampaign,
  suppressMarketingLead,
  unsuppressMarketingLead,
  updateMarketingCampaign,
} from "@/lib/marketing/repo";
import { buildComplianceSafeSequence } from "@/lib/marketing/sequence";
import type {
  MarketingCampaignStatus,
  MarketingMode,
} from "@/lib/marketing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action =
  | "create_campaign"
  | "start_search"
  | "ingest"
  | "verify"
  | "upload"
  | "sync"
  | "cycle"
  | "set_status"
  | "set_mode"
  | "suppress_lead"
  | "unsuppress_lead";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await forbiddenIfNotFullAutoAdminOrSecret(request);
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = String(body.action ?? "") as Action;
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";

  try {
    switch (action) {
      case "create_campaign": {
        const name = requiredText(body.name, "name");
        const slug = slugify(requiredText(body.slug ?? name, "slug"));
        const trade = requiredText(body.trade, "trade");
        const city = requiredText(body.city, "city");
        const searchQuery = requiredText(body.searchQuery, "searchQuery");
        const mode = body.mode === "live" ? "live" : "dry_run";
        requireAllowedMode(mode);
        const campaign = await createMarketingCampaign({
          name,
          slug,
          trade,
          city,
          searchQuery,
          apifyActorId: optionalText(body.apifyActorId),
          smartleadCampaignId:
            optionalText(body.smartleadCampaignId) ??
            process.env.SMARTLEAD_CAMPAIGN_ID?.trim() ??
            null,
          dailyCap: normalizeDailyCap(body.dailyCap),
          mode,
          status: "draft",
          sequenceConfig: buildComplianceSafeSequence(
            getCompliancePostalAddress(),
          ),
        });
        return NextResponse.json({ ok: true, campaign });
      }
      case "start_search":
        return NextResponse.json({
          ok: true,
          result: await startCampaignLeadSearch(requiredId(campaignId)),
        });
      case "ingest":
        return NextResponse.json({
          ok: true,
          result: await ingestLatestApifyRun(requiredId(campaignId)),
        });
      case "verify":
        return NextResponse.json({
          ok: true,
          result: await verifyCampaignEmails(requiredId(campaignId)),
        });
      case "upload": {
        const result = await uploadCampaignLeads(requiredId(campaignId));
        if (result.reason === LIVE_COMPLIANCE_BLOCK_REASON) {
          return NextResponse.json(
            { ok: false, dry_run_allowed: true, error: result.reason },
            { status: 409 },
          );
        }
        return NextResponse.json({ ok: true, result });
      }
      case "sync":
        return NextResponse.json({
          ok: true,
          result: { synced: await syncCampaignSmartlead(requiredId(campaignId)) },
        });
      case "cycle": {
        const result = await runCampaignCycle(requiredId(campaignId));
        if (result.errors.includes(LIVE_COMPLIANCE_BLOCK_REASON)) {
          return NextResponse.json(
            {
              ok: false,
              dry_run_allowed: true,
              error: LIVE_COMPLIANCE_BLOCK_REASON,
            },
            { status: 409 },
          );
        }
        return NextResponse.json({ ok: true, result });
      }
      case "set_status": {
        const status = String(body.status ?? "") as MarketingCampaignStatus;
        if (!["draft", "active", "paused", "stopped"].includes(status)) {
          throw new Error("Invalid campaign status");
        }
        if (!campaignActivationAllowed(status).allowed) {
          throw new LiveComplianceError();
        }
        await updateMarketingCampaign(requiredId(campaignId), {
          status,
          ...(status === "active"
            ? {
                sequence_config: buildComplianceSafeSequence(
                  getCompliancePostalAddress(),
                ),
              }
            : {}),
        });
        return NextResponse.json({ ok: true, status });
      }
      case "set_mode": {
        const mode = String(body.mode ?? "") as MarketingMode;
        if (!["dry_run", "live"].includes(mode)) throw new Error("Invalid mode");
        requireAllowedMode(mode);
        await updateMarketingCampaign(requiredId(campaignId), {
          mode,
          sequence_config: buildComplianceSafeSequence(
            getCompliancePostalAddress(),
          ),
        });
        return NextResponse.json({ ok: true, mode });
      }
      case "suppress_lead":
        return NextResponse.json({
          ok: await suppressMarketingLead(requiredText(body.leadId, "leadId")),
        });
      case "unsuppress_lead":
        return NextResponse.json({
          ok: await unsuppressMarketingLead(requiredText(body.leadId, "leadId")),
        });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Marketing action failed" },
      { status: error instanceof LiveComplianceError ? 409 : 400 },
    );
  }
}

function requiredId(value: string): string {
  if (!value) throw new Error("campaignId is required");
  return value;
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim().slice(0, 200);
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 200)
    : null;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  if (!slug) throw new Error("A valid slug is required");
  return slug;
}

function requireAllowedMode(mode: MarketingMode): void {
  const decision = marketingModeAllowed(mode);
  if (!decision.allowed) throw new LiveComplianceError();
}

class LiveComplianceError extends Error {
  constructor() {
    super(LIVE_COMPLIANCE_BLOCK_REASON);
    this.name = "LiveComplianceError";
  }
}
