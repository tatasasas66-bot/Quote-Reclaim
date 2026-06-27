"use client";

import * as React from "react";
import { track } from "@/lib/analytics/track";

export function SundayResetTracker({ quoteId }: { quoteId: string }) {
  React.useEffect(() => {
    track("sunday_reset_clicked", { quote_id: quoteId });
  }, [quoteId]);

  return null;
}
