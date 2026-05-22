import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { requireEnv } from "@/lib/utils/env";

/**
 * Cookie-aware Supabase client for server components, server actions, and
 * route handlers. Reads run as the signed-in user; RLS does the rest.
 *
 * Do not use this for cron jobs or webhook handlers — they have no user
 * session. Use `createServiceSupabaseClient()` from `./service` for those.
 */
export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll is a no-op from Server Components (cookies are read-only).
            // The middleware and Route Handlers are the real write paths.
          }
        },
      },
    },
  );
}
