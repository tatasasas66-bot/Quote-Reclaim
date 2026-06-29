"use client";

import * as React from "react";
import { Check, Copy, MessageSquareText, Send } from "lucide-react";
import { Button } from "@/components/ui";
import { track, type TrackProps } from "@/lib/analytics/track";
import { normalizePhone } from "@/lib/messaging/phone";
import { cn } from "@/lib/utils/cn";

type Props = {
  message: string;
  phone?: string | null;
  source: string;
  className?: string;
  tracking?: TrackProps;
};

export function buildManualSmsHref(
  phone: string | null | undefined,
  message: string,
): string {
  const recipient = normalizePhone(phone) ?? "";
  return `sms:${recipient}?body=${encodeURIComponent(message)}`;
}

function whatsappHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function ManualMessageActions({
  message,
  phone,
  source,
  className,
  tracking = {},
}: Props) {
  const [copied, setCopied] = React.useState<"sms" | "whatsapp" | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copyMessage(channel: "sms" | "whatsapp") {
    try {
      await navigator.clipboard.writeText(message);
      track(channel === "sms" ? "sms_copied" : "whatsapp_copied", {
        surface: source,
        ...tracking,
      });
      trackSundayResetAction(`${channel}_copied`);
      setCopied(channel);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard may be blocked; the visible message can still be copied by hand.
    }
  }

  return (
    <div
      data-testid="manual-message-actions"
      className={cn(
        "rounded-lg border border-line-subtle bg-canvas/35 p-3",
        className,
      )}
    >
      <p className="text-xs leading-5 text-ink-muted">
        Nothing sends until you tap send. Quote Reclaim prepares the message;
        you choose the contact and send it yourself.
      </p>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <a
          href={buildManualSmsHref(phone, message)}
          onClick={() => {
            track("sms_opened", { surface: source, ...tracking });
            trackSundayResetAction("sms_opened");
          }}
          className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-3 py-2 text-center text-sm font-semibold text-canvas transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">Open SMS</span>
        </a>
        <a
          href={whatsappHref(message)}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            track("whatsapp_opened", { surface: source, ...tracking });
            trackSundayResetAction("whatsapp_opened");
          }}
          className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-center text-sm font-semibold text-ink-strong transition hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">Open WhatsApp</span>
        </a>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-10 min-w-0 whitespace-normal text-center"
          onClick={() => copyMessage("sms")}
        >
          {copied === "sms" ? (
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 break-words">
            {copied === "sms" ? "SMS copied" : "Copy SMS message"}
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-10 min-w-0 whitespace-normal text-center"
          onClick={() => copyMessage("whatsapp")}
        >
          {copied === "whatsapp" ? (
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 break-words">
            {copied === "whatsapp"
              ? "WhatsApp copied"
              : "Copy WhatsApp message"}
          </span>
        </Button>
      </div>
    </div>
  );

  function trackSundayResetAction(actionType: string) {
    if (
      new URLSearchParams(window.location.search).get("source") ===
      "sunday-reset"
    ) {
      track("sunday_reset_action_taken", {
        action_type: actionType,
        ...tracking,
      });
    }
  }
}
