"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import type { ActionResult } from "@/lib/quotes/actions";
import type { QuoteRow } from "@/lib/quotes/repo";
import { TRADES, US_STATES } from "@/lib/utils/normalize";

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
    <form
      action={formAction}
      className="space-y-5 rounded-lg border border-line-subtle bg-surface-1 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.3)] sm:p-6"
      noValidate
    >
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
        autoFocus={mode === "create"}
      />
      <TradeSelect
        defaultValue={initial?.trade ?? ""}
        error={fieldError("trade")}
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
          hint="Email OR phone required so the recovery plan can reach the customer."
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

      <details className="group rounded-lg border border-line-subtle bg-surface-2 p-4 open:bg-surface-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-ink-strong">
          <span className="inline-flex items-center gap-2">
            Add location &amp; details
            <span
              aria-hidden="true"
              className="text-ink-muted transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </span>
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="City"
              name="city"
              defaultValue={initial?.city ?? ""}
              error={fieldError("city")}
              autoComplete="off"
            />
            <StateSelect
              defaultValue={initial?.state ?? ""}
              error={fieldError("state")}
            />
          </div>
          <JobDescriptionField
            defaultValue={initial?.job_description ?? ""}
            error={fieldError("job_description")}
          />
        </div>
      </details>

      <SubmitButton mode={mode} />
      <p className="text-center text-xs text-ink-muted">
        {mode === "create"
          ? "Your plan will be ready to copy or send manually. Connect sending automation when you're ready."
          : "Saving updates the existing recovery plan."}
      </p>
    </form>
  );
}

type JobDescriptionFieldProps = {
  defaultValue?: string;
  error?: string;
};

function JobDescriptionField({ defaultValue, error }: JobDescriptionFieldProps) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Job description (optional)
      </label>
      <textarea
        id={id}
        name="job_description"
        defaultValue={defaultValue ?? ""}
        maxLength={500}
        rows={3}
        aria-invalid={error ? true : undefined}
        className={
          "rounded-lg border border-line-subtle bg-surface-2 px-3 py-2 text-base text-ink-strong shadow-inner shadow-black/10 focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40 disabled:cursor-not-allowed disabled:opacity-50" +
          (error ? " border-danger focus:border-danger focus:ring-danger/30" : "")
        }
      />
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-xs text-ink-muted">Up to 500 characters.</p>
      )}
    </div>
  );
}

type TradeSelectProps = {
  defaultValue?: string;
  error?: string;
};

function TradeSelect({ defaultValue, error }: TradeSelectProps) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Trade <span aria-hidden="true" className="text-brand">*</span>
      </label>
      <select
        id={id}
        name="trade"
        required
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        className={
          "h-11 rounded-lg border border-line-subtle bg-surface-2 px-3 text-base font-medium text-ink-strong shadow-inner shadow-black/10 focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40 disabled:cursor-not-allowed disabled:opacity-50" +
          (error ? " border-danger focus:border-danger focus:ring-danger/30" : "")
        }
      >
        <option value="" disabled>
          Choose a trade
        </option>
        {TRADES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type StateSelectProps = {
  defaultValue?: string;
  error?: string;
};

function StateSelect({ defaultValue, error }: StateSelectProps) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        State
      </label>
      <select
        id={id}
        name="state"
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        className={
          "h-11 rounded-lg border border-line-subtle bg-surface-2 px-3 text-base font-medium text-ink-strong shadow-inner shadow-black/10 focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40 disabled:cursor-not-allowed disabled:opacity-50" +
          (error ? " border-danger focus:border-danger focus:ring-danger/30" : "")
        }
      >
        <option value="">Select state</option>
        {US_STATES.map(([code, name]) => (
          <option key={code} value={code}>
            {name} ({code})
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      fullWidth
      size="lg"
      loading={pending}
      className="shadow-[0_0_42px_rgba(217,111,50,0.24)]"
    >
      {pending
        ? mode === "create"
          ? "Saving…"
          : "Updating…"
        : mode === "create"
          ? "Build Recovery Plan"
          : "Save changes"}
    </Button>
  );
}
