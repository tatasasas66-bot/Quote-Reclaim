import { normalizeApifyRecord } from "./normalize";
import type { NormalizedApifyPlace } from "./types";

if (typeof window !== "undefined") {
  throw new Error("src/lib/marketing/apify.ts is server-only");
}

const APIFY_BASE_URL = "https://api.apify.com/v2";

type Env = Partial<NodeJS.ProcessEnv>;
type FetchLike = typeof fetch;

export type ApifyRun = {
  id: string;
  status: string;
  defaultDatasetId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  usageTotalUsd: number | null;
};

function credentials(env: Env = process.env): {
  token: string;
  actorId: string;
} | null {
  const token = env.APIFY_TOKEN?.trim();
  const actorId = env.APIFY_GOOGLE_MAPS_ACTOR_ID?.trim();
  return token && actorId ? { token, actorId } : null;
}

function actorPath(actorId: string): string {
  return encodeURIComponent(actorId.replace("/", "~"));
}

async function apifyJson<T>(
  path: string,
  options: RequestInit,
  env: Env,
  fetchImpl: FetchLike,
): Promise<T> {
  const config = credentials(env);
  if (!config) {
    throw new Error("Apify setup required");
  }
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetchImpl(
    `${APIFY_BASE_URL}${path}${separator}token=${encodeURIComponent(config.token)}`,
    options,
  );
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Apify request failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as T;
}

export function isApifyReady(env: Env = process.env): boolean {
  return Boolean(credentials(env));
}

export async function startGoogleMapsRun(
  input: {
    searchQuery: string;
    city: string;
    maxPlaces?: number;
    actorId?: string | null;
  },
  options: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<ApifyRun> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = credentials(env);
  if (!config) throw new Error("Apify setup required");
  const actorId = input.actorId?.trim() || config.actorId;
  const maxPlaces = Math.max(1, Math.min(30, input.maxPlaces ?? 30));
  const body = {
    searchStringsArray: [input.searchQuery],
    locationQuery: input.city,
    maxCrawledPlacesPerSearch: maxPlaces,
    language: "en",
    countryCode: "US",
    scrapeContacts: true,
    maximumLeadsEnrichmentRecords: maxPlaces,
    scrapeSocialMediaProfiles: false,
    skipClosedPlaces: true,
    website: "withWebsite",
  };

  const payload = await apifyJson<{ data?: Record<string, unknown> }>(
    `/acts/${actorPath(actorId)}/runs?maxItems=${maxPlaces}&maxTotalChargeUsd=2`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
    fetchImpl,
  );
  return normalizeRun(payload.data ?? {});
}

export async function getApifyRun(
  runId: string,
  options: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<ApifyRun> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const payload = await apifyJson<{ data?: Record<string, unknown> }>(
    `/actor-runs/${encodeURIComponent(runId)}`,
    { method: "GET" },
    env,
    fetchImpl,
  );
  return normalizeRun(payload.data ?? {});
}

export async function fetchApifyDataset(
  datasetId: string,
  defaults: { city: string },
  options: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<NormalizedApifyPlace[]> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const items = await apifyJson<unknown[]>(
    `/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,
    { method: "GET" },
    env,
    fetchImpl,
  );
  return items.map((item) => normalizeApifyRecord(item, defaults));
}

function normalizeRun(data: Record<string, unknown>): ApifyRun {
  const stats =
    data.stats && typeof data.stats === "object"
      ? (data.stats as Record<string, unknown>)
      : {};
  const usage =
    data.usageTotalUsd ??
    data.usageTotalUsdAfterDiscount ??
    stats.usageTotalUsd ??
    null;
  return {
    id: typeof data.id === "string" ? data.id : "",
    status: typeof data.status === "string" ? data.status : "UNKNOWN",
    defaultDatasetId:
      typeof data.defaultDatasetId === "string" ? data.defaultDatasetId : null,
    startedAt: typeof data.startedAt === "string" ? data.startedAt : null,
    finishedAt: typeof data.finishedAt === "string" ? data.finishedAt : null,
    usageTotalUsd: typeof usage === "number" ? usage : null,
  };
}
