"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ClipboardCheck, Route, Search } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { CopyButton } from "@/components/quotes/CopyButton";
import {
  matchCrewGap,
  type CrewGapInput,
  type CrewGapMatchResult,
  type CrewGapQuote,
  type CrewGapCandidate,
} from "@/lib/crew-gap/match";
import { bucketCurrency } from "@/lib/analytics/privacy";
import { track } from "@/lib/analytics/track";
import { PAYWALL_PRICE_LABEL } from "@/lib/payments/entitlement";
import { tradeLocationLine } from "@/lib/quotes/quote-display";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

type Props = {
  quotes: CrewGapQuote[];
  isPaid: boolean;
  freeRemaining: number;
};

type FormState = {
  openDate: string;
  crewSize: string;
  jobTypeWanted: string;
  minimumJobValue: string;
  driveRadiusMiles: string;
  note: string;
};

const DEFAULT_FORM: FormState = {
  openDate: "",
  crewSize: "2",
  jobTypeWanted: "",
  minimumJobValue: "1500",
  driveRadiusMiles: "20",
  note: "",
};

export function CrewGapClient({ quotes, isPaid, freeRemaining }: Props) {
  const [form, setForm] = React.useState<FormState>(DEFAULT_FORM);
  const [result, setResult] = React.useState<CrewGapMatchResult | null>(null);
  const [messageText, setMessageText] = React.useState("");
  const resultRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    track("crew_gap_page_viewed", {
      quote_count: quotes.length,
      has_quotes: quotes.length > 0,
    });
  }, [quotes.length]);

  const canRun = quotes.length > 0;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function parseInput(): CrewGapInput {
    return {
      openDate: form.openDate,
      crewSize: parsePositiveNumber(form.crewSize, 1),
      jobTypeWanted: form.jobTypeWanted.trim(),
      minimumJobValue: parsePositiveNumber(form.minimumJobValue, 0),
      driveRadiusMiles: parsePositiveNumber(form.driveRadiusMiles, 0),
      note: form.note.trim(),
    };
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRun) return;

    const input = parseInput();
    track("crew_gap_started", {
      quote_count: quotes.length,
      has_open_date: Boolean(input.openDate),
      minimum_job_value_bucket: bucketCurrency(input.minimumJobValue),
    });

    const next = matchCrewGap(quotes, input);
    setResult(next);
    setMessageText(next.recommendedMessage);

    track("crew_gap_completed", {
      quote_count: quotes.length,
      candidate_count: next.rankedCandidates.length,
      has_fit: Boolean(next.recommendation),
      best_quote_value_bucket: bucketCurrency(
        next.recommendation?.quote.estimate_amount ?? 0,
      ),
      minimum_job_value_bucket: bucketCurrency(input.minimumJobValue),
      recovery_window: next.recommendation?.window ?? "none",
      urgency_band: next.urgencyBand,
    });

    window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <section className="rounded-lg border border-line-subtle bg-surface-1 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-brand">
              Crew Gap Rescue
            </p>
            <h2 className="mt-1 text-xl font-black text-ink-strong">
              Tell Quote Reclaim what slot you need to fill.
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              This is not scheduling software. It only uses the quiet quotes in
              your queue to find the safest recovery opportunity for an open
              crew day.
            </p>
          </div>
        </div>

        {canRun ? null : (
          <div className="mt-5 rounded-lg border border-dashed border-line-subtle bg-surface-2 p-4 text-sm leading-6 text-ink-muted">
            Add or import quiet quotes first. Crew Gap Rescue needs real old
            estimates before it can recommend a recovery target.
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href="/quotes/new">
                <Button size="sm">+ Add Silent Quote</Button>
              </Link>
              <Link
                href="/quotes/import"
                className="inline-flex h-9 items-center rounded text-sm font-semibold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Paste quotes instead
              </Link>
            </div>
          </div>
        )}

        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          <Input
            label="Open date"
            type="date"
            required
            value={form.openDate}
            onChange={(event) => update("openDate", event.target.value)}
            hint="Only mention this open slot if it is real."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Crew size"
              type="number"
              min={1}
              step={1}
              value={form.crewSize}
              onChange={(event) => update("crewSize", event.target.value)}
            />
            <Input
              label="Drive radius"
              type="number"
              min={0}
              step={5}
              value={form.driveRadiusMiles}
              onChange={(event) => update("driveRadiusMiles", event.target.value)}
              hint="Miles you are willing to drive."
            />
          </div>
          <Input
            label="Job type wanted"
            placeholder="Any, roofing, remodel, flooring, cleaning..."
            value={form.jobTypeWanted}
            onChange={(event) => update("jobTypeWanted", event.target.value)}
            hint="Leave blank if any quoted job could fill the crew day."
          />
          <Input
            label="Minimum job value"
            type="number"
            min={0}
            step={100}
            value={form.minimumJobValue}
            onChange={(event) => update("minimumJobValue", event.target.value)}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Optional note
            <textarea
              value={form.note}
              onChange={(event) => update("note", event.target.value)}
              maxLength={240}
              rows={3}
              placeholder="Example: small crew available, indoor work preferred"
              className="rounded-lg border border-line-subtle bg-surface-2 px-3 py-2 text-base text-ink-strong placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
            />
          </label>

          <div className="rounded-lg border border-line-subtle bg-surface-2 p-3 text-xs leading-5 text-ink-muted">
            First 3 quotes free. No card. Then {PAYWALL_PRICE_LABEL} to turn
            silent quotes into booked crew days.
          </div>

          <Button type="submit" fullWidth disabled={!canRun}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Find the quote most likely to fill it
          </Button>
        </form>
      </section>

      <section
        ref={resultRef}
        className="min-h-[28rem] rounded-lg border border-line-subtle bg-surface-1 p-5 shadow-sm"
        aria-live="polite"
      >
        {!result ? (
          <EmptyResult quotesCount={quotes.length} isPaid={isPaid} freeRemaining={freeRemaining} />
        ) : result.recommendation ? (
          <ResultPanel
            result={result}
            messageText={messageText}
            setMessageText={setMessageText}
          />
        ) : (
          <NoFitPanel result={result} />
        )}
      </section>
    </div>
  );
}

function EmptyResult({
  quotesCount,
  isPaid,
  freeRemaining,
}: {
  quotesCount: number;
  isPaid: boolean;
  freeRemaining: number;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-money/10 text-money">
        <Route className="h-6 w-6" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-ink-muted">
          Waiting for crew gap details
        </p>
        <h2 className="mt-2 text-2xl font-black leading-tight text-ink-strong">
          The result will pick one quote, explain why, and give you the message
          to send.
        </h2>
      </div>
      <ul className="grid gap-2 text-sm leading-6 text-ink-muted">
        <li>Quotes in queue: {quotesCount}</li>
        <li>
          Plan:{" "}
          {isPaid
            ? "Pro active"
            : freeRemaining > 0
              ? `${freeRemaining} free quote${freeRemaining === 1 ? "" : "s"} left`
              : "Free limit reached"}
        </li>
        <li>No customer names, exact values, or notes are sent to analytics.</li>
      </ul>
    </div>
  );
}

function ResultPanel({
  result,
  messageText,
  setMessageText,
}: {
  result: CrewGapMatchResult;
  messageText: string;
  setMessageText: (value: string) => void;
}) {
  const best = result.recommendation;
  if (!best) return null;

  return (
    <div data-testid="crew-gap-result" className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-success">
            Best quote to revive for this open slot
          </p>
          <h2 className="mt-1 text-2xl font-black leading-tight text-ink-strong">
            Quote #{best.sourceNumber}: {best.quote.client_name}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {formatCurrency(best.quote.estimate_amount)} ·{" "}
            {tradeLocationLine(best.quote.trade, best.quote.city, best.quote.state)} ·{" "}
            {best.daysSilent} days silent · {best.windowLabel}
          </p>
        </div>
      </div>

      <ReasonList candidate={best} />

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-ink-muted">
            Message to send
          </h3>
          <CopyButton text={messageText} label="Copy message" />
        </div>
        <textarea
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          rows={6}
          className="w-full rounded-lg border border-line-subtle bg-surface-2 px-3 py-3 text-sm leading-6 text-ink-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
        />
      </div>

      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-ink-muted">
          Next 3 moves
        </h3>
        <ol className="mt-3 grid gap-2 text-sm leading-6 text-ink">
          {result.nextThreeMoves.map((move, index) => (
            <li key={move} className="flex gap-3">
              <span className="font-black text-brand">{index + 1}.</span>
              <span>{move}</span>
            </li>
          ))}
        </ol>
      </div>

      <BackupQuotes backups={result.backupQuotes} />
    </div>
  );
}

function NoFitPanel({ result }: { result: CrewGapMatchResult }) {
  return (
    <div data-testid="crew-gap-no-fit" className="space-y-5">
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
        <p className="text-xs font-black uppercase tracking-widest text-warning">
          No clean fit yet
        </p>
        <h2 className="mt-2 text-2xl font-black text-ink-strong">
          Do not force an open-slot message.
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink">
          {result.warning}
        </p>
      </div>
      <BackupQuotes backups={result.backupQuotes} title="Closest backup quotes" />
      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-ink-muted">
          Next 3 moves
        </h3>
        <ol className="mt-3 grid gap-2 text-sm leading-6 text-ink">
          {result.nextThreeMoves.map((move, index) => (
            <li key={move} className="flex gap-3">
              <span className="font-black text-brand">{index + 1}.</span>
              <span>{move}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ReasonList({ candidate }: { candidate: CrewGapCandidate }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface-2 p-4">
      <h3 className="text-sm font-black uppercase tracking-widest text-ink-muted">
        Why this quote
      </h3>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-ink">
        {candidate.reasons.map((reason) => (
          <li key={reason} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BackupQuotes({
  backups,
  title = "Backup quotes",
}: {
  backups: CrewGapCandidate[];
  title?: string;
}) {
  if (backups.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-black uppercase tracking-widest text-ink-muted">
        {title}
      </h3>
      <ul className="mt-3 grid gap-3">
        {backups.map((candidate) => (
          <li
            key={candidate.quote.id}
            className={cn(
              "rounded-lg border bg-surface-2 p-3 text-sm",
              candidate.goodFit ? "border-line-subtle" : "border-line-subtle/70",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink-strong">
                  Quote #{candidate.sourceNumber}: {candidate.quote.client_name}
                </p>
                <p className="mt-1 text-ink-muted">
                  {formatCurrency(candidate.quote.estimate_amount)} ·{" "}
                  {tradeLocationLine(
                    candidate.quote.trade,
                    candidate.quote.city,
                    candidate.quote.state,
                  )}
                </p>
              </div>
              <span className="rounded-full border border-line-subtle px-2 py-1 text-xs font-bold text-ink-muted">
                {candidate.windowLabel}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function parsePositiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}
