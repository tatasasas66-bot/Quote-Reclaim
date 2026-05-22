import type { SmsProvider, SmsResult } from "./types";

export class SimulatorSmsProvider implements SmsProvider {
  async send(params: { to: string; body: string }): Promise<SmsResult> {
    const id = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Logging recipient number is intentional for dev tracing; no secret is exposed.
    console.log(`[SMS SIMULATOR] To: ${params.to} | ID: ${id}`);
    console.log(`[SMS SIMULATOR] ${params.body.slice(0, 80)}${params.body.length > 80 ? "…" : ""}`);
    return { ok: true, providerMessageId: id };
  }
}
