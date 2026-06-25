import { normalizeMarketingEmail } from "./normalize";
import type { VerificationStatus } from "./types";

if (typeof window !== "undefined") {
  throw new Error("src/lib/marketing/email-verifier.ts is server-only");
}

type Env = Partial<NodeJS.ProcessEnv>;
type FetchLike = typeof fetch;

export type VerificationResult = {
  status: VerificationStatus;
  detail: string;
  provider: string | null;
};

export function isEmailVerifierReady(env: Env = process.env): boolean {
  return Boolean(
    env.EMAIL_VERIFIER_PROVIDER?.trim() && env.EMAIL_VERIFIER_API_KEY?.trim(),
  );
}

export async function verifyMarketingEmail(
  rawEmail: string,
  options: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<VerificationResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const email = normalizeMarketingEmail(rawEmail);
  if (!email) {
    return { status: "invalid", detail: "Invalid email syntax", provider: null };
  }

  const provider = env.EMAIL_VERIFIER_PROVIDER?.trim().toLowerCase();
  const apiKey = env.EMAIL_VERIFIER_API_KEY?.trim();
  if (!provider || !apiKey) {
    return { status: "unverified", detail: "Verifier not configured", provider: null };
  }
  if (provider !== "zerobounce") {
    return {
      status: "unknown",
      detail: `Unsupported verifier provider: ${provider}`,
      provider,
    };
  }

  const url = new URL("https://api.zerobounce.net/v2/validate");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", email);
  const response = await fetchImpl(url, { method: "GET" });
  if (!response.ok) {
    return {
      status: "unknown",
      detail: `Verifier request failed (${response.status})`,
      provider,
    };
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const rawStatus =
    typeof payload.status === "string" ? payload.status.toLowerCase() : "unknown";
  const subStatus =
    typeof payload.sub_status === "string" ? payload.sub_status.toLowerCase() : "";

  if (rawStatus === "valid") {
    return { status: "valid", detail: subStatus || "valid", provider };
  }
  if (rawStatus === "invalid") {
    return { status: "invalid", detail: subStatus || "invalid", provider };
  }
  if (
    ["catch-all", "catch_all", "spamtrap", "abuse", "do_not_mail"].includes(
      rawStatus,
    ) ||
    ["catch_all", "spamtrap", "abuse", "do_not_mail"].includes(subStatus)
  ) {
    return { status: "risky", detail: subStatus || rawStatus, provider };
  }
  return { status: "unknown", detail: subStatus || rawStatus, provider };
}
