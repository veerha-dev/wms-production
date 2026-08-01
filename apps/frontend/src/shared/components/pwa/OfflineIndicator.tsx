import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "./useOnlineStatus";

/**
 * Slim, persistent banner shown whenever the device is offline.
 *
 * This is the most important piece of the PWA for warehouse workers: the app shell
 * keeps working from cache when the signal drops, which makes it *look* like scans
 * are being recorded. They are not — writes are never queued (see the PWA notes in
 * this folder's index.ts). The worker has to be told, unmissably and continuously,
 * that anything they do right now is not reaching the server.
 */
export function OfflineIndicator() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-warning px-3 py-1.5 text-center text-xs font-semibold text-warning-foreground shadow-md"
      style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Offline — changes and scans will not be saved</span>
    </div>
  );
}
