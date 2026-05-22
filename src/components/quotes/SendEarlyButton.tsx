"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { sendReminderManualAction } from "@/lib/quotes/actions";

type Props = {
  reminderId: string;
  disabled: boolean;
};

export function SendEarlyButton({ reminderId, disabled }: Props) {
  const [state, setState] = React.useState<"idle" | "pending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  async function handleClick() {
    if (disabled || state !== "idle") return;
    setState("pending");
    try {
      const result = await sendReminderManualAction(reminderId);
      if (result.ok) {
        setState("sent");
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

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled || state === "pending"}
        loading={state === "pending"}
        onClick={handleClick}
      >
        Send early
      </Button>
      {state === "error" && errorMsg ? (
        <p role="alert" className="text-xs text-danger">
          {errorMsg}
        </p>
      ) : null}
    </div>
  );
}
