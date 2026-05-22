import type { Metadata } from "next";
import { AuthShell } from "@/components/onboarding/AuthShell";

export const metadata: Metadata = {
  title: "Start free",
  description:
    "Start free with Quote Reclaim. 3 silent quotes free. No credit card.",
};

export default function SignUpPage() {
  return <AuthShell mode="sign-up" />;
}
