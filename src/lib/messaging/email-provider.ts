import { Resend } from "resend";

const FROM_EMAIL = "Quote Reclaim <hello@quotereclaim.com>";

export type EmailResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

export type SendEmailParams = {
  to: string;
  subject: string;
  body: string;
};

/**
 * Send a recovery follow-up via Resend.
 *
 * The recipient + body MUST come from the database — never accept either
 * from the client. Returns ok:false instead of throwing so callers can
 * leave the reminder unsent and let the next cron tick retry.
 */
export async function sendRecoveryEmail(
  params: SendEmailParams,
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      text: params.body,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data?.id) {
      return { ok: false, error: "Resend returned no message id" };
    }
    return { ok: true, providerMessageId: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Email provider exception",
    };
  }
}
