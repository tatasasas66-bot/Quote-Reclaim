import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmClient } from "./confirm-client";

export const metadata: Metadata = {
  title: "Confirm secure sign-in",
  description: "Verify your identity to enter Silent Quote Command.",
};

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmClient />
    </Suspense>
  );
}
