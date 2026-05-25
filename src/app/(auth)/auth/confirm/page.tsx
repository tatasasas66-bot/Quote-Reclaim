import Link from "next/link";
import { Button, Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

type ConfirmPageProps = {
  searchParams?: {
    token_hash?: string;
    type?: string;
    redirect_to?: string;
  };
};

const ALLOWED_TYPES = new Set(["signup", "magiclink", "email"]);

function validParam(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export default function ConfirmAuthPage({ searchParams }: ConfirmPageProps) {
  const tokenHash = validParam(searchParams?.token_hash);
  const type = validParam(searchParams?.type);
  const redirectTo = validParam(searchParams?.redirect_to);
  const canConfirm = Boolean(tokenHash && ALLOWED_TYPES.has(type));

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label="Quote Reclaim home"
          >
            <Logo showWordmark />
          </Link>
        </div>

        <section className="rounded-lg border border-line-subtle bg-surface-1 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.36)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">
            Secure Sign-In
          </p>
          <h1 className="mt-3 text-3xl font-black text-ink-strong">
            Finish signing in
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink">
            Press the button below to complete your Quote Reclaim sign-in. This
            extra step keeps email scanners from using your secure link before
            you do.
          </p>

          {canConfirm ? (
            <form method="post" action="/api/auth/confirm" className="mt-6">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="redirect_to" value={redirectTo} />
              <Button type="submit" fullWidth size="lg">
                Sign in securely
              </Button>
            </form>
          ) : (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
            >
              That code or link expired. Send a fresh one.
            </div>
          )}

          <div className="mt-4 text-center">
            <Link
              href="/sign-in"
              className="rounded text-sm text-ink-muted underline hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Back to sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
