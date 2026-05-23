"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 *
 * NEXT_PUBLIC_* env vars MUST be referenced as static property accesses
 * (process.env.NEXT_PUBLIC_FOO), not via a dynamic helper like
 * requireEnv(name) or process.env[name]. Next.js / webpack only inline
 * NEXT_PUBLIC_* values into the client bundle when they appear as literal
 * property reads. A dynamic lookup ends up as process.env[var] at runtime,
 * which is undefined in the browser and throws "Missing required environment
 * variable".
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL",
    );
  }
  if (!anonKey) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createBrowserClient(url, anonKey);
}
