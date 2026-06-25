import type { MarketingSetupStatus } from "./types";

export const MARKETING_SENDER = "hello@quotereclaim.com";
export const DEFAULT_DAILY_CAP = 10;
export const MAX_DAILY_CAP = 15;

type Env = Partial<NodeJS.ProcessEnv>;

function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function marketingAutomationEnabled(env: Env = process.env): boolean {
  return env.MARKETING_AUTOMATION_ENABLED === "true";
}

export function getMarketingSetupStatus(env: Env = process.env): MarketingSetupStatus {
  const items = [
    {
      key: "google_workspace",
      label: "Google Workspace",
      configured: true,
      detail: `${MARKETING_SENDER} is managed externally`,
    },
    {
      key: "smartlead",
      label: "Smartlead API",
      configured: present(env.SMARTLEAD_API_KEY),
      detail: present(env.SMARTLEAD_API_KEY) ? "Connected" : "SMARTLEAD_API_KEY missing",
    },
    {
      key: "apify",
      label: "Apify API",
      configured: present(env.APIFY_TOKEN) && present(env.APIFY_GOOGLE_MAPS_ACTOR_ID),
      detail:
        present(env.APIFY_TOKEN) && present(env.APIFY_GOOGLE_MAPS_ACTOR_ID)
          ? "Connected"
          : "APIFY_TOKEN or APIFY_GOOGLE_MAPS_ACTOR_ID missing",
    },
    {
      key: "verifier",
      label: "Email verifier",
      configured:
        present(env.EMAIL_VERIFIER_PROVIDER) && present(env.EMAIL_VERIFIER_API_KEY),
      detail:
        present(env.EMAIL_VERIFIER_PROVIDER) && present(env.EMAIL_VERIFIER_API_KEY)
          ? env.EMAIL_VERIFIER_PROVIDER!.trim()
          : "Provider or API key missing",
    },
    {
      key: "compliance",
      label: "Compliance postal address",
      configured: present(env.COMPLIANCE_POSTAL_ADDRESS),
      detail: present(env.COMPLIANCE_POSTAL_ADDRESS)
        ? "Configured"
        : "COMPLIANCE_POSTAL_ADDRESS missing",
    },
    {
      key: "automation",
      label: "Marketing automation",
      configured: marketingAutomationEnabled(env),
      detail: marketingAutomationEnabled(env) ? "Enabled" : "Disabled",
    },
    {
      key: "automation_secret",
      label: "Automation secret",
      configured: present(env.MARKETING_AUTOMATION_SECRET),
      detail: present(env.MARKETING_AUTOMATION_SECRET)
        ? "Configured"
        : "MARKETING_AUTOMATION_SECRET missing",
    },
    {
      key: "admin_allowlist",
      label: "Admin allowlist",
      configured:
        present(env.FULL_AUTO_MARKETING_ADMIN_EMAILS) || present(env.ADMIN_USER_IDS),
      detail:
        present(env.FULL_AUTO_MARKETING_ADMIN_EMAILS) || present(env.ADMIN_USER_IDS)
          ? "Configured"
          : "FULL_AUTO_MARKETING_ADMIN_EMAILS missing",
    },
  ];

  const requiredKeys = [
    "smartlead",
    "apify",
    "verifier",
    "compliance",
    "automation",
    "automation_secret",
  ];
  const missingForLive = items
    .filter((item) => requiredKeys.includes(item.key) && !item.configured)
    .map((item) => item.label);

  return {
    sender: MARKETING_SENDER,
    items,
    liveReady: missingForLive.length === 0,
    missingForLive,
  };
}

export function normalizeDailyCap(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAILY_CAP;
  return Math.max(1, Math.min(MAX_DAILY_CAP, Math.floor(parsed)));
}
