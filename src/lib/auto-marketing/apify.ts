/**
 * Apify Google Maps Scraper integration.
 *
 * Sources contractor leads from Google Maps via Apify's Google Maps Scraper
 * actor. Returns raw lead rows ready for import into auto_marketing_leads.
 *
 * If APIFY_API_TOKEN is unset, isApifyConfigured() returns false and the
 * admin UI shows "Apify not configured". The sourcing function throws a
 * clear error if called without a token.
 *
 * The actor input follows Apify's Google Maps Scraper schema:
 *   searchStrings: ["concrete contractor Phoenix"]
 *   maxCrawledPlacesPerSearch: 50
 *   language: "en"
 *   countryCode: "US"
 */
import type { ImportedLeadRow } from "./types";

if (typeof window !== "undefined") {
  throw new Error("src/lib/auto-marketing/apify.ts must never be imported on the client.");
}

const APIFY_ACTOR_ID = "aps%2Fgoogle-maps-scraper";
const APIFY_BASE = "https://api.apify.com/v2";

/** True if Apify is configured (token present). */
export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

export type ApifySearchInput = {
  trade: string;
  city: string;
  /** Max results per search string. Default 50. */
  maxResults?: number;
};

export type ApifyRunResult = {
  runId: string;
  status: string;
  resultsUrl: string;
};

/**
 * Trigger an Apify Google Maps Scraper run synchronously and return the
 * scraped leads. Blocks until the run completes (Apify sync endpoint).
 *
 * Throws if Apify is not configured or the run fails.
 */
export async function sourceLeadsFromApify(
  input: ApifySearchInput & { source?: string },
): Promise<ImportedLeadRow[]> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) {
    throw new Error("APIFY_API_TOKEN is not configured. Set it in .env to enable Apify sourcing.");
  }

  const searchStrings = buildSearchStrings(input.trade, input.city);
  const maxResults = input.maxResults ?? 50;

  const actorInput = {
    searchStrings,
    maxCrawledPlacesPerSearch: maxResults,
    language: "en",
    countryCode: "US",
    // Only scrape businesses with websites (we need email-ready leads).
    skipBusinessesWithoutWebsites: true,
  };

  // Start the run and wait for completion (sync endpoint).
  const startUrl = `${APIFY_BASE}/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(startUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(actorInput),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify run failed: ${res.status} ${res.statusText}. ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as ApifyPlace[];
  return data.map((p) => apifyPlaceToLead(p, input.trade, input.city, input.source ?? "apify_google_maps"));
}

/** Build Google Maps search queries for a trade + city. */
export function buildSearchStrings(trade: string, city: string): string[] {
  const t = trade.toLowerCase();
  const c = city;
  if (t === "concrete" || t === "driveway") {
    return [
      `concrete contractor ${c}`,
      `driveway contractor ${c}`,
      `concrete replacement ${c}`,
    ];
  }
  if (t === "fencing" || t === "fence") {
    return [`fence contractor ${c}`, `fencing contractor ${c}`];
  }
  if (t === "painting" || t === "painter") {
    return [`painting contractor ${c}`, `residential painter ${c}`];
  }
  if (t === "hvac") {
    return [`HVAC contractor ${c}`, `AC replacement ${c}`];
  }
  if (t === "roofing" || t === "roofer") {
    return [`roofing contractor ${c}`, `roof replacement ${c}`];
  }
  return [`${trade} contractor ${c}`];
}

type ApifyPlace = {
  title?: string;
  website?: string;
  phone?: string;
  city?: string;
  state?: string;
  categoryName?: string;
  totalScore?: number;
  reviewsCount?: number;
  url?: string;
  locatedIn?: string;
  address?: string;
};

function apifyPlaceToLead(
  place: ApifyPlace,
  trade: string,
  city: string,
  source: string,
): ImportedLeadRow {
  // Derive a first name from the business name (best-effort).
  const company = place.title ?? "Unknown";
  const firstName = deriveFirstName(company);

  return {
    company,
    first_name: firstName ?? undefined,
    email: undefined, // Apify doesn't return emails — enrich separately
    phone: place.phone ?? undefined,
    website: place.website ?? undefined,
    city: place.city ?? city,
    state: place.state ?? undefined,
    trade,
    niche: undefined,
    source,
    gbp_url: place.url ?? undefined,
    review_count: place.reviewsCount ?? undefined,
    review_response_rate: undefined,
    public_signal: undefined,
    last_gbp_post: undefined,
    license_status: undefined,
    notes: place.categoryName ?? undefined,
  };
}

function deriveFirstName(company: string): string | null {
  // "Mike's Concrete" → "Mike", "Sun Belt Concrete LLC" → null (no owner name)
  const match = company.match(/^([A-Z][a-z]+)'s\b/);
  return match ? match[1]! : null;
}
