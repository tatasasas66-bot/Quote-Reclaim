import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RequireUserResult =
  | { user: User; supabase: ReturnType<typeof createServerSupabaseClient> }
  | { user: null; supabase: ReturnType<typeof createServerSupabaseClient> };

/**
 * Returns the authenticated Supabase user for the current request, or
 * `{ user: null, supabase }` when no session is present.
 *
 * API route handlers should turn `user === null` into a `401 Unauthorized`
 * response. Server Components should redirect to `/sign-in`.
 */
export async function requireUser(): Promise<RequireUserResult> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { user: null, supabase };
  }
  return { user: data.user, supabase };
}

/**
 * Convenience helper for API routes that should always reject anonymous
 * requests with a 401. Returns `null` when the caller is authenticated; the
 * caller can then proceed to read `user`.
 */
export async function unauthorizedResponseIfMissing(): Promise<Response | null> {
  const { user } = await requireUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}
