"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import {
  sendReminderManualAction,
  sendReminderManualEmailAction,
} from "@/lib/quotes/actions";
import { track } from "@/lib/analytics/track";

type Props = {
  reminderId: string;
  disabled: boolean;
  messageType?: "email" | "sms";
  followupNumber?: number;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "google";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
};

/**
 * "Send today" — manual send for the ONE next actionable follow-up.
 *
 * Two-step confirm: the first click arms the button ("Confirm send"), the
 * second click sends. A single stray tap can never fire a message, and the
 * label names the follow-up so the contractor knows exactly what goes out.
 * The page renders this button only on the next actionable card, and the
 * server action independently rejects out-of-order sends — three layers,
 * no accidental spam.
 */
export function SendEarlyButton({
  reminderId,
  disabled,
  messageType = "sms",
  followupNumber,
  variant = "ghost",
  size = "sm",
  fullWidth = false,
  className,
}: Props) {
  const [state, setState] = React.useState<
    "idle" | "confirm" | "pending" | "sent" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  async function handleClick() {
    if (disabled || state === "pending" || state === "sent") return;
    if (state === "idle") {
      setState("confirm");
      return;
    }
    setState("pending");
    try {
      const result =
        messageType === "email"
          ? await sendReminderManualEmailAction(reminderId)
          : await sendReminderManualAction(reminderId);
      if (result.ok) {
        setState("sent");
        if (messageType === "email") {
          track("email_action_clicked", {
            reminder_id: reminderId,
            action_type: "email_sent",
          });
        }
        if (
          new URLSearchParams(window.location.search).get("source") ===
          "sunday-reset"
        ) {
          track("sunday_reset_action_taken", {
            reminder_id: reminderId,
            action_type: `${messageType}_sent`,
          });
        }
      } else {
        setState("error");
        setErrorMsg(result.error);
      }
    } catch {
      setState("error");
      setErrorMsg("Something went wrong");
    }
  }

  if (state === "sent") {
    return (
      <p role="status" className="text-xs font-semibold text-success">
        Sent!
      </p>
    );
  }

  const label =
    state === "confirm"
      ? followupNumber
        ? `Confirm — send follow-up ${followupNumber}`
        : "Confirm send"
      : "Send today";
  const wrapperClass = fullWidth ? "items-stretch" : "items-end";

  return (
    <div className={`flex flex-col gap-1 ${wrapperClass}`}>
      <Button
        type="button"
        size={size}
        variant={variant}
        fullWidth={fullWidth}
        className={className}
        disabled={disabled || state === "pending"}
        loading={state === "pending"}
        onClick={handleClick}
      >
        {label}
      </Button>
      {state === "confirm" ? (
        <button
          type="button"
          onClick={() => setState("idle")}
          className="rounded text-xs text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Cancel
        </button>
      ) : null}
      {state === "error" && errorMsg ? (
        <p role="alert" className="text-xs text-danger">
          {errorMsg}
        </p>
      ) : null}
    </div>
  );
}
