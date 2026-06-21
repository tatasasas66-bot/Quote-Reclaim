import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/payments/disabled-provider";
import { PAYWALL_PRICE_LABEL } from "@/lib/payments/entitlement";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "How Quote Reclaim handles refund requests for monthly subscriptions, including the case-by-case exceptions we evaluate.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund Policy" updated="June 9, 2026">
      <p className="text-[15px] leading-7 text-ink">
        Quote Reclaim is a subscription software product for US home-service
        contractors. This policy explains how refunds work, when we can issue
        one, and how to request one. Quote Reclaim does not guarantee any
        recovered revenue, closed jobs, or homeowner replies — results depend
        on factors outside our control.
      </p>

      <LegalSection heading="1. What you are paying for">
        <p>
          A Quote Reclaim subscription is access to a digital software service
          that organizes silent estimates, generates follow-up plans, and
          tracks recovery activity. The standard price is{" "}
          {PAYWALL_PRICE_LABEL} unless a different price is shown to you at
          checkout.
        </p>
      </LegalSection>

      <LegalSection heading="2. General policy">
        <p>
          Subscription payments are generally non-refundable once we have
          provided access for the billing period. This is because Quote
          Reclaim is a digital service that begins delivering value the
          moment you can sign in and use it.
        </p>
        <p>
          Canceling your subscription stops future billing. We do not charge
          cancellation fees. See our{" "}
          <a
            href="/cancellation-policy"
            className="font-semibold text-brand hover:text-ink-strong"
          >
            Cancellation Policy
          </a>{" "}
          for the details.
        </p>
      </LegalSection>

      <LegalSection heading="3. Case-by-case exceptions">
        <p>
          We review the following situations on a case-by-case basis and may
          issue a partial or full refund where appropriate:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-semibold text-ink-strong">
              Duplicate charges.
            </span>{" "}
            If you were charged twice for the same billing period.
          </li>
          <li>
            <span className="font-semibold text-ink-strong">
              Billing errors.
            </span>{" "}
            If our records show an incorrect amount was charged.
          </li>
          <li>
            <span className="font-semibold text-ink-strong">
              Technical access issues.
            </span>{" "}
            If a service-side problem we have confirmed prevented you from
            using the product for a meaningful portion of a paid billing
            period.
          </li>
          <li>
            <span className="font-semibold text-ink-strong">
              Immediate accidental purchase.
            </span>{" "}
            If you contact us shortly after the charge and the account has
            had little to no usage.
          </li>
        </ul>
        <p>
          Refunds outside these situations are at our discretion. Any refund
          we issue is processed through the same payment provider that
          handled the original charge.
        </p>
      </LegalSection>

      <LegalSection heading="4. How to request a refund">
        <p>
          Send an email to{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Refund%20request`}
            className="font-semibold text-brand hover:text-ink-strong"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          with:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>the email address on your Quote Reclaim account;</li>
          <li>the approximate date and amount of the charge;</li>
          <li>a brief description of why you are requesting a refund.</li>
        </ul>
        <p>
          We respond within 1–2 business days. We do not need card numbers,
          provider receipts, or any sensitive personal information to start a
          review.
        </p>
      </LegalSection>

      <LegalSection heading="5. What we do not promise">
        <p>
          Quote Reclaim helps you follow up more consistently. We do not
          promise or guarantee that any estimate will be won, that any
          revenue will be recovered, or that recipients will reply. A refund
          is not available solely because results did not match an
          expectation that the product would close jobs on your behalf.
        </p>
      </LegalSection>

      <LegalSection heading="6. Contact">
        <p>
          Questions about this policy? Email us at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-brand hover:text-ink-strong"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
