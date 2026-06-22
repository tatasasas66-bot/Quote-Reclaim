import { type NextRequest, NextResponse } from "next/server";
import { forbiddenResponseIfNotAdmin } from "@/lib/auth/require-admin";
import { isApifyConfigured, sourceLeadsFromApify } from "@/lib/auto-marketing/apify";
import { importLeads } from "@/lib/auto-marketing/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/auto-marketing/apify/source
 *
 * Triggers an Apify Google Maps Scraper run for the given trade + city,
 * imports the results into auto_marketing_leads (scoring them on import),
 * and returns the import summary.
 *
 * If APIFY_API_TOKEN is not configured, returns a clear "not configured"
 * status so the admin UI can show the missing-key message.
 *
 * Body: { trade: string, city: string, maxResults?: number }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await forbiddenResponseIfNotAdmin();
  if (guard) return guard;

  if (!isApifyConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        reason: "not_configured",
        message: "Apify not configured. Set APIFY_API_TOKEN in .env to enable lead sourcing.",
      },
      { status: 200 },
    );
  }

  let body: { trade?: string; city?: string; maxResults?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.trade || !body.city) {
    return NextResponse.json(
      { error: "trade and city are required" },
      { status: 400 },
    );
  }

  try {
    const leads = await sourceLeadsFromApify({
      trade: body.trade,
      city: body.city,
      maxResults: body.maxResults ?? 50,
      source: "apify_google_maps",
    });

    const result = await importLeads(leads);
    return NextResponse.json({
      ok: true,
      sourced: leads.length,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Apify sourcing failed",
      },
      { status: 500 },
    );
  }
}
