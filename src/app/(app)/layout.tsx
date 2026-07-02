import type { ReactNode } from "react";
import { AppThemeProvider } from "@/components/app/AppThemeProvider";

export default function AuthenticatedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppThemeProvider>{children}</AppThemeProvider>;
}
