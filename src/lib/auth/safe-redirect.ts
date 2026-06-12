/**
 * Rejects open-redirect attempts. Anything that doesn't start with a single
 * forward slash — or that smuggles a host past that check — falls back to
 * /dashboard.
 *
 *   "/dashboard"            -> "/dashboard"
 *   "/dashboard?a=1"        -> "/dashboard?a=1"
 *   "//evil.com"            -> "/dashboard"  (protocol-relative)
 *   "/\evil.com"            -> "/dashboard"  (backslash: browsers read \ as /)
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
  // Must be a root-relative path.
  if (!next.startsWith("/")) return "/dashboard";
  // Reject protocol-relative ("//host") and backslash-smuggled ("/\host")
  // forms. Browsers normalize "\" to "/", so "/\evil.com" resolves to the
  // external host evil.com — treat any backslash as hostile.
  if (next.startsWith("//") || next.includes("\\")) return "/dashboard";
  return next;
}
