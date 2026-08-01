/**
 * PWA support for Veerha WMS.
 *
 * The target user is a warehouse worker on a cheap Android phone with patchy wifi,
 * using the `/m`, `/m/pick` and `/m/putaway` routes. The goals are (a) the app is
 * installable and launches like a native app, and (b) a dropped signal degrades
 * predictably instead of showing a browser error page.
 *
 * WHAT IS SUPPORTED
 *   - Install to home screen, standalone + portrait, with app shortcuts straight
 *     into My Tasks / Pick / Putaway.
 *   - Offline app shell: the UI loads and deep links resolve with no connection.
 *   - Offline READS: API GETs fall back to a copy at most 5 minutes old when the
 *     network stalls (>3s), so a task list stays on screen between racks.
 *   - Explicit update prompt when a new build ships (never a silent swap).
 *
 * WHAT IS **NOT** SUPPORTED — OFFLINE WRITES
 *   There is no background sync and no write queue. Every POST/PUT/PATCH/DELETE
 *   goes straight to the network and fails if there is no connection. A scan made
 *   offline is LOST, not deferred. Half-implemented write queueing in a WMS loses
 *   stock data, so it is deliberately out of scope; <OfflineIndicator /> exists to
 *   make the limitation impossible to miss while it is in effect.
 *
 * Caching rules live in `vite.config.ts` (the `VitePWA({ workbox })` block).
 */
export { PwaShell } from "./PwaShell";
export { OfflineIndicator } from "./OfflineIndicator";
export { UpdatePrompt } from "./UpdatePrompt";
export { IosInstallHint } from "./IosInstallHint";
export { useOnlineStatus } from "./useOnlineStatus";
