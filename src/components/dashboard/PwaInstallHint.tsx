"use client";

import * as React from "react";
import { Download, Share } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallHint() {
  const [prompt, setPrompt] = React.useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = React.useState(false);
  const [standalone, setStandalone] = React.useState(true);

  React.useEffect(() => {
    const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
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

  if (standalone || (!prompt && !isIos)) return null;

  return (
    <aside className="flex flex-wrap items-center justify-between gap-3 border border-line-subtle bg-surface-1 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-ink">
        {isIos ? <Share className="h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
        {isIos ? "Tap Share → Add to Home Screen" : "Add Quote Reclaim to your Home Screen"}
      </p>
      {prompt ? (
        <button
          type="button"
          aria-label="Add Quote Reclaim to Home Screen"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
          className="min-h-10 rounded-md bg-brand px-3 py-2 text-xs font-black text-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Add
        </button>
      ) : null}
    </aside>
  );
}
