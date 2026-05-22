"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireEnv } from "@/lib/utils/env";

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
