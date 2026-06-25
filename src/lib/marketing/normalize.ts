import type { NormalizedApifyPlace } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const EMAIL_KEYS = new Set([
  "email",
  "emails",
  "contactemail",
  "contactemails",
  "emailsuncertain",
  "companycontacts",
  "contacts",
  "contactdetails",
  "leadcontacts",
  "leadsenrichment",
]);

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function pick(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return null;
}

export function normalizeMarketingEmail(value: string): string | null {
  const email = value.trim().toLowerCase().replace(/^mailto:/, "");
  return EMAIL_RE.test(email) ? email : null;
}

export function normalizeWebsite(value: string | null): string | null {
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function websiteDomain(value: string | null): string | null {
  const website = normalizeWebsite(value);
  if (!website) return null;
  try {
    return new URL(website).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function collectEmails(value: unknown, keyHint = "", depth = 0): string[] {
  if (depth > 4 || value == null) return [];
  if (typeof value === "string") {
    if (!EMAIL_KEYS.has(keyHint.toLowerCase()) && !value.includes("@")) return [];
    return value
      .split(/[,\s;]+/)
      .map(normalizeMarketingEmail)
      .filter((email): email is string => Boolean(email));
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectEmails(item, keyHint, depth + 1));
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      const normalizedKey = key.toLowerCase();
      if (
        EMAIL_KEYS.has(normalizedKey) ||
        normalizedKey.includes("email") ||
        normalizedKey.includes("contact")
      ) {
        return collectEmails(item, normalizedKey, depth + 1);
      }
      return [];
    });
  }
  return [];
}

function deriveFirstName(companyName: string): string | null {
  const match = companyName.match(/^([A-Z][a-z]+)(?:'s|\s)/);
  return match?.[1] ?? null;
}

function isGoogleMapsUrl(value: string | null): boolean {
  return Boolean(value && /google\.[^/]+\/maps|maps\.app\.goo\.gl/i.test(value));
}

export function normalizeApifyRecord(
  input: unknown,
  defaults: { city: string },
): NormalizedApifyPlace {
  const record =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const companyName =
    pick(record, ["title", "name", "companyName", "company_name"]) ?? "Unknown business";
  const rawUrl = pick(record, ["url"]);
  const websiteCandidate =
    pick(record, ["website", "websiteUrl", "companyWebsite", "company_url"]) ??
    (rawUrl && !isGoogleMapsUrl(rawUrl) ? rawUrl : null);
  const website = normalizeWebsite(websiteCandidate);
  const googleMapsUrl =
    pick(record, ["googleMapsUrl", "mapsUrl", "google_maps_url"]) ??
    (isGoogleMapsUrl(rawUrl) ? rawUrl : null);
  const emailCandidates = collectEmails(record);

  return {
    companyName,
    firstName:
      pick(record, ["firstName", "first_name", "ownerFirstName"]) ??
      deriveFirstName(companyName),
    website,
    websiteDomain: websiteDomain(website),
    emails: Array.from(new Set(emailCandidates)),
    phone: pick(record, ["phone", "phoneNumber", "phone_number"]),
    address: pick(record, ["address", "street", "fullAddress"]),
    city: pick(record, ["city", "municipality", "locality"]) ?? defaults.city,
    googleMapsUrl,
    sourcePlaceId: pick(record, ["placeId", "place_id", "googlePlaceId"]),
  };
}
