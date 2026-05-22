import { TwilioSmsProvider } from "./sms-provider";
import { SimulatorSmsProvider } from "./simulator-provider";
import type { SmsProvider } from "./types";

function hasTwilioConfig(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
}

export function getMessagingService(): SmsProvider {
  if (hasTwilioConfig()) {
    return new TwilioSmsProvider();
  }
  if (process.env.NODE_ENV === "production") {
    // Fail closed: never simulate silently in production.
    throw new Error(
      "SMS provider not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
    );
  }
  return new SimulatorSmsProvider();
}
