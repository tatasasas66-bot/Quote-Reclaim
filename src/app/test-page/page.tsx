import type { Metadata } from "next";
import { TestPageClient } from "./client";

export const metadata: Metadata = {
  title: "Internal UI Reference",
  robots: { index: false, follow: false },
};

export default function TestPage() {
  return <TestPageClient />;
}
