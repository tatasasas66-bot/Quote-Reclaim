export function safeRedirectPath(next: string | null): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export function safeRedirectFromRedirectTo(
  rawRedirectTo: string | null,
  requestUrl: string,
): string {
  if (!rawRedirectTo) return "/dashboard";

  try {
    const current = new URL(requestUrl);
    const redirectUrl = new URL(rawRedirectTo, current.origin);
    if (redirectUrl.origin !== current.origin) return "/dashboard";

    if (redirectUrl.pathname === "/api/auth/callback") {
      return safeRedirectPath(redirectUrl.searchParams.get("next"));
    }

    return safeRedirectPath(`${redirectUrl.pathname}${redirectUrl.search}`);
  } catch {
    return safeRedirectPath(rawRedirectTo);
  }
}
