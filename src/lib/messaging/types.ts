export type SmsResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

export interface SmsProvider {
  send(params: { to: string; body: string }): Promise<SmsResult>;
}
