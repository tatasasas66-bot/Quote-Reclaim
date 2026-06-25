"use client";

import * as React from "react";
import {
  Ban,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  CloudDownload,
  Database,
  MailCheck,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  StopCircle,
} from "lucide-react";
import type {
  MarketingCampaign,
  MarketingLead,
  MarketingMetrics,
  MarketingRun,
  MarketingSetupStatus,
} from "@/lib/marketing/types";
import { DEFAULT_CAMPAIGN_INPUT } from "@/lib/marketing/sequence";

type Props = {
  setup: MarketingSetupStatus;
  campaigns: MarketingCampaign[];
  runs: MarketingRun[];
  leads: MarketingLead[];
  metrics: MarketingMetrics;
};

type Action =
  | "start_search"
  | "ingest"
  | "verify"
  | "upload"
  | "sync"
  | "cycle";

type CampaignDraft = {
  name: string;
  slug: string;
  trade: string;
  city: string;
  searchQuery: string;
  smartleadCampaignId: string;
  dailyCap: string;
};

export function FullAutoMarketingClient({
  setup,
  campaigns,
  runs,
  leads,
  metrics,
}: Props) {
  const [campaignId, setCampaignId] = React.useState(campaigns[0]?.id ?? "");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(campaigns.length === 0);
  const [draft, setDraft] = React.useState<CampaignDraft>({
    name: DEFAULT_CAMPAIGN_INPUT.name,
    slug: DEFAULT_CAMPAIGN_INPUT.slug,
    trade: DEFAULT_CAMPAIGN_INPUT.trade,
    city: DEFAULT_CAMPAIGN_INPUT.city,
    searchQuery: DEFAULT_CAMPAIGN_INPUT.searchQuery,
    smartleadCampaignId: "",
    dailyCap: String(DEFAULT_CAMPAIGN_INPUT.dailyCap),
  });
  const selected = campaigns.find((campaign) => campaign.id === campaignId);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/full-auto-marketing/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, campaignId, ...extra }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Action failed");
      }
      setMessage(`${labelForAction(action)} completed. Refreshing data...`);
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function createCampaign() {
    await call("create_campaign", {
      ...draft,
      dailyCap: Number(draft.dailyCap),
      mode: DEFAULT_CAMPAIGN_INPUT.mode,
    });
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line-subtle pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Internal Admin
            </p>
            <h1 className="mt-2 text-2xl font-black text-ink-strong sm:text-3xl">
              Full-Auto Marketing
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
              Apify finds public contractor leads, verification protects sender
              reputation, and Smartlead runs controlled outreach. Resend and
              customer recovery email are not part of this pipeline.
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              Cron-ready endpoint: /api/cron/full-auto-marketing. Authenticate
              scheduled calls with MARKETING_AUTOMATION_SECRET.
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold ${
              setup.liveReady
                ? "border-success/40 bg-success/10 text-success"
                : "border-warning/40 bg-warning/10 text-warning"
            }`}
          >
            {setup.liveReady ? "Live gates ready" : "Setup required"}
          </span>
        </header>

        <section aria-labelledby="setup-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="setup-heading" className="text-lg font-black text-ink-strong">
              Setup status
            </h2>
            <p className="text-xs text-ink-muted">Sender: {setup.sender}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {setup.items.map((item) => (
              <div
                key={item.key}
                className="min-w-0 border-t border-line-subtle bg-surface-1 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  {item.configured ? (
                    <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  ) : (
                    <Ban className="h-4 w-4 text-warning" aria-hidden="true" />
                  )}
                  <p className="text-sm font-bold text-ink-strong">{item.label}</p>
                </div>
                <p className="mt-1 break-words text-xs leading-5 text-ink-muted">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="metrics-heading">
          <h2 id="metrics-heading" className="mb-3 text-lg font-black text-ink-strong">
            Pipeline
          </h2>
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-line-subtle bg-line-subtle sm:grid-cols-4 lg:grid-cols-6">
            <Metric label="Leads found" value={metrics.leadsFound} />
            <Metric label="Websites" value={metrics.websitesFound} />
            <Metric label="Emails" value={metrics.emailsFound} />
            <Metric label="Valid" value={metrics.validEmails} tone="success" />
            <Metric label="Uploaded" value={metrics.uploaded} tone="brand" />
            <Metric label="Sent" value={metrics.sent} />
            <Metric label="Replied" value={metrics.replied} />
            <Metric label="Positive" value={metrics.positive} tone="success" />
            <Metric label="Negative" value={metrics.negative} />
            <Metric label="Bounced" value={metrics.bounced} tone="danger" />
            <Metric label="Unsubscribed" value={metrics.unsubscribed} tone="danger" />
            <Metric label="No email" value={metrics.skippedNoEmail} />
            <Metric
              label="Risky / unknown"
              value={metrics.skippedRiskyUnknown}
              tone="warning"
            />
          </div>
          {metrics.latestError ? (
            <p className="mt-3 border-l-2 border-danger pl-3 text-sm text-danger">
              Latest error: {metrics.latestError}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="campaign-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="campaign-heading" className="text-lg font-black text-ink-strong">
                Campaign command
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Before buying another lead, check the estimates you already sent.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate((visible) => !visible)}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface-1 px-4 py-2 text-sm font-bold text-ink-strong hover:bg-surface-2"
            >
              <Database className="h-4 w-4" aria-hidden="true" />
              {showCreate ? "Close campaign form" : "Create campaign"}
            </button>
          </div>

          {showCreate ? (
            <form
              className="grid gap-3 border-y border-line-subtle py-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                void createCampaign();
              }}
            >
              <CampaignInput
                label="Campaign name"
                value={draft.name}
                onChange={(name) => setDraft((current) => ({ ...current, name }))}
              />
              <CampaignInput
                label="Slug"
                value={draft.slug}
                onChange={(slug) => setDraft((current) => ({ ...current, slug }))}
              />
              <CampaignInput
                label="Trade"
                value={draft.trade}
                onChange={(trade) => setDraft((current) => ({ ...current, trade }))}
              />
              <CampaignInput
                label="City"
                value={draft.city}
                onChange={(city) => setDraft((current) => ({ ...current, city }))}
              />
              <div className="min-w-0 sm:col-span-2">
                <CampaignInput
                  label="Search query"
                  value={draft.searchQuery}
                  onChange={(searchQuery) =>
                    setDraft((current) => ({ ...current, searchQuery }))
                  }
                />
              </div>
              <CampaignInput
                label="Smartlead campaign ID"
                value={draft.smartleadCampaignId}
                onChange={(smartleadCampaignId) =>
                  setDraft((current) => ({ ...current, smartleadCampaignId }))
                }
              />
              <CampaignInput
                label="Daily cap (1-15)"
                value={draft.dailyCap}
                inputMode="numeric"
                onChange={(dailyCap) =>
                  setDraft((current) => ({ ...current, dailyCap }))
                }
              />
              <button
                type="submit"
                disabled={Boolean(busy)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-bold text-canvas disabled:opacity-50 sm:col-span-2 lg:col-span-4"
              >
                <Database className="h-4 w-4" aria-hidden="true" />
                Create campaign in dry-run mode
              </button>
            </form>
          ) : null}

          {campaigns.length > 0 ? (
            <>
              <div className="grid gap-4 border-y border-line-subtle py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <label className="min-w-0 text-sm font-semibold text-ink-strong">
                  Campaign
                  <select
                    value={campaignId}
                    onChange={(event) => setCampaignId(event.target.value)}
                    className="mt-2 w-full min-w-0 rounded-md border border-line-strong bg-surface-1 px-3 py-2.5 text-sm"
                  >
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} - {campaign.mode} - {campaign.status}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <SmallButton
                    icon={CirclePlay}
                    label="Resume"
                    onClick={() => call("set_status", { status: "active" })}
                    disabled={Boolean(busy)}
                  />
                  <SmallButton
                    icon={CirclePause}
                    label="Pause"
                    onClick={() => call("set_status", { status: "paused" })}
                    disabled={Boolean(busy)}
                  />
                  <SmallButton
                    icon={StopCircle}
                    label="Stop"
                    onClick={() => call("set_status", { status: "stopped" })}
                    disabled={Boolean(busy)}
                  />
                  <SmallButton
                    icon={ShieldCheck}
                    label={selected?.mode === "live" ? "Use dry run" : "Set live mode"}
                    onClick={() =>
                      call("set_mode", {
                        mode: selected?.mode === "live" ? "dry_run" : "live",
                      })
                    }
                    disabled={Boolean(busy)}
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <ActionButton
                  icon={Search}
                  label="Run lead search"
                  action="start_search"
                  busy={busy}
                  onRun={(action) => call(action)}
                />
                <ActionButton
                  icon={CloudDownload}
                  label="Ingest latest dataset"
                  action="ingest"
                  busy={busy}
                  onRun={(action) => call(action)}
                />
                <ActionButton
                  icon={MailCheck}
                  label="Verify pending emails"
                  action="verify"
                  busy={busy}
                  onRun={(action) => call(action)}
                />
                <ActionButton
                  icon={Send}
                  label="Upload valid leads"
                  action="upload"
                  busy={busy}
                  onRun={(action) => call(action)}
                />
                <ActionButton
                  icon={RefreshCw}
                  label="Sync Smartlead"
                  action="sync"
                  busy={busy}
                  onRun={(action) => call(action)}
                />
                <ActionButton
                  icon={ShieldCheck}
                  label="Run full-auto cycle"
                  action="cycle"
                  busy={busy}
                  primary
                  onRun={(action) => call(action)}
                />
              </div>
            </>
          ) : null}
          {message ? (
            <p role="status" className="text-sm font-semibold text-ink-muted">
              {message}
            </p>
          ) : null}
        </section>

        {selected ? (
          <section aria-labelledby="sequence-heading">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="sequence-heading"
                  className="text-lg font-black text-ink-strong"
                >
                  Smartlead sequence reference
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Stored for review and copying. Quote Reclaim does not send these
                  through Resend.
                </p>
              </div>
              <span className="text-xs text-ink-muted">
                Smartlead campaign: {selected.smartlead_campaign_id ?? "not mapped"}
              </span>
            </div>
            <SequencePreview config={selected.sequence_config} />
          </section>
        ) : null}

        <section aria-labelledby="lead-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="lead-heading" className="text-lg font-black text-ink-strong">
              Leads
            </h2>
            <span className="text-xs text-ink-muted">{leads.length} shown</span>
          </div>
          <div className="overflow-x-auto border border-line-subtle">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-3 py-3">Company</th>
                  <th className="px-3 py-3">Trade / city</th>
                  <th className="px-3 py-3">Website</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Verification</th>
                  <th className="px-3 py-3">Smartlead</th>
                  <th className="px-3 py-3">Reply</th>
                  <th className="px-3 py-3">Suppression</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-line-subtle">
                    <td className="px-3 py-3 font-semibold text-ink-strong">
                      {lead.company_name}
                    </td>
                    <td className="px-3 py-3 text-ink-muted">
                      {lead.trade} / {lead.city}
                    </td>
                    <td className="max-w-52 truncate px-3 py-3 text-ink-muted">
                      {lead.website_domain ?? "-"}
                    </td>
                    <td className="px-3 py-3 text-ink-muted">{lead.email ?? "-"}</td>
                    <td className="px-3 py-3">{lead.verification_status}</td>
                    <td className="px-3 py-3">{lead.smartlead_status ?? "-"}</td>
                    <td className="px-3 py-3">{lead.reply_status}</td>
                    <td className="px-3 py-3">
                      {lead.suppressed ? lead.suppression_reason ?? "suppressed" : "clear"}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          call(lead.suppressed ? "unsuppress_lead" : "suppress_lead", {
                            leadId: lead.id,
                          })
                        }
                        className="text-xs font-bold text-brand hover:underline disabled:opacity-50"
                      >
                        {lead.suppressed ? "Unsuppress" : "Suppress"}
                      </button>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-ink-muted">
                      No marketing leads yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="runs-heading">
          <h2 id="runs-heading" className="mb-3 text-lg font-black text-ink-strong">
            Recent runs
          </h2>
          <div className="space-y-px bg-line-subtle">
            {runs.map((run) => (
              <div
                key={run.id}
                className="grid gap-2 bg-surface-1 px-4 py-3 text-sm sm:grid-cols-4"
              >
                <span className="font-semibold text-ink-strong">{run.status}</span>
                <span>{run.leads_found} leads</span>
                <span>{run.valid_emails} valid</span>
                <span>{run.uploaded_to_smartlead} uploaded</span>
              </div>
            ))}
            {runs.length === 0 ? (
              <p className="bg-surface-1 px-4 py-6 text-sm text-ink-muted">
                No runs yet.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "brand" | "warning" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "brand"
        ? "text-brand"
        : tone === "warning"
          ? "text-warning"
          : tone === "danger"
            ? "text-danger"
            : "text-ink-strong";
  return (
    <div className="bg-surface-1 px-4 py-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-black tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  action,
  busy,
  primary = false,
  onRun,
}: {
  icon: typeof Search;
  label: string;
  action: Action;
  busy: string | null;
  primary?: boolean;
  onRun: (action: Action) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onRun(action)}
      disabled={Boolean(busy)}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${
        primary
          ? "border-brand bg-brand text-canvas hover:bg-brand-dark"
          : "border-line-strong bg-surface-1 text-ink-strong hover:bg-surface-2"
      }`}
    >
      <Icon className={`h-4 w-4 ${busy === action ? "animate-spin" : ""}`} aria-hidden="true" />
      {busy === action ? "Working..." : label}
    </button>
  );
}

function SmallButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Search;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-1 px-3 py-2 text-xs font-bold text-ink-strong hover:bg-surface-2 disabled:opacity-50"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function labelForAction(action: string): string {
  return action.replaceAll("_", " ");
}

function SequencePreview({ config }: { config: Record<string, unknown> }) {
  const steps = Array.isArray(config.steps) ? config.steps : [];
  if (steps.length === 0) {
    return (
      <p className="border-y border-line-subtle py-4 text-sm text-ink-muted">
        No sequence reference stored for this campaign.
      </p>
    );
  }
  return (
    <div className="grid gap-px overflow-hidden border border-line-subtle bg-line-subtle lg:grid-cols-3">
      {steps.map((rawStep, index) => {
        const step =
          rawStep && typeof rawStep === "object"
            ? (rawStep as Record<string, unknown>)
            : {};
        return (
          <article key={index} className="min-w-0 bg-surface-1 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-brand">
              Email {index + 1} / day {String(step.delayDays ?? 0)}
            </p>
            <h3 className="mt-2 break-words text-sm font-black text-ink-strong">
              {String(step.subject ?? "No subject")}
            </h3>
            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-xs leading-5 text-ink-muted">
              {String(step.body ?? "")}
            </pre>
          </article>
        );
      })}
    </div>
  );
}

function CampaignInput({
  label,
  value,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-ink-muted">
      {label}
      <input
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full min-w-0 rounded-md border border-line-strong bg-surface-1 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-ink-strong"
      />
    </label>
  );
}
