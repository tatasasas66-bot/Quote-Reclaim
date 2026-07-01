"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className, id, required, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const describedByParts = [
      hint ? `${inputId}-hint` : null,
      error ? `${inputId}-error` : null,
    ].filter((v): v is string => v !== null);
    const describedBy = describedByParts.length > 0 ? describedByParts.join(" ") : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-semibold text-ink-strong">
          {label}
          {required ? <span aria-hidden="true" className="text-brand"> *</span> : null}
        </label>
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "min-h-[52px] rounded-xl border border-line-subtle bg-white px-5 py-3 text-base text-ink-strong shadow-premium",
            "placeholder:text-ink-muted",
            "focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/25",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-danger focus:border-danger focus:ring-danger/30",
            className,
          )}
          {...props}
        />
        {hint && !error ? (
          <p id={`${inputId}-hint`} className="text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={`${inputId}-error`} className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";
