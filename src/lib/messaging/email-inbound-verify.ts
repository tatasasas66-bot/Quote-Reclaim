/**
 * Production: shared-secret check is REQUIRED. Missing secret => "reject"
 * (fail closed) so a forgotten Vercel env var can never let anonymous
 * internet callers inject fake homeowner replies into Reply Radar.
 *
 * Non-production: opt-in. If a secret is configured we verify it; otherwise
 * we accept unsigned for local dev + preview parity. Same shape as the
 * `shouldVerifyResendMode` helper.
 */
export type EmailInboundSignatureMode = "verify" | "allow-unsigned" | "reject";

type EnvLike = { NODE_ENV?: string; EMAIL_INBOUND_SECRET?: string };

export function shouldVerifyEmailInboundMode(
  env: EnvLike,
): EmailInboundSignatureMode {
  if (env.NODE_ENV === "production") {
    return env.EMAIL_INBOUND_SECRET ? "verify" : "reject";
  }
  return env.EMAIL_INBOUND_SECRET ? "verify" : "allow-unsigned";
}
