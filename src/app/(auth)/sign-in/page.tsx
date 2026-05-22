import type { Metadata } from "next";
import { AuthShell } from "@/components/onboarding/AuthShell";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Quote Reclaim with Magic Link or Google.",
};

export default function SignInPage() {
  return <AuthShell mode="sign-in" />;
}
