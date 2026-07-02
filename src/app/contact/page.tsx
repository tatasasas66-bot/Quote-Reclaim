import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/payments/disabled-provider";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to reach Quote Reclaim support for billing, account, privacy, and product questions.",
};

export default function ContactPage() {
  return (
    <LegalPage title="Contact" updated="June 9, 2026">
      <p className="text-[15px] leading-7 text-ink">
        Quote Reclaim is a follow-up tool for US home-service contractors.
        It helps organize silent estimates, generate follow-up plans, and
        track recovery activity. Quote Reclaim does not guarantee recovered
        revenue or specific outcomes.
      </p>

      <LegalSection heading="Support">
        <p>
          Quote Reclaim is built and supported by its founder &mdash; support
          email goes to the person who built the product.
        </p>
        <p>
          Email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-brand hover:text-ink-strong"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          for billing, account, refund, cancellation, privacy, and product
          questions. We respond within 1–2 business days.
        </p>
      </LegalSection>

      <LegalSection heading="What to include">
        <p>
          To help us answer faster, include the email address on your
          Quote Reclaim account and a brief description of what you need.
          Please do not send payment-card numbers, full provider receipts,
          or other sensitive personal information — we do not need them to
          start a review.
        </p>
      </LegalSection>

      <LegalSection heading="Related policies">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <a
              href="/terms"
              className="font-semibold text-brand hover:text-ink-strong"
            >
              Terms of Service
            </a>
          </li>
          <li>
            <a
              href="/privacy"
              className="font-semibold text-brand hover:text-ink-strong"
            >
              Privacy Policy
            </a>
          </li>
          <li>
            <a
              href="/refund-policy"
              className="font-semibold text-brand hover:text-ink-strong"
            >
              Refund Policy
            </a>
          </li>
          <li>
            <a
              href="/cancellation-policy"
              className="font-semibold text-brand hover:text-ink-strong"
            >
              Cancellation Policy
            </a>
          </li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
