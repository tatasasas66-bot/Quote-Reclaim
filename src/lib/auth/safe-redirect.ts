/**
 * Rejects open-redirect attempts. Anything that doesn't start with a single
 * forward slash falls back to /dashboard.
 *
 *   "/dashboard"            -> "/dashboard"
 *   "/dashboard?a=1"        -> "/dashboard?a=1"
 *   "//evil.com"            -> "/dashboard"  (protocol-relative)
 *   "https://evil.com"      -> "/dashboard"
 *   "javascript:alert(1)"   -> "/dashboard"
 *   null / undefined / ""   -> "/dashboard"
 *
 * Used by the callback / confirm routes AND the sign-in / sign-up pages so
 * that a stale `?next=` query never sends the user off-site after a session
 * is detected.
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}
