import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What data Quote Reclaim collects, how it is used, the third parties involved, and how to delete your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="May 31, 2026">
      <p className="text-[15px] leading-7 text-ink">
        This Privacy Policy explains what information Quote Reclaim
        (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, how we use
        it, and the choices you have. It applies to your use of the Quote Reclaim
        service.
      </p>

      <LegalSection heading="1. Information we collect">
        <p>
          <span className="font-semibold text-ink-strong">
            Account information.
          </span>{" "}
          When you sign up, we collect your email address. We use Magic Link
          sign-in, so we do not store a password for you.
        </p>
        <p>
          <span className="font-semibold text-ink-strong">
            Quote data you enter.
          </span>{" "}
          To follow up on your behalf, we store the information you add about
          each estimate: your customer&apos;s name, email address, and phone
          number, the trade and job description, the estimate amount, and the
          dates and status of the quote.
        </p>
        <p>
          <span className="font-semibold text-ink-strong">
            Reply and outcome data.
          </span>{" "}
          When a customer replies to a follow-up, we store the reply text so we
          can classify its intent and show you a suggested response. We also
          store whether an estimate was won or closed so we can track recovery
          outcomes.
        </p>
        <p>
          <span className="font-semibold text-ink-strong">
            Basic usage data.
          </span>{" "}
          Like most web services, our hosting and infrastructure providers
          process standard technical data — such as IP address and request logs
          — to keep the service running and secure.
        </p>
      </LegalSection>

      <LegalSection heading="2. How we use information">
        <p>We use the information above to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>create and manage your account;</li>
          <li>
            generate and send follow-up emails to your customers on your behalf;
          </li>
          <li>classify customer replies and suggest responses;</li>
          <li>track recovery outcomes and show you your results;</li>
          <li>operate, secure, support, and improve the service;</li>
          <li>
            process your subscription and meet our legal obligations.
          </li>
        </ul>
        <p>
          We do not sell your data, and we do not use your customers&apos;
          contact information for our own marketing.
        </p>
      </LegalSection>

      <LegalSection heading="3. Third-party services we use">
        <p>
          We use a small set of service providers to run Quote Reclaim. Each
          receives only the data it needs for its role:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-semibold text-ink-strong">Supabase</span> —
            database and authentication (your account and quote data).
          </li>
          <li>
            <span className="font-semibold text-ink-strong">Resend</span> —
            sending and receiving follow-up email.
          </li>
          <li>
            <span className="font-semibold text-ink-strong">Groq</span> — AI
            generation of draft follow-up messages and reply classification.
          </li>
          <li>
            <span className="font-semibold text-ink-strong">
              Payment provider
            </span>{" "}
            — when billing is active, a third-party payment provider acts as
            merchant of record and processes subscription charges. Quote
            Reclaim does not store your card details.
          </li>
          <li>
            <span className="font-semibold text-ink-strong">Vercel</span> —
            application hosting.
          </li>
        </ul>
        <p>
          These providers process data on our behalf under their own terms and
          privacy policies. We share customer reply text with our AI provider
          only to classify intent and draft responses. We do not use your data
          to train AI models. We do not sell your data.
        </p>
      </LegalSection>

      <LegalSection heading="4. Data retention">
        <p>
          We keep your account and quote data for as long as your account is
          active and as needed to provide the service. Some records, such as
          billing records and event logs, may be kept longer where we need them
          to meet legal, accounting, or security obligations. When data is no
          longer needed, we delete it or remove its connection to you.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your choices and rights">
        <p>
          You can view and edit your quote data inside the app at any time. You
          can also:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-semibold text-ink-strong">
              Delete your data.
            </span>{" "}
            You can delete individual quotes, or ask us to delete your account
            and the data associated with it. Once deleted, recovery data tied to
            your account is removed, except for records we must keep by law.
          </li>
          <li>
            <span className="font-semibold text-ink-strong">
              Stop follow-ups.
            </span>{" "}
            You can pause or stop a follow-up sequence at any time.
          </li>
        </ul>
        <p>
          To make a deletion or data request, email us at{" "}
          <a
            href="mailto:support@quotereclaim.com"
            className="font-semibold text-brand hover:text-ink-strong"
          >
            support@quotereclaim.com
          </a>{" "}
          and we will respond within a reasonable time.
        </p>
      </LegalSection>

      <LegalSection heading="6. Your customers' data">
        <p>
          The customer contact information in your account is data you provide
          and control. You are responsible for having a lawful basis to store
          and contact those customers, and for honoring their requests to stop
          being contacted. If one of your customers asks you to remove their
          information, you can delete it from the relevant quote.
        </p>
      </LegalSection>

      <LegalSection heading="7. Security">
        <p>
          We use reasonable technical and organizational measures to protect
          your data, including access controls and encryption in transit. No
          method of storage or transmission is completely secure, so we cannot
          promise absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="8. Children's privacy">
        <p>
          Quote Reclaim is a business tool intended for adults. It is not
          directed to children, and we do not knowingly collect information from
          anyone under 18.
        </p>
      </LegalSection>

      <LegalSection heading="9. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. When we do, we
          will update the &quot;last updated&quot; date above. We will
          communicate material changes where appropriate.
        </p>
      </LegalSection>

      <LegalSection heading="10. Contact">
        <p>
          Questions or privacy requests? Email us at{" "}
          <a
            href="mailto:support@quotereclaim.com"
            className="font-semibold text-brand hover:text-ink-strong"
          >
            support@quotereclaim.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
