import { IosInstallHint } from "./IosInstallHint";
import { OfflineIndicator } from "./OfflineIndicator";
import { UpdatePrompt } from "./UpdatePrompt";

/**
 * Everything PWA-related, in one mount point. Renders no layout of its own — each
 * child is either `null` or a fixed-position overlay — so it is safe to drop at the
 * root of the app without touching desktop or mobile page structure.
 */
export function PwaShell() {
  return (
    <>
      <UpdatePrompt />
      <OfflineIndicator />
      <IosInstallHint />
    </>
  );
}
