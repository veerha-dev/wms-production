import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

/**
 * Tracks browser connectivity.
 *
 * Caveat worth knowing: `navigator.onLine === true` only means the device has *a*
 * network interface, not that the API is reachable. It is still the right signal
 * for the warehouse-floor case (wifi drops out entirely between racks), and it
 * never gives a false "offline".
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
