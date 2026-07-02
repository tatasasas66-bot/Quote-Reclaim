"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import { VoiceButton } from "@/components/voice/VoiceButton";
import type { VoicePrefill } from "@/lib/voice/parse-transcript";
import type { ActionResult } from "@/lib/quotes/actions";
import type { QuoteRow } from "@/lib/quotes/repo";
import { getProjectTypeOptions } from "@/lib/recovery/recovery-logic";
import { TRADES, US_STATES } from "@/lib/utils/normalize";

type FormAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

type Props = {
  mode: "create" | "edit";
  initial?: QuoteRow;
  defaultTrade?: string | null;
  action: FormAction;
};

export function QuoteForm({ mode, initial, defaultTrade, action }: Props) {
  const router = useRouter();
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    action,
    null,
  );
  React.useEffect(() => {
    if (mode === "edit" && state?.ok && initial?.id) {
      router.push(`/quotes/${initial.id}`);
    }
  }, [initial?.id, mode, router, state]);

  const isError = state && state.ok === false;
  const fieldError = (key: string): string | undefined => {
    if (!isError) return undefined;
    return state.fieldErrors?.[key]?.[0];
  };
  const topLevelError = isError && !state.fieldErrors ? state.error : null;

  // Voice is enhancement-only. When the contractor confirms a voice capture we
  // seed the (uncontrolled) fields by remounting the form with new
  // defaultValues — anything voice could not parse stays blank for typing.
  const [voice, setVoice] = React.useState<VoicePrefill | null>(null);
  const [formKey, setFormKey] = React.useState(0);
  const [selectedTrade, setSelectedTrade] = React.useState(
    initial?.trade || defaultTrade || "",
  );
  const [projectType, setProjectType] = React.useState(
    initial?.project_type ?? "",
  );
  const applyVoice = React.useCallback((parsed: VoicePrefill) => {
    setVoice(parsed);
    if (parsed.trade) setSelectedTrade(parsed.trade);
    setFormKey((k) => k + 1);
  }, []);

  const clientName = voice?.client_name || initial?.client_name || "";
  const trade = voice?.trade || initial?.trade || defaultTrade || "";
  const amount = voice?.estimate_amount || initial?.estimate_amount?.toString() || "";
  const daysSilent = voice?.days_silent || (initial?.days_silent ?? 0).toString();
  const city = voice?.city || initial?.city || "";
  const stateCode = voice?.state || initial?.state || "";

  return (
    <form
      key={formKey}
      action={formAction}
      className="space-y-5 rounded-2xl border border-line-subtle bg-white p-5 shadow-premium sm:p-6"
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

      {mode === "create" ? <VoiceButton onComplete={applyVoice} /> : null}

      {/* Same two inputs as the free audit — amount + days quiet. Identity
          comes later, optionally, so the audit's "no customer names" promise
          holds on the first in-app action. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Estimate amount (USD)"
          name="estimate_amount"
          type="number"
          inputMode="decimal"
          min="1"
          step="0.01"
          required
          defaultValue={amount}
          error={fieldError("estimate_amount")}
          autoFocus={mode === "create"}
        />
        <Input
          label="Days since you sent the quote"
          name="days_silent"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          required
          defaultValue={daysSilent}
          hint="0 = sent today"
          error={fieldError("days_silent")}
        />
      </div>
      <TradeSelect
        defaultValue={trade}
        error={fieldError("trade")}
        onChange={setSelectedTrade}
      />
      <ProjectTypeField
        trade={selectedTrade}
        value={projectType}
        onChange={setProjectType}
        error={fieldError("project_type")}
      />
      <div className="space-y-4 rounded-lg border border-line-subtle bg-surface-2 p-4">
        <p className="text-sm font-semibold text-ink-strong">
          Customer details <span className="font-medium text-ink-muted">(all optional)</span>
        </p>
        <Input
          label="Customer name (optional)"
          name="client_name"
          defaultValue={clientName}
          hint="Works without a name — we'll label it by the job."
          error={fieldError("client_name")}
          autoComplete="off"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Customer email (optional)"
            name="client_email"
            type="email"
            inputMode="email"
            defaultValue={initial?.client_email ?? ""}
            error={fieldError("client_email")}
            autoComplete="off"
          />
          <Input
            label="Customer phone (optional)"
            name="client_phone"
            type="tel"
            inputMode="tel"
            defaultValue={initial?.client_phone ?? ""}
            error={fieldError("client_phone")}
            autoComplete="off"
          />
        </div>
        <p className="text-xs leading-5 text-ink-muted">
          Add email or phone when you&apos;re ready to send. Leave them blank
          and nothing can ever go out for this estimate.
        </p>
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
              defaultValue={city}
              error={fieldError("city")}
              autoComplete="off"
            />
            <StateSelect defaultValue={stateCode} error={fieldError("state")} />
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
          "rounded-xl border border-line-subtle bg-white px-4 py-3 text-base text-ink-strong shadow-premium focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/25 disabled:cursor-not-allowed disabled:opacity-50" +
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
  onChange?: (trade: string) => void;
};

function TradeSelect({ defaultValue, error, onChange }: TradeSelectProps) {
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
        onChange={(event) => onChange?.(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={
          "h-[52px] rounded-xl border border-line-subtle bg-white px-4 text-base font-medium text-ink-strong shadow-premium focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/25 disabled:cursor-not-allowed disabled:opacity-50" +
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

function ProjectTypeField({
  trade,
  value,
  onChange,
  error,
}: {
  trade: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = React.useId();
  const listId = `${id}-options`;
  const options = getProjectTypeOptions(trade);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Project type <span className="text-ink-muted">(recommended)</span>
      </label>
      <input
        id={id}
        name="project_type"
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={80}
        placeholder={options[0] ?? "Project"}
        aria-invalid={error ? true : undefined}
        className={
          "h-[52px] rounded-xl border border-line-subtle bg-white px-4 text-base text-ink-strong shadow-premium focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/25" +
          (error ? " border-danger focus:border-danger focus:ring-danger/30" : "")
        }
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-xs text-ink-muted">
          Choose a suggestion or type the homeowner&apos;s actual project.
        </p>
      )}
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
          "h-[52px] rounded-xl border border-line-subtle bg-white px-4 text-base font-medium text-ink-strong shadow-premium focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/25 disabled:cursor-not-allowed disabled:opacity-50" +
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
      className="shadow-premium"
    >
      {pending
        ? mode === "create"
          ? "Saving…"
          : "Updating…"
        : mode === "create"
          ? "Build 6-message recovery plan"
          : "Save changes"}
    </Button>
  );
}
