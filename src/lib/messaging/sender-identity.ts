/**
 * Customer-facing sender identity for recovery emails.
 *
 * The homeowner should see the email as coming from the contractor/business,
 * not a SaaS brand — but deliverability must stay on the verified Quote
 * Reclaim sending domain (SPF/DKIM/DMARC are aligned to hello@quotereclaim.com,
 * NOT the contractor's personal domain, which we do not control). So we change
 * only the From DISPLAY NAME, never the address:
 *
 *   "Roy's Painting via Quote Reclaim" <hello@quotereclaim.com>
 *
 * The display name is fully sanitized before it reaches the SMTP header, so a
 * malicious or malformed contractor value can never inject extra headers or
 * break the "Name" <addr> grammar.
 */

/** The verified Quote Reclaim sending address. Deliverability anchor — never changes per-contractor. */
export const VERIFIED_SENDER_ADDRESS = "hello@quotereclaim.com";
const BRAND = "Quote Reclaim";
/** Default From for internal/system mail (contractor notifications), unchanged. */
export const DEFAULT_FROM = `${BRAND} <${VERIFIED_SENDER_ADDRESS}>`;

// Keep the visible display name reasonable: long enough for a real business
// name, short enough that " via Quote Reclaim <hello@quotereclaim.com>" never
// produces an unwieldy header.
const MAX_DISPLAY_NAME = 60;

/**
 * Strip anything that could break the From header or inject new headers:
 * CR/LF (header injection), angle brackets and double quotes (which delimit
 * the "Name" <addr> grammar), then collapse whitespace, trim, and cap length.
 */
export function sanitizeDisplayName(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[<>"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DISPLAY_NAME)
    .trim();
}

/**
 * Turn an email local-part into a readable name: "roys.painting@x.com" ->
 * "Roys Painting"; "dallasroofco@x.com" -> "Dallasroofco". Returns "" when
 * there is nothing usable.
 */
export function readableNameFromEmail(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const words = local.replace(/[._+\-]+/g, " ").trim();
  if (!words) return "";
  return words
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type ContractorIdentity = {
  /** Business / company name, if the app ever stores one. Highest priority. */
  businessName?: string | null;
  /** Contractor full name (e.g. from auth metadata), if available. */
  contractorName?: string | null;
  /** The contractor's account email — always present; the reliable fallback. */
  contractorEmail?: string | null;
};

/**
 * Resolve the bare contractor display name (without the " via Quote Reclaim"
 * suffix), applying the fallback order:
 *   1. business / company name
 *   2. contractor full name
 *   3. contractor email local-part, made readable
 *   4. "Your contractor"
 * Every tier is sanitized; the final literal is already safe.
 */
export function contractorDisplayName(identity: ContractorIdentity): string {
  const business = sanitizeDisplayName(identity.businessName);
  if (business) return business;
  const name = sanitizeDisplayName(identity.contractorName);
  if (name) return name;
  const fromEmail = sanitizeDisplayName(
    readableNameFromEmail(identity.contractorEmail),
  );
  if (fromEmail) return fromEmail;
  return "Your contractor";
}

/**
 * The full From header for a CUSTOMER-FACING recovery email:
 *   "Roy's Painting via Quote Reclaim" <hello@quotereclaim.com>
 *
 * The display portion is double-quoted so a comma or other special character
 * in a business name can never be misread as an address-list separator. The
 * address is always the verified sender — deliverability is unchanged.
 */
export function recoveryFromHeader(identity: ContractorIdentity): string {
  const name = contractorDisplayName(identity);
  // sanitizeDisplayName already removed quotes/brackets/newlines, so the
  // quoted display name below is always well-formed.
  return `"${name} via ${BRAND}" <${VERIFIED_SENDER_ADDRESS}>`;
}
