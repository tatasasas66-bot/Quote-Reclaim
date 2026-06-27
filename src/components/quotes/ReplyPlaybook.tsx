"use client";

import * as React from "react";
import { Banknote, Scale } from "lucide-react";
import type { RecoveryPlanReplyPath } from "@/lib/recovery/recovery-plan-view-model";
import {
  buildScopeComparisonMessage,
  buildPaymentPlanMessage,
  getScopeComparisonItems,
} from "@/lib/recovery/recovery-logic";
import { CopyButton } from "./CopyButton";
import { ManualMessageActions } from "./ManualMessageActions";
import { recordQuoteAuditAction } from "@/app/(app)/quotes/[id]/reply-playbook-actions";

type ReplyPlaybookProps = {
  paths: RecoveryPlanReplyPath[];
  trade: string;
  quoteId?: string;
};

export function ReplyPlaybook({ paths, trade, quoteId }: ReplyPlaybookProps) {
  const [showMarginProtector, setShowMarginProtector] = React.useState(false);
  const [showPaymentPlan, setShowPaymentPlan] = React.useState(false);

  return (
    <div
      data-testid="reply-rescue-paths"
      className="mt-4 rounded-lg border border-brand/25 bg-brand/5 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-widest text-brand">
          Reply playbook
        </p>
        <p className="text-xs font-semibold text-ink-muted">
          {paths.length} next replies ready
        </p>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-muted">
        Use the reply that matches what they say. No guessing, no starting
        over.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {paths.map((path) => (
          <div
            key={path.id}
            className="flex min-h-full flex-col rounded-md border border-line-subtle bg-canvas/45 p-3"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
              {path.trigger}
            </p>
            <p className="mt-1 text-sm font-bold text-ink">{path.label}</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              {path.response}
            </p>
            {path.whyThisWorks ? (
              <p className="mt-2 text-xs leading-5 text-ink-muted">
                <span className="font-bold text-ink">Why this works:</span>{" "}
                {path.whyThisWorks}
              </p>
            ) : null}
            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              <CopyButton
                text={path.response}
                label="Copy reply"
                onCopied={() => {
                  if (path.id === "still_comparing") {
                    setShowMarginProtector(true);
                  }
                  if (path.id === "financing") {
                    setShowPaymentPlan(true);
                  }
                }}
              />
              {path.id === "still_comparing" ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowMarginProtector((current) => !current);
                    if (quoteId) {
                      void recordQuoteAuditAction({
                        quoteId,
                        type: "scope_comparison_sent",
                      });
                    }
                  }}
                  aria-expanded={showMarginProtector}
                  className="inline-flex min-h-9 items-center gap-2 rounded-md border border-money/40 bg-money/10 px-3 py-1.5 text-xs font-bold text-money focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <Scale className="h-4 w-4" aria-hidden="true" />
                  Send scope comparison
                </button>
              ) : null}
              {path.id === "financing" ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentPlan((current) => !current);
                    if (quoteId) {
                      void recordQuoteAuditAction({
                        quoteId,
                        type: "payment_plan_sent",
                      });
                    }
                  }}
                  aria-expanded={showPaymentPlan}
                  className="inline-flex min-h-9 items-center gap-2 rounded-md border border-money/40 bg-money/10 px-3 py-1.5 text-xs font-bold text-money focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <Banknote className="h-4 w-4" aria-hidden="true" />
                  Send payment plan template →
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {showMarginProtector ? <MarginProtector trade={trade} /> : null}
      {showPaymentPlan ? <PaymentPlanTemplate trade={trade} /> : null}
    </div>
  );
}

function PaymentPlanTemplate({ trade }: { trade: string }) {
  const [message, setMessage] = React.useState(() =>
    buildPaymentPlanMessage(trade),
  );

  return (
    <section
      data-testid="payment-plan-template"
      aria-labelledby="payment-plan-title"
      className="mt-4 border-t border-money/30 pt-4"
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-money">
        Payment plan
      </p>
      <h4
        id="payment-plan-title"
        className="mt-1 text-base font-black text-ink-strong"
      >
        Split the timing without discounting the work.
      </h4>
      <label
        htmlFor="payment-plan-message"
        className="mt-4 block text-xs font-bold text-ink-strong"
      >
        Edit before sending
      </label>
      <textarea
        id="payment-plan-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={5}
        className="mt-2 w-full rounded-md border border-line-subtle bg-canvas p-3 text-sm leading-6 text-ink-strong focus:border-money focus:outline-none focus:ring-2 focus-visible:ring-focus"
      />
      <div className="mt-3">
        <CopyButton text={message} label="Copy payment plan" />
      </div>
      <ManualMessageActions
        message={message}
        source="payment_plan"
        className="mt-3"
      />
    </section>
  );
}

function MarginProtector({ trade }: { trade: string }) {
  const scopeItems = getScopeComparisonItems(trade);
  const [message, setMessage] = React.useState(() =>
    buildScopeComparisonMessage(trade),
  );

  return (
    <section
      data-testid="margin-protector"
      aria-labelledby="margin-protector-title"
      className="mt-4 border-t border-money/30 pt-4"
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-money">
        Margin Protector
      </p>
      <h4
        id="margin-protector-title"
        className="mt-1 text-base font-black text-ink-strong"
      >
        Make the scope difference visible before cutting price.
      </h4>
      <ul className="mt-3 flex flex-wrap gap-2">
        {scopeItems.map((item) => (
          <li
            key={item}
            className="rounded-full border border-line-subtle bg-canvas/55 px-3 py-1 text-xs font-semibold text-ink"
          >
            {item}
          </li>
        ))}
      </ul>
      <label
        htmlFor="margin-protector-message"
        className="mt-4 block text-xs font-bold text-ink-strong"
      >
        Edit before sending
      </label>
      <textarea
        id="margin-protector-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={6}
        className="mt-2 w-full rounded-md border border-line-subtle bg-canvas p-3 text-sm leading-6 text-ink-strong focus:border-money focus:outline-none focus:ring-2 focus:ring-focus"
      />
      <div className="mt-3">
        <CopyButton text={message} label="Copy comparison" />
      </div>
      <ManualMessageActions
        message={message}
        source="margin_protector"
        className="mt-3"
      />
    </section>
  );
}
