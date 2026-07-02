"use client";

import { ChevronDown, SunMoon } from "lucide-react";
import {
  type AppThemePreference,
  useAppTheme,
} from "@/components/app/AppThemeProvider";

const THEME_OPTIONS: Array<{
  value: AppThemePreference;
  label: string;
}> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeSelector() {
  const { preference, setPreference } = useAppTheme();

  return (
    <label className="relative inline-flex min-h-10 shrink-0 items-center">
      <span className="sr-only">App theme</span>
      <SunMoon
        className="pointer-events-none absolute left-2 h-4 w-4 text-ink-muted"
        aria-hidden="true"
      />
      <select
        aria-label="App theme"
        value={preference}
        onChange={(event) =>
          setPreference(event.target.value as AppThemePreference)
        }
        className="min-h-10 w-[5.75rem] appearance-none rounded-md border border-line-subtle bg-surface-1 py-2 pl-7 pr-6 text-xs font-semibold text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-ink-muted"
        aria-hidden="true"
      />
    </label>
  );
}
