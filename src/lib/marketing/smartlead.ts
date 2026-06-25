import type { MarketingLead, MarketingReplyStatus } from "./types";

if (typeof window !== "undefined") {
  throw new Error("src/lib/marketing/smartlead.ts is server-only");
}

const SMARTLEAD_BASE_URL = "https://server.smartlead.ai/api/v1";

type Env = Partial<NodeJS.ProcessEnv>;
type FetchLike = typeof fetch;

export type SmartleadUploadResult = {
  added: number;
  skipped: number;
  leadIdsByEmail: Map<string, string>;
  detail: string;
};

export type SmartleadLeadState = {
  email: string;
  leadId: string | null;
  status: string | null;
  replyStatus: MarketingReplyStatus;
  suppressionReason: string | null;
};

function apiKey(env: Env): string | null {
  return env.SMARTLEAD_API_KEY?.trim() || null;
}

async function smartleadJson<T>(
  path: string,
  init: RequestInit,
  env: Env,
  fetchImpl: FetchLike,
): Promise<T> {
  const key = apiKey(env);
  if (!key) throw new Error("Smartlead setup required");
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetchImpl(
    `${SMARTLEAD_BASE_URL}${path}${separator}api_key=${encodeURIComponent(key)}`,
    init,
  );
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Smartlead request failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as T;
}

export function isSmartleadReady(env: Env = process.env): boolean {
  return Boolean(apiKey(env));
}

export async function getSmartleadCampaignStatus(
  campaignId: string,
  options: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const payload = await smartleadJson<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}`,
    { method: "GET" },
    env,
    fetchImpl,
  );
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;
  return typeof data.status === "string" ? data.status.toUpperCase() : "UNKNOWN";
}

export async function uploadLeadsToSmartlead(
  campaignId: string,
  leads: MarketingLead[],
  options: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<SmartleadUploadResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  if (leads.length === 0) {
    return { added: 0, skipped: 0, leadIdsByEmail: new Map(), detail: "No leads" };
  }
  const payload = await smartleadJson<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/leads`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lead_list: leads.slice(0, 400).map((lead) => ({
          email: lead.email,
          first_name: lead.first_name ?? "",
          last_name: "",
          company_name: lead.company_name,
          phone_number: lead.phone ?? "",
          website: lead.website ?? "",
          location: lead.city,
          custom_fields: {
            company_name: lead.company_name,
            trade: lead.trade,
            city: lead.city,
            website: lead.website ?? "",
            audit_url: lead.audit_url,
          },
        })),
      }),
    },
    env,
    fetchImpl,
  );

  const leadIdsByEmail = new Map<string, string>();
  const rows = Array.isArray(payload.leads)
    ? payload.leads
    : Array.isArray(payload.data)
      ? payload.data
      : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.email === "string" && record.id != null) {
      leadIdsByEmail.set(record.email.toLowerCase(), String(record.id));
    }
  }

  return {
    added:
      typeof payload.added_count === "number"
        ? payload.added_count
        : typeof payload.added === "number"
          ? payload.added
          : leads.length,
    skipped:
      typeof payload.skipped_count === "number"
        ? payload.skipped_count
        : typeof payload.skipped === "number"
          ? payload.skipped
          : 0,
    leadIdsByEmail,
    detail:
      typeof payload.message === "string" ? payload.message : "Smartlead upload complete",
  };
}

export async function listSmartleadCampaignLeads(
  campaignId: string,
  options: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<SmartleadLeadState[]> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const output: SmartleadLeadState[] = [];

  for (let offset = 0; offset < 1000; offset += 100) {
    const payload = await smartleadJson<unknown>(
      `/campaigns/${encodeURIComponent(campaignId)}/leads?offset=${offset}&limit=100`,
      { method: "GET" },
      env,
      fetchImpl,
    );
    const rows = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object"
        ? ((payload as Record<string, unknown>).data ??
            (payload as Record<string, unknown>).leads ??
            [])
        : [];
    if (!Array.isArray(rows) || rows.length === 0) break;
    output.push(
      ...rows
        .map(normalizeSmartleadLead)
        .filter((row): row is SmartleadLeadState => row !== null),
    );
    if (rows.length < 100) break;
  }
  return output;
}

function normalizeSmartleadLead(value: unknown): SmartleadLeadState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const email = typeof row.email === "string" ? row.email.toLowerCase().trim() : "";
  if (!email) return null;
  const status =
    typeof row.status === "string"
      ? row.status
      : typeof row.lead_status === "string"
        ? row.lead_status
        : null;
  const category = String(
    row.lead_category ?? row.category ?? row.email_status ?? status ?? "",
  ).toLowerCase();
  const unsubscribed =
    row.is_unsubscribed === true || category.includes("unsubscrib");
  const bounced = category.includes("bounce") || category.includes("invalid");
  const replied = category.includes("repl");
  const positive = category.includes("positive") || category.includes("interested");
  const negative = category.includes("negative") || category.includes("not interested");

  let replyStatus: MarketingReplyStatus = "none";
  if (unsubscribed) replyStatus = "unsubscribed";
  else if (bounced) replyStatus = "bounced";
  else if (positive) replyStatus = "positive";
  else if (negative) replyStatus = "negative";
  else if (replied) replyStatus = "replied";

  return {
    email,
    leadId: row.id != null ? String(row.id) : null,
    status,
    replyStatus,
    suppressionReason:
      replyStatus === "unsubscribed"
        ? "smartlead_unsubscribed"
        : replyStatus === "bounced"
          ? "smartlead_bounced"
          : replyStatus === "negative"
            ? "smartlead_negative_reply"
            : null,
  };
}
