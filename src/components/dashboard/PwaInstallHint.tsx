"use client";

import * as React from "react";
import { Download, Share } from "lucide-react";

const DISMISS_KEY = "qr:pwa-install-dismissed";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallHint() {
  const [prompt, setPrompt] = React.useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = React.useState(false);
  const [standalone, setStandalone] = React.useState(true);
  const [dismissed, setDismissed] = React.useState(false);
  const [storageReady, setStorageReady] = React.useState(false);

  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") {
        setDismissed(true);
      }
    } catch {
      // Storage can be unavailable in private browsing; the hint still works.
    }
    setStorageReady(true);

    const mediaStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;
    const iosStandalone =
      "standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setStandalone(mediaStandalone || iosStandalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!storageReady || dismissed || standalone || (!prompt && !isIos)) {
    return null;
  }

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Local persistence is best-effort.
    }
  }

  return (
    <aside className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-subtle bg-white px-4 py-3 text-sm shadow-premium">
      <p className="flex items-center gap-2 font-semibold text-ink">
        {isIos ? (
          <Share className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {isIos
          ? "Tap Share → Add to Home Screen"
          : "Add Quote Reclaim to your Home Screen"}
      </p>
      <div className="flex items-center gap-2">
        {prompt ? (
          <button
            type="button"
            aria-label="Add Quote Reclaim to Home Screen"
            onClick={async () => {
              await prompt.prompt();
              await prompt.userChoice;
              dismiss();
              setPrompt(null);
            }}
            className="min-h-10 rounded-md bg-brand px-3 py-2 text-xs font-black text-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Add
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Dismiss Add to Home Screen prompt"
          onClick={dismiss}
          className="min-h-10 rounded-md px-3 py-2 text-xs font-bold text-ink-muted hover:text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
