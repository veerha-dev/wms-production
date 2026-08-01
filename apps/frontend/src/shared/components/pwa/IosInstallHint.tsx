import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";

const DISMISSED_KEY = "veerha_ios_install_hint_dismissed";
const SHOW_AFTER_MS = 4000;

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return iosStandalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Private mode / storage disabled — just don't nag.
    return true;
  }
}

/**
 * One-time hint for iOS Safari, which has no `beforeinstallprompt` and therefore no
 * way to offer installation programmatically. Without this, an iPhone-carrying
 * worker has no idea the app can live on their home screen at all.
 */
export function IosInstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIos() || isStandalone() || wasDismissed()) return;
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* nothing we can do, and nothing worth breaking over */
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Install Veerha on your home screen"
      className="fixed inset-x-3 bottom-3 z-[90] rounded-xl border border-border bg-card p-3 text-card-foreground shadow-lg"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <SquarePlus className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1 text-sm">
          <p className="font-semibold">Add Veerha to your Home Screen</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            Tap
            <Share className="inline h-3.5 w-3.5" aria-label="the Share button" />
            in Safari, then <span className="font-medium">Add to Home Screen</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install hint"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
