import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/payments/disabled-provider";

export const metadata: Metadata = {
  title: "Cancellation Policy",
  description:
    "How to cancel a Quote Reclaim subscription, what happens to your access, and how to reach us if you have trouble canceling.",
};

export default function CancellationPolicyPage() {
  return (
    <LegalPage title="Cancellation Policy" updated="June 9, 2026">
      <p className="text-[15px] leading-7 text-ink">
        You can cancel your Quote Reclaim subscription at any time. There
        are no hidden cancellation fees, no minimum terms, and no
        retention scripts to navigate.
      </p>

      <LegalSection heading="1. Canceling stops future billing">
        <p>
          When you cancel, no further monthly charges are made to your
          payment method. Cancellation is recorded by our payment provider
          and applies to all future billing periods.
        </p>
      </LegalSection>

      <LegalSection heading="2. Access during the current period">
        <p>
          Depending on payment provider rules, paid access may continue
          until the end of the current billing period you have already paid
          for. After that date, your account stays — your free-plan access
          to your existing quotes, recovery plans, and recovery receipts
          remains — but new paid features stop.
        </p>
        <p>
          Refunds for the current period are not automatic. See our{" "}
          <a
            href="/refund-policy"
            className="font-semibold text-brand hover:text-ink-strong"
          >
            Refund Policy
          </a>{" "}
          for the case-by-case exceptions we evaluate.
        </p>
      </LegalSection>

      <LegalSection heading="3. How to cancel">
        <p>
          When self-serve cancellation is available, it lives in your
          account settings or in the billing portal of the payment provider
          that processes the subscription. The exact location depends on
          which provider charged you.
        </p>
        <p>
          If you cannot find the cancel button, or if a self-serve flow is
          not working, email us at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Cancel%20subscription`}
            className="font-semibold text-brand hover:text-ink-strong"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          with the email address on your account and we will cancel for you
          and confirm in writing. We do not require a reason to cancel.
        </p>
      </LegalSection>

      <LegalSection heading="4. Reactivating">
        <p>
          You can re-subscribe at any time by signing back in and choosing
          to upgrade again. Your free-plan data is preserved while your
          subscription is inactive, so you do not start from scratch.
        </p>
      </LegalSection>

      <LegalSection heading="5. Contact">
        <p>
          Cancellation questions go to{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-brand hover:text-ink-strong"
          >
            {SUPPORT_EMAIL}
          </a>
          . We respond within 1–2 business days.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
