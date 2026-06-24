"use client";

import * as React from "react";
import { Shield, Upload, Download, Send, Inbox, Ban, BarChart3 } from "lucide-react";
import type {
  LeadRow,
  CampaignRow,
  ReplyRow,
  OverviewStats,
} from "@/lib/auto-marketing/repo";

type Props = {
  stats: OverviewStats;
  leads: LeadRow[];
  campaigns: CampaignRow[];
  replies: ReplyRow[];
  suppressedEmails: string[];
  smartleadConfigured: boolean;
  apifyConfigured: boolean;
  openaiConfigured: boolean;
  adminEnabled: boolean;
};

type Tab = "overview" | "leads" | "campaigns" | "replies" | "suppression";

export function AutoMarketingClient({
  stats,
  leads,
  campaigns,
  replies,
  suppressedEmails,
  smartleadConfigured,
  apifyConfigured,
  openaiConfigured,
  adminEnabled,
}: Props) {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [tradeFilter, setTradeFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<string | null>(null);
  const [pushing, setPushing] = React.useState(false);
  const [pushResult, setPushResult] = React.useState<string | null>(null);
  const [sourcing, setSourcing] = React.useState(false);
  const [sourceResult, setSourceResult] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [autoResult, setAutoResult] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const filteredLeads = React.useMemo(() => {
    return leads.filter((l) => {
      if (tradeFilter && l.trade !== tradeFilter) return false;
      if (statusFilter && l.status !== statusFilter) return false;
      return true;
    });
  }, [leads, tradeFilter, statusFilter]);

  async function handleImportCsv(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/admin/auto-marketing/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(`Imported ${data.imported}, skipped ${data.skipped}.`);
      } else {
        setImportResult(`Error: ${data.error ?? "unknown"}`);
      }
    } catch (err) {
      setImportResult(`Error: ${err instanceof Error ? err.message : "fetch failed"}`);
    } finally {
      setImporting(false);
    }
  }

  async function handlePushToSmartlead() {
    setPushing(true);
    setPushResult(null);
    try {
      const res = await fetch("/api/admin/auto-marketing/smartlead/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.reason === "not_configured") {
        setPushResult("Smartlead not configured. Use CSV export instead.");
      } else {
        setPushResult(`Pushed ${data.pushed}/${data.total}. Failed: ${data.failed}.`);
      }
    } catch (err) {
      setPushResult(`Error: ${err instanceof Error ? err.message : "fetch failed"}`);
    } finally {
      setPushing(false);
    }
  }

  async function handleSourceFromApify() {
    setSourcing(true);
    setSourceResult(null);
    try {
      const res = await fetch("/api/admin/auto-marketing/apify/source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trade: "concrete", city: "Phoenix", maxResults: 50 }),
      });
      const data = await res.json();
      if (data.reason === "not_configured") {
        setSourceResult("Apify not configured. Set APIFY_API_TOKEN in .env.");
      } else if (data.ok) {
        setSourceResult(`Sourced ${data.sourced}. Imported ${data.imported}, skipped ${data.skipped}.`);
      } else {
        setSourceResult(`Error: ${data.error ?? "unknown"}`);
      }
    } catch (err) {
      setSourceResult(`Error: ${err instanceof Error ? err.message : "fetch failed"}`);
    } finally {
      setSourcing(false);
    }
  }

  async function handleRunPipeline(dryRun = false) {
    setRunning(true);
    setAutoResult(null);
    try {
      const res = await fetch("/api/admin/auto-marketing/run-auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaign: "concrete_driveway_v1", dryRun }),
      });
      const data = await res.json();
      if (data.dry_run) {
        setAutoResult(
          `DRY RUN: ${data.safe_leads} safe leads, ${data.capped_leads} to send (cap: ${data.daily_cap}, sent today: ${data.todays_sends}). ` +
          `${data.suppressed_excluded} suppressed. Smartlead: ${data.smartlead}.`
        );
      } else if (data.smartlead === "not_configured") {
        setAutoResult(`Ready: ${data.approved_leads} approved leads. Smartlead not configured — export CSV: ${data.export_url}`);
      } else if (data.ok) {
        setAutoResult(`Complete: ${data.approved_leads} approved, pushed ${data.pushed} to Smartlead, failed ${data.failed}. Daily cap: ${data.daily_cap}, sent today: ${data.todays_sends}.`);
      } else if (data.reason === "campaign_not_active") {
        setAutoResult(`Campaign is ${data.status}. Use Start/Resume to activate.`);
      } else {
        setAutoResult(`Error: ${data.error ?? "unknown"}`);
      }
    } catch (err) {
      setAutoResult(`Error: ${err instanceof Error ? err.message : "fetch failed"}`);
    } finally {
      setRunning(false);
    }
  }

  async function handleCampaignAction(action: "start" | "pause" | "resume" | "stop") {
    setRunning(true);
    setAutoResult(null);
    try {
      const res = await fetch("/api/admin/auto-marketing/run-auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.ok) {
        setAutoResult(`Campaign ${data.action} → ${data.new_status}`);
      } else {
        setAutoResult(`Error: ${data.error ?? "unknown"}`);
      }
    } catch (err) {
      setAutoResult(`Error: ${err instanceof Error ? err.message : "fetch failed"}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line-subtle pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Internal Admin
            </p>
            <h1 className="mt-1 text-2xl font-black text-ink-strong sm:text-3xl">
              Full Auto Marketing
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge ok={adminEnabled} label={adminEnabled ? "Admin guard ON" : "Admin guard OFF"} />
            <Badge ok={smartleadConfigured} label={smartleadConfigured ? "Smartlead ON" : "Smartlead OFF"} />
            <Badge ok={apifyConfigured} label={apifyConfigured ? "Apify ON" : "Apify OFF"} />
            <Badge ok={openaiConfigured} label={openaiConfigured ? "OpenAI ON" : "OpenAI OFF"} />
          </div>
        </header>

        {!adminEnabled ? (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-ink">
            <strong>Admin guard is OFF.</strong> Set <code className="rounded bg-surface-2 px-1">ADMIN_USER_IDS</code> in env to enable this feature. Until then, all admin routes return 403.
          </div>
        ) : null}

        {/* Action bar */}
        <div className="mb-6 flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportCsv(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface-1 px-4 py-2 text-sm font-semibold text-ink-strong transition hover:bg-surface-2 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {importing ? "Importing..." : "Import CSV"}
          </button>
          <a
            href="/api/admin/auto-marketing/export-approved"
            className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface-1 px-4 py-2 text-sm font-semibold text-ink-strong transition hover:bg-surface-2"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export Approved
          </a>
          <button
            type="button"
            onClick={handlePushToSmartlead}
            disabled={pushing}
            className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface-1 px-4 py-2 text-sm font-semibold text-ink-strong transition hover:bg-surface-2 disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {pushing ? "Pushing..." : "Push to Smartlead"}
          </button>
          <button
            type="button"
            onClick={handleSourceFromApify}
            disabled={sourcing}
            className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface-1 px-4 py-2 text-sm font-semibold text-ink-strong transition hover:bg-surface-2 disabled:opacity-50"
          >
            <Shield className="h-4 w-4" aria-hidden="true" />
            {sourcing ? "Sourcing..." : "Source from Apify"}
          </button>
          <button
            type="button"
            onClick={() => handleRunPipeline(true)}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface-1 px-4 py-2 text-sm font-semibold text-ink-strong transition hover:bg-surface-2 disabled:opacity-50"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            {running ? "Running..." : "Dry Run"}
          </button>
          <button
            type="button"
            onClick={() => handleRunPipeline(false)}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg border border-brand bg-brand px-4 py-2 text-sm font-semibold text-canvas transition hover:bg-brand-dark disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {running ? "Running..." : "Run Full Auto"}
          </button>
          <div className="flex items-center gap-1 border-l border-line-subtle pl-2">
            <button type="button" onClick={() => handleCampaignAction("start")} disabled={running} className="rounded px-2 py-1 text-xs font-bold text-success hover:bg-success/10">Start</button>
            <button type="button" onClick={() => handleCampaignAction("pause")} disabled={running} className="rounded px-2 py-1 text-xs font-bold text-warning hover:bg-warning/10">Pause</button>
            <button type="button" onClick={() => handleCampaignAction("stop")} disabled={running} className="rounded px-2 py-1 text-xs font-bold text-danger hover:bg-danger/10">Stop</button>
          </div>
        </div>

        {importResult ? (
          <p className="mb-4 text-sm text-ink-muted">{importResult}</p>
        ) : null}
        {pushResult ? (
          <p className="mb-4 text-sm text-ink-muted">{pushResult}</p>
        ) : null}
        {sourceResult ? (
          <p className="mb-4 text-sm text-ink-muted">{sourceResult}</p>
        ) : null}
        {autoResult ? (
          <p className="mb-4 text-sm text-ink-muted">{autoResult}</p>
        ) : null}

        {/* Tabs */}
        <nav className="mb-6 flex flex-wrap gap-1 border-b border-line-subtle">
          {([
            ["overview", "Overview", BarChart3],
            ["leads", "Leads", Shield],
            ["campaigns", "Campaigns", Send],
            ["replies", "Replies", Inbox],
            ["suppression", "Suppression", Ban],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition ${
                tab === id
                  ? "border-brand text-brand"
                  : "border-transparent text-ink-muted hover:text-ink-strong"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        {tab === "overview" ? <OverviewTab stats={stats} /> : null}
        {tab === "leads" ? (
          <LeadsTab
            leads={filteredLeads}
            tradeFilter={tradeFilter}
            setTradeFilter={setTradeFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />
        ) : null}
        {tab === "campaigns" ? <CampaignsTab campaigns={campaigns} /> : null}
        {tab === "replies" ? <RepliesTab replies={replies} /> : null}
        {tab === "suppression" ? <SuppressionTab emails={suppressedEmails} /> : null}
      </div>
    </main>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-bold uppercase tracking-wider ${
        ok
          ? "border-success/40 bg-success/10 text-success"
          : "border-line-subtle bg-surface-2 text-ink-muted"
      }`}
    >
      {label}
    </span>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "brand" | "success" | "money" }) {
  const toneClass =
    tone === "brand" ? "text-brand" : tone === "success" ? "text-success" : tone === "money" ? "text-money" : "text-ink-strong";
  return (
    <div className="rounded-xl border border-line-subtle bg-surface-1 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">{label}</p>
      <p className={`mt-2 text-2xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function OverviewTab({ stats }: { stats: OverviewStats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total Leads" value={stats.total_leads} />
        <StatCard label="Approved" value={stats.approved_leads} tone="success" />
        <StatCard label="Suppressed" value={stats.suppressed_leads} tone="brand" />
        <StatCard label="Emails Sent" value={stats.emails_sent} />
        <StatCard label="Replies" value={stats.replies} />
        <StatCard label="Positive Replies" value={stats.positive_replies} tone="success" />
        <StatCard label="Audit Visits" value={stats.audit_visits} />
        <StatCard label="Audit Completions" value={stats.audit_completions} />
        <StatCard label="Signups" value={stats.signups} />
        <StatCard label="Checkout Started" value={stats.checkout_started} />
        <StatCard label="Paid Customers" value={stats.paid_customers} tone="money" />
        <StatCard label="Best Trade" value={stats.best_trade ?? "—"} tone="brand" />
      </div>

      <div className="rounded-xl border border-line-subtle bg-surface-1 p-4">
        <p className="text-xs font-black uppercase tracking-widest text-ink-muted">Funnel</p>
        <div className="mt-3 space-y-2 text-sm">
          <FunnelRow label="Leads → Approved" value={stats.approved_leads} total={stats.total_leads} />
          <FunnelRow label="Approved → Emails Sent" value={stats.emails_sent} total={stats.approved_leads} />
          <FunnelRow label="Emails → Replies" value={stats.replies} total={stats.emails_sent} />
          <FunnelRow label="Replies → Positive" value={stats.positive_replies} total={stats.replies} />
          <FunnelRow label="Audit Visits → Completions" value={stats.audit_completions} total={stats.audit_visits} />
          <FunnelRow label="Completions → Signups" value={stats.signups} total={stats.audit_completions} />
          <FunnelRow label="Signups → Paid" value={stats.paid_customers} total={stats.signups} />
        </div>
      </div>
    </div>
  );
}

function FunnelRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold text-ink-strong">
        {value} / {total} ({pct}%)
      </span>
    </div>
  );
}

function LeadsTab({
  leads,
  tradeFilter,
  setTradeFilter,
  statusFilter,
  setStatusFilter,
}: {
  leads: LeadRow[];
  tradeFilter: string;
  setTradeFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
          className="rounded-lg border border-line-subtle bg-surface-1 px-3 py-2 text-sm text-ink-strong"
        >
          <option value="">All trades</option>
          <option value="concrete">Concrete</option>
          <option value="fencing">Fencing</option>
          <option value="painting">Painting</option>
          <option value="hvac">HVAC</option>
          <option value="roofing">Roofing</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-line-subtle bg-surface-1 px-3 py-2 text-sm text-ink-strong"
        >
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="review">Review</option>
          <option value="rejected">Rejected</option>
          <option value="suppressed">Suppressed</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line-subtle">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Trade</th>
              <th className="px-3 py-2">City</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ink-muted">
                  No leads yet. Import a CSV to get started.
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id} className="border-t border-line-subtle">
                  <td className="px-3 py-2 font-semibold text-ink-strong">{l.company}</td>
                  <td className="px-3 py-2 text-ink">{l.trade}</td>
                  <td className="px-3 py-2 text-ink">{l.city ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-muted">{l.email ?? "—"}</td>
                  <td className="px-3 py-2 font-bold text-ink-strong">{l.score}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        l.status === "approved"
                          ? "border-success/40 bg-success/10 text-success"
                          : l.status === "review"
                            ? "border-warning/40 bg-warning/10 text-warning"
                            : l.status === "suppressed"
                              ? "border-danger/40 bg-danger/10 text-danger"
                              : "border-line-subtle bg-surface-2 text-ink-muted"
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignsTab({ campaigns }: { campaigns: CampaignRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line-subtle">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-muted">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Trade</th>
            <th className="px-3 py-2">Subject</th>
            <th className="px-3 py-2">Variant</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                No campaigns yet. The default campaign is created on page load.
              </td>
            </tr>
          ) : (
            campaigns.map((c) => (
              <tr key={c.id} className="border-t border-line-subtle">
                <td className="px-3 py-2 font-semibold text-ink-strong">{c.name}</td>
                <td className="px-3 py-2 text-ink">{c.trade}</td>
                <td className="px-3 py-2 text-ink-muted">{c.subject}</td>
                <td className="px-3 py-2 text-ink">{c.email_variant}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full border border-line-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                    {c.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function RepliesTab({ replies }: { replies: ReplyRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line-subtle">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-muted">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Classification</th>
            <th className="px-3 py-2">Reply</th>
            <th className="px-3 py-2">Draft</th>
          </tr>
        </thead>
        <tbody>
          {replies.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                No replies yet. Replies arrive via the reply-webhook endpoint.
              </td>
            </tr>
          ) : (
            replies.map((r) => (
              <tr key={r.id} className="border-t border-line-subtle align-top">
                <td className="px-3 py-2 text-ink-muted">
                  {new Date(r.reply_date).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 text-ink">{r.email ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      r.classification === "unsubscribe" || r.classification === "angry" || r.classification === "not_interested"
                        ? "border-danger/40 bg-danger/10 text-danger"
                        : r.classification === "interested"
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-line-subtle bg-surface-2 text-ink-muted"
                    }`}
                  >
                    {r.classification}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink-muted max-w-xs">
                  <div className="truncate">{r.reply_body ?? "—"}</div>
                </td>
                <td className="px-3 py-2 text-ink-muted max-w-xs">
                  {r.draft_reply ? (
                    <div className="truncate italic">{r.draft_reply}</div>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SuppressionTab({ emails }: { emails: string[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-danger/40 bg-danger/5 p-4">
        <p className="text-sm text-ink">
          <strong>Permanent DNC list.</strong> These emails will never be emailed again.
          Suppression is append-only — entries are never removed.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line-subtle">
        <table className="w-full min-w-[400px] text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-2">Email</th>
            </tr>
          </thead>
          <tbody>
            {emails.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-ink-muted">
                  No suppressed emails yet.
                </td>
              </tr>
            ) : (
              emails.map((e) => (
                <tr key={e} className="border-t border-line-subtle">
                  <td className="px-3 py-2 text-ink">{e}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
