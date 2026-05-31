import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of Quote Reclaim, including subscription, acceptable use, and liability.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="May 31, 2026">
      <p className="text-[15px] leading-7 text-ink">
        These Terms of Service (&quot;Terms&quot;) govern your access to and use
        of Quote Reclaim (&quot;Quote Reclaim,&quot; &quot;we,&quot;
        &quot;us,&quot; or &quot;our&quot;). By creating an account or using the
        service, you agree to these Terms. If you do not agree, do not use the
        service.
      </p>

      <LegalSection heading="1. What Quote Reclaim does">
        <p>
          Quote Reclaim is a tool for US home-service contractors. It helps you
          follow up on quiet estimates — quotes you have already sent that have
          not received a reply — by organizing them into a recovery queue and
          sending automated follow-up emails on your behalf. The service also
          helps you track which estimates were won or closed.
        </p>
        <p>
          Quote Reclaim is a follow-up tool. It is not a CRM, a lead source, or
          a payment processor for your jobs.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your account">
        <p>
          You need an account to use Quote Reclaim. You are responsible for the
          accuracy of the information you provide and for keeping access to your
          account secure. You must be at least 18 years old and authorized to do
          business in the United States.
        </p>
      </LegalSection>

      <LegalSection heading="3. Subscription and billing">
        <p>
          Quote Reclaim includes 3 free quotes so you can try the service before
          paying. After that, continued use requires a paid subscription of
          $79/month.
        </p>
        <p>
          Billing is handled by Lemon Squeezy, which acts as the merchant of
          record for all purchases. Your payment is processed by Lemon Squeezy
          under their terms, and your subscription renews monthly until
          canceled.
        </p>
        <p>
          You can cancel anytime. When you cancel, your subscription stays
          active until the end of the current billing period and does not renew
          after that. Except where required by law, payments already made are
          non-refundable.
        </p>
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>
          You agree to use Quote Reclaim only for lawful follow-up with your own
          customers about estimates you have genuinely provided. You will not:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            send messages to people who have not done business with you, or who
            have asked you to stop;
          </li>
          <li>upload contact information you are not authorized to use;</li>
          <li>
            use the service to send spam, harassing, deceptive, or unlawful
            messages;
          </li>
          <li>
            attempt to break, overload, reverse engineer, or gain unauthorized
            access to the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Your communications and compliance">
        <p>
          You are solely responsible for the content of the messages you send
          through Quote Reclaim and for complying with all laws that apply to
          those messages. This includes, without limitation, the CAN-SPAM Act
          and any other applicable federal, state, or local rules on commercial
          email and customer contact. You are responsible for honoring opt-out
          requests and for having a lawful basis to contact each recipient.
        </p>
        <p>
          Quote Reclaim provides the tool; the decision of who to contact and
          what to send is yours.
        </p>
      </LegalSection>

      <LegalSection heading="6. No guarantee of results">
        <p>
          Quote Reclaim helps you follow up more consistently, but we do not
          promise or guarantee any specific outcome. We do not guarantee that
          any estimate will be won, that any revenue will be recovered, or that
          recipients will reply. Results depend on your pricing, your customers,
          your market, and many factors outside our control.
        </p>
        <p>
          The service is provided &quot;as is&quot; and &quot;as
          available,&quot; without warranties of any kind, whether express or
          implied, including the implied warranties of merchantability, fitness
          for a particular purpose, and non-infringement.
        </p>
      </LegalSection>

      <LegalSection heading="7. Limitation of liability">
        <p>
          To the fullest extent permitted by law, Quote Reclaim and its
          operators will not be liable for any indirect, incidental, special,
          consequential, or punitive damages, or for any lost profits, lost
          revenue, or lost business, arising out of or related to your use of
          the service. Our total liability for any claim relating to the service
          will not exceed the amount you paid us in the three months before the
          event giving rise to the claim.
        </p>
      </LegalSection>

      <LegalSection heading="8. Third-party services">
        <p>
          Quote Reclaim relies on third-party providers to operate, including
          for hosting, database and authentication, email delivery, AI message
          drafting, and payments. Your use of the service is also subject to
          those providers&apos; terms where they apply. We are not responsible
          for the acts or omissions of third-party providers.
        </p>
      </LegalSection>

      <LegalSection heading="9. Changes to the service or these Terms">
        <p>
          We may update the service or these Terms from time to time. If we make
          a material change to these Terms, we will update the &quot;last
          updated&quot; date above and, where appropriate, notify you. Continued
          use of the service after a change takes effect means you accept the
          updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="10. Termination">
        <p>
          You may stop using Quote Reclaim and delete your account at any time.
          We may suspend or end your access if you violate these Terms or use the
          service in a way that could harm other users, us, or third parties.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact">
        <p>
          Questions about these Terms? Email us at{" "}
          <a
            href="mailto:hello@quotereclaim.com"
            className="font-semibold text-brand hover:text-ink-strong"
          >
            hello@quotereclaim.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
