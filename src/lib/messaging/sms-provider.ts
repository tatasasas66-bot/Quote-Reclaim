import { requireEnv } from "@/lib/utils/env";
import type { SmsProvider, SmsResult } from "./types";

export class TwilioSmsProvider implements SmsProvider {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly from: string;

  constructor() {
    this.accountSid = requireEnv("TWILIO_ACCOUNT_SID");
    this.authToken = requireEnv("TWILIO_AUTH_TOKEN");
    this.from = requireEnv("TWILIO_FROM_NUMBER");
  }

  async send(params: { to: string; body: string }): Promise<SmsResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const formBody = new URLSearchParams({
      To: params.to,
      From: this.from,
      Body: params.body,
    });

    try {
      const credentials = Buffer.from(
        `${this.accountSid}:${this.authToken}`,
      ).toString("base64");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: formBody.toString(),
      });

      const json = (await response.json()) as {
        sid?: string;
        message?: string;
      };

      if (!response.ok) {
        return { ok: false, error: json.message ?? `HTTP ${response.status}` };
      }

      return { ok: true, providerMessageId: json.sid ?? "unknown" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }
}
