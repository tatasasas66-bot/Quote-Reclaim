"use client";

import * as React from "react";

export type AppThemePreference = "system" | "light" | "dark";
type ResolvedAppTheme = "light" | "dark";

type AppThemeContextValue = {
  preference: AppThemePreference;
  resolvedTheme: ResolvedAppTheme;
  setPreference: (preference: AppThemePreference) => void;
};

const STORAGE_KEY = "qr:app-theme";
const DEFAULT_THEME: AppThemePreference = "system";

const AppThemeContext = React.createContext<AppThemeContextValue | null>(null);

const bootstrapScript = `
(() => {
  try {
    const stored = localStorage.getItem("${STORAGE_KEY}");
    const preference = stored === "light" || stored === "dark" ? stored : "system";
    const resolved = preference === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    const root = document.currentScript && document.currentScript.parentElement;
    if (root) {
      root.dataset.appTheme = resolved;
      root.dataset.themePreference = preference;
      root.style.colorScheme = resolved;
    }
  } catch {}
})();
`;

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] =
    React.useState<AppThemePreference>(readStoredPreference);
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedAppTheme>(
    () => resolveTheme(readStoredPreference()),
  );

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateResolvedTheme = () => {
      setResolvedTheme(preference === "system" ? themeFromMedia(media) : preference);
    };

    updateResolvedTheme();
    if (preference !== "system") return;

    media.addEventListener("change", updateResolvedTheme);
    return () => media.removeEventListener("change", updateResolvedTheme);
  }, [preference]);

  const setPreference = React.useCallback(
    (nextPreference: AppThemePreference) => {
      setPreferenceState(nextPreference);
      setResolvedTheme(resolveTheme(nextPreference));
      try {
        window.localStorage.setItem(STORAGE_KEY, nextPreference);
      } catch {
        // Theme selection still works for this session when storage is blocked.
      }
    },
    [],
  );

  const value = React.useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return (
    <AppThemeContext.Provider value={value}>
      <div
        id="qr-app-theme-root"
        data-app-theme={resolvedTheme}
        data-theme-preference={preference}
        className="app-theme-root min-h-screen bg-canvas text-ink"
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: bootstrapScript }} />
        {children}
      </div>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeContextValue {
  const context = React.useContext(AppThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used inside AppThemeProvider");
  }
  return context;
}

function readStoredPreference(): AppThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function resolveTheme(preference: AppThemePreference): ResolvedAppTheme {
  if (preference !== "system") return preference;
  if (typeof window === "undefined") return "light";
  return themeFromMedia(window.matchMedia("(prefers-color-scheme: dark)"));
}

function themeFromMedia(media: MediaQueryList): ResolvedAppTheme {
  return media.matches ? "dark" : "light";
}
