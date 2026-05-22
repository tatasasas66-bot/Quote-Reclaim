"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import type { ActionResult } from "@/lib/quotes/actions";
import type { QuoteRow } from "@/lib/quotes/repo";

type FormAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

type Props = {
  mode: "create" | "edit";
  initial?: QuoteRow;
  action: FormAction;
};

export function QuoteForm({ mode, initial, action }: Props) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    action,
    null,
  );

  const isError = state && state.ok === false;
  const fieldError = (key: string): string | undefined => {
    if (!isError) return undefined;
    return state.fieldErrors?.[key]?.[0];
  };
  const topLevelError = isError && !state.fieldErrors ? state.error : null;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {topLevelError ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          {topLevelError}
        </div>
      ) : null}

      <Input
        label="Client name"
        name="client_name"
        required
        defaultValue={initial?.client_name ?? ""}
        error={fieldError("client_name")}
        autoComplete="off"
      />
      <Input
        label="Trade"
        name="trade"
        required
        defaultValue={initial?.trade ?? ""}
        placeholder="Roofing, HVAC, electrical…"
        error={fieldError("trade")}
        autoComplete="off"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Estimate amount (USD)"
          name="estimate_amount"
          type="number"
          inputMode="decimal"
          min="1"
          step="0.01"
          required
          defaultValue={initial?.estimate_amount?.toString() ?? ""}
          error={fieldError("estimate_amount")}
        />
        <Input
          label="Days since you sent the quote"
          name="days_silent"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          required
          defaultValue={(initial?.days_silent ?? 0).toString()}
          hint="0 = sent today"
          error={fieldError("days_silent")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Client email"
          name="client_email"
          type="email"
          inputMode="email"
          defaultValue={initial?.client_email ?? ""}
          hint="Email or phone required"
          error={fieldError("client_email")}
          autoComplete="off"
        />
        <Input
          label="Client phone"
          name="client_phone"
          type="tel"
          inputMode="tel"
          defaultValue={initial?.client_phone ?? ""}
          error={fieldError("client_phone")}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="City"
          name="city"
          defaultValue={initial?.city ?? ""}
          error={fieldError("city")}
          autoComplete="off"
        />
        <Input
          label="State"
          name="state"
          maxLength={2}
          defaultValue={initial?.state ?? ""}
          placeholder="CA"
          error={fieldError("state")}
          autoComplete="off"
        />
      </div>
      <Input
        label="Job description (optional)"
        name="job_description"
        defaultValue={initial?.job_description ?? ""}
        error={fieldError("job_description")}
        autoComplete="off"
      />

      <SubmitButton mode={mode} />
    </form>
  );
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth size="lg" loading={pending}>
      {pending
        ? mode === "create"
          ? "Saving…"
          : "Updating…"
        : mode === "create"
          ? "Save quote"
          : "Save changes"}
    </Button>
  );
}
