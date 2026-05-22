import type { Metadata } from "next";
import { TestPageClient } from "./client";

export const metadata: Metadata = {
  title: "Design system preview",
  robots: { index: false, follow: false },
};

export default function TestPage() {
  return <TestPageClient />;
}
