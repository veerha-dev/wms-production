import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

const TOAST_ID = "pwa-update-available";

/** How often to ask the server whether a new build exists, while the app is open. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the service worker and, when a new build is waiting, shows a
 * dismissible toast instead of swapping the app out underneath the user.
 *
 * The plugin is configured with `registerType: 'prompt'` precisely so that a
 * picker halfway through a pick list keeps the version they started on until they
 * choose to reload.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Long-lived warehouse sessions rarely reload, so poll for new builds.
      window.setInterval(() => {
        registration.update().catch(() => {
          /* offline or transient — the next tick will retry */
        });
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;

    toast("A new version is available", {
      id: TOAST_ID,
      description: "Reload to pick up the latest tasks and fixes.",
      duration: Infinity,
      action: {
        label: "Reload",
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
      onDismiss: () => setNeedRefresh(false),
    });

    return () => {
      toast.dismiss(TOAST_ID);
    };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
