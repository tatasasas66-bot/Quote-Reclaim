import type { Metadata } from "next";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  resolveOneTapLink,
  listActiveReplyOptions,
} from "@/lib/quotes/one-tap-reply-server";
import { canRenderReplyPage } from "@/lib/quotes/one-tap-reply";
import { projectLabel } from "@/lib/ai/fallback-messages";
import { titleCaseName } from "@/lib/utils/title-case";
import { formatCurrency } from "@/lib/utils/currency";
import { ReplyForm } from "./ReplyForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Quick reply",
  robots: { index: false, follow: false },
};

type PageParams = { params: Promise<{ token: string }> };

/**
 * Public reply page — no auth required, no account creation, no payment.
 * Reads via the service client so an unauthenticated homeowner can still
 * resolve their token. Every failure mode (bad token, expired link, won
 * quote, opted-out customer, revoked link) renders the SAME "this link
 * isn't available" page so we never leak which gate tripped.
 */
export default async function PublicReplyPage({ params }: PageParams) {
  const { token } = await params;
  const supabase = createServiceSupabaseClient();

  const link = await resolveOneTapLink(supabase, token);
  if (!link) return <Unavailable />;

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, user_id, sequence_id, client_name, trade, estimate_amount, outcome, client_opted_out",
    )
    .eq("id", link.quoteId)
    .maybeSingle();
  if (!quote) return <Unavailable />;

  const ok = canRenderReplyPage(
    {
      outcome: (quote.outcome ?? "pending") as "pending" | "won" | "closed",
      client_opted_out: quote.client_opted_out,
    },
    { revoked_at: link.revokedAt, expires_at: link.expiresAt },
  );
  if (!ok) return <Unavailable />;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", quote.user_id)
    .maybeSingle();
  const contractorFirstName = pickContractorName(profile?.email);

  const options = await listActiveReplyOptions(supabase, String(quote.id));

  // Minimal estimate summary. Deliberately does NOT include the homeowner's
  // own contact info, location, job description, or any internal IDs.
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <header className="text-center">
          <p className="text-xs font-black uppercase tracking-widest text-brand">
            Quote Reclaim
          </p>
          <h1 className="mt-4 text-balance text-3xl font-black leading-tight text-ink-strong">
            Quick update on your estimate
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Choose what fits best. This helps us know the right next step.
          </p>
        </header>

        <section
          aria-label="Estimate summary"
          className="mt-6 rounded-lg border border-line-subtle bg-surface-1 p-5"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Estimate
          </p>
          <p className="mt-2 text-lg font-bold leading-7 text-ink-strong">
            {projectLabel(quote.trade)}
          </p>
          <p className="mt-1 text-3xl font-black tabular-nums text-ink-strong">
            {formatCurrency(Number(quote.estimate_amount ?? 0))}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Sent by {contractorFirstName}
          </p>
        </section>

        <ReplyForm
          token={token}
          contractorFirstName={contractorFirstName}
          options={options}
        />
      </div>
    </main>
  );
}

function pickContractorName(email: string | null | undefined): string {
  if (!email) return "your contractor";
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._\-+]+/g, " ").trim();
  if (!cleaned) return "your contractor";
  return titleCaseName(cleaned).split(/\s+/)[0] || "your contractor";
}

function Unavailable() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-12">
      <div className="mx-auto w-full max-w-md text-center">
        <p className="text-xs font-black uppercase tracking-widest text-brand">
          Quote Reclaim
        </p>
        <h1 className="mt-4 text-2xl font-black text-ink-strong">
          This link isn&apos;t available anymore.
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          The estimate may have already been completed or closed. If you still
          want to reply, just reply to the contractor&apos;s email directly.
        </p>
      </div>
    </main>
  );
}
