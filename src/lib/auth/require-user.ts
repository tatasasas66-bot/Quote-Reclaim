import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RequireUserResult =
  | { user: User; supabase: SupabaseClient }
  | { user: null; supabase: SupabaseClient | null };

/**
 * Returns the authenticated Supabase user for the current request, or
 * `{ user: null, supabase }` when there is no session.
 *
 * Resilient to a missing Supabase configuration: if the server client
 * cannot be constructed (e.g., env vars unset in dev), we treat the
 * caller as anonymous rather than crashing the route. Auth-gated routes
 * should redirect to `/sign-in` when `user === null`, which is the same
 * UX whether the cause is a real lack of session or a misconfigured env.
 *
 * Production deployments must still set the Supabase env vars; otherwise
 * no user can ever sign in. The middleware health-check and a launch-gate
 * test catch the misconfigured-in-prod case.
 */
export async function requireUser(): Promise<RequireUserResult> {
  let supabase: SupabaseClient;
  try {
    supabase = createServerSupabaseClient();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "requireUser: Supabase not configured; treating request as anonymous.",
        err,
      );
    }
    return { user: null, supabase: null };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { user: null, supabase };
  }
  return { user: data.user, supabase };
}

/**
 * Convenience helper for API routes that should always reject anonymous
 * requests with a 401.
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
