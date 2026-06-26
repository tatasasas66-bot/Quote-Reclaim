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

type SocialMediaProfileOptions = {
  facebooks: boolean;
  instagrams: boolean;
  youtubes: boolean;
  tiktoks: boolean;
  twitters: boolean;
};

export type GoogleMapsActorInput = {
  searchStringsArray: string[];
  locationQuery: string;
  maxCrawledPlacesPerSearch: number;
  language: "en";
  countryCode: "US";
  scrapeContacts: true;
  maximumLeadsEnrichmentRecords: number;
  scrapeSocialMediaProfiles: SocialMediaProfileOptions;
  skipClosedPlaces: true;
  website: "withWebsite";
};

const DISABLED_SOCIAL_MEDIA_PROFILES: SocialMediaProfileOptions = {
  facebooks: false,
  instagrams: false,
  youtubes: false,
  tiktoks: false,
  twitters: false,
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

/**
 * Object-typed Actor options must always stay objects. If an old boolean or
 * malformed value reaches this boundary, fall back to the disabled shape
 * instead of sending schema-invalid JSON to Apify.
 */
export function normalizeActorObjectOption<T extends Record<string, unknown>>(
  value: unknown,
  disabledValue: T,
): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...disabledValue };
  }
  return { ...disabledValue, ...(value as Partial<T>) };
}

export function buildGoogleMapsActorInput(input: {
  searchQuery: string;
  city: string;
  maxPlaces: number;
  scrapeSocialMediaProfiles?: unknown;
}): GoogleMapsActorInput {
  return {
    searchStringsArray: [input.searchQuery],
    locationQuery: input.city,
    maxCrawledPlacesPerSearch: input.maxPlaces,
    language: "en",
    countryCode: "US",
    scrapeContacts: true,
    maximumLeadsEnrichmentRecords: input.maxPlaces,
    scrapeSocialMediaProfiles: normalizeActorObjectOption(
      input.scrapeSocialMediaProfiles,
      DISABLED_SOCIAL_MEDIA_PROFILES,
    ),
    skipClosedPlaces: true,
    website: "withWebsite",
  };
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
  const body = buildGoogleMapsActorInput({
    searchQuery: input.searchQuery,
    city: input.city,
    maxPlaces,
  });

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
