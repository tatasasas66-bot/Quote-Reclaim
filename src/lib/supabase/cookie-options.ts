import type { CookieOptions } from "@supabase/ssr";

/**
 * One year, in seconds. Chrome caps persistent cookies at ~400 days; a year is
 * comfortably under that and long enough that the Supabase refresh token
 * survives browser restarts and new tabs. The middleware still rotates the
 * short-lived access token on each request.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Ensure Supabase auth cookies persist across browser restarts.
 *
 * `@supabase/ssr` does not always attach an explicit `maxAge`/`expires` to the
 * chunked auth-token cookies. Without one the browser treats them as
 * session-only cookies that vanish when the tab closes — which forces the user
 * to sign in again on every visit. We attach a long `maxAge` to real writes and
 * leave deletions untouched (empty value, or `maxAge <= 0`) so sign-out still
 * clears the session.
 */
export function withPersistentSessionCookie(
  value: string,
  options: CookieOptions = {},
): CookieOptions {
  const isDeletion =
    value === "" ||
    options.maxAge === 0 ||
    (typeof options.maxAge === "number" && options.maxAge < 0);
  if (isDeletion) return options;

  // Respect an explicit lifetime Supabase already chose.
  if (options.maxAge != null || options.expires != null) return options;

  return { ...options, maxAge: SESSION_COOKIE_MAX_AGE_SECONDS };
}
