import type { Trade } from "@/lib/quotes/schema";

export type VoiceParseResult = {
  client_name: string | null;
  trade: Trade | null;
  estimate_amount: number | null;
  days_silent: number | null;
  city: string | null;
  state: string | null;
  client_phone: string | null;
  client_email: string | null;
  job_description: string | null;
  confidence?: {
    client_name?: number;
    trade?: number;
    estimate_amount?: number;
    days_silent?: number;
  };
  missing_required?: string[];
  /**
   * Per-render React key so a re-parse re-mounts the form inputs and the
   * controlled defaultValue takes effect. Server-side parsing fills this with
   * a timestamp; the local parser stamps its own value.
   */
  _key?: string;
};
