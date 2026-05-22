"use client";

import * as React from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type SelectOption = { value: string; label: string };

type SelectProps = {
  label: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  name?: string;
  id?: string;
  disabled?: boolean;
};

export function Select({
  label,
  options,
  placeholder,
  error,
  required,
  id,
  ...rest
}: SelectProps) {
  const generatedId = React.useId();
  const triggerId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={triggerId} className="text-sm font-medium text-ink">
        {label}
        {required ? <span aria-hidden="true" className="text-brand"> *</span> : null}
      </label>
      <RadixSelect.Root
        value={rest.value}
        defaultValue={rest.defaultValue}
        onValueChange={rest.onValueChange}
        name={rest.name}
        disabled={rest.disabled}
      >
        <RadixSelect.Trigger
          id={triggerId}
          aria-invalid={error ? true : undefined}
          className={cn(
            "flex h-11 items-center justify-between gap-2 rounded-lg border border-line-subtle bg-surface-2 px-3 text-base text-ink-strong",
            "focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-danger",
          )}
        >
          <RadixSelect.Value
            placeholder={<span className="text-ink-muted">{placeholder ?? "Select…"}</span>}
          />
          <RadixSelect.Icon aria-hidden="true">
            <ChevronDown className="h-4 w-4 text-ink-muted" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={6}
            className="z-50 overflow-hidden rounded-lg border border-line-subtle bg-surface-2 shadow-xl"
          >
            <RadixSelect.Viewport className="p-1">
              {options.map((opt) => (
                <RadixSelect.Item
                  key={opt.value}
                  value={opt.value}
                  className={cn(
                    "relative flex h-10 cursor-pointer items-center rounded-md pl-7 pr-3 text-base text-ink outline-none",
                    "data-[highlighted]:bg-surface-3 data-[highlighted]:text-ink-strong",
                  )}
                >
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="absolute left-2 inline-flex items-center">
                    <Check className="h-4 w-4 text-brand" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
