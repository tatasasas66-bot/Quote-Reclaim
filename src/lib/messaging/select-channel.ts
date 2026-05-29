export type DeliveryChannel = "email" | "sms" | "copy";

/**
 * Select the channel for outbound delivery, given a quote.
 *
 * Order:
 *   - email   → client_email present (Resend handles delivery)
 *   - sms     → client_phone present AND SMS_ENABLED=true (Twilio path)
 *   - copy    → otherwise (contractor sends manually)
 */
export function selectChannel(quote: {
  client_email: string | null | undefined;
  client_phone: string | null | undefined;
}): DeliveryChannel {
  if (quote.client_email && quote.client_email.trim().length > 0) {
    return "email";
  }
  if (
    quote.client_phone &&
    quote.client_phone.trim().length > 0 &&
    process.env.SMS_ENABLED === "true"
  ) {
    return "sms";
  }
  return "copy";
}

/**
 * Build the standard recovery email subject.
 */
export function recoveryEmailSubject(trade: string): string {
  return `Following up on your ${trade} estimate`;
}
