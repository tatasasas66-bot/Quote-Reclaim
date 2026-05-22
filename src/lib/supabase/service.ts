import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/utils/env";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/supabase/service.ts must never be imported on the client. " +
      "Use createBrowserSupabaseClient or createServerSupabaseClient instead.",
  );
}

/**
 * Service-role Supabase client. Bypasses RLS. Server-only.
 *
 * Use exclusively in:
 *   - cron route handlers under src/app/api/cron/*
 *   - webhook handlers under src/app/api/webhooks/*
 *   - any RPC backend that must read or write across tenants
 *
 * Never derive `user_id` from request input when using this client; carry
 * the user_id from authenticated context (e.g., a verified webhook payload
 * or a cron-claimed row).
 */
export function createServiceSupabaseClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
