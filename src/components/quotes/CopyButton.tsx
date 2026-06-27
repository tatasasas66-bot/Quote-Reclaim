"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { track, type TrackProps } from "@/lib/analytics/track";

type Props = {
  text: string;
  label?: string;
  onCopied?: () => void;
  source?: string;
  tracking?: TrackProps;
};

export function CopyButton({
  text,
  label = "Copy",
  onCopied,
  source = "unknown",
  tracking = {},
}: Props) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text);
      track("message_copied", { surface: source, ...tracking });
      if (isSundayResetVisit()) {
        track("sunday_reset_action_taken", {
          action_type: "message_copied",
          ...tracking,
        });
      }
      onCopied?.();
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // No-op; clipboard may be unavailable in some contexts.
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      aria-label={copied ? "Copied" : `Copy ${label}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{copied ? "Copied" : label}</span>
    </Button>
  );
}

function isSundayResetVisit(): boolean {
  return new URLSearchParams(window.location.search).get("source") === "sunday-reset";
}
