import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

/**
 * NOTE ON THE `urlPattern` FUNCTIONS BELOW
 *
 * Workbox serialises each `urlPattern` callback with `Function.prototype.toString()`
 * and drops the source verbatim into the generated sw.js. Anything the callback
 * closes over — a shared `isApi()` helper, a constant — is NOT carried across and
 * becomes a ReferenceError inside the service worker, silently breaking every route.
 * So every predicate here is written self-contained, even though it duplicates.
 *
 * They match on `pathname` only and ignore the host on purpose: the API is a
 * different origin in every deployed environment (see VITE_API_URL).
 */

// Brand colours, mirroring --sidebar-background / --sidebar-primary in src/app/index.css
const BRAND_NAVY = "#0f1729"; // hsl(222 47% 11%)

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // 'prompt', never 'autoUpdate': a picker mid-task must not have the app
      // swapped underneath them. The new version installs but stays waiting until
      // the worker taps "Reload" in <UpdatePrompt />.
      registerType: "prompt",
      // Registration is done explicitly by useRegisterSW() in src/shared/components/pwa.
      injectRegister: null,
      // No service worker in `vite dev` — avoids serving stale cached modules over HMR.
      devOptions: { enabled: false },
      // No `includeAssets` — the icons live in public/ and are already picked up by
      // workbox.globPatterns below. Listing them again just duplicates every icon
      // in the precache manifest.
      manifest: {
        name: "Veerha WMS",
        short_name: "Veerha",
        description:
          "Veerha warehouse management — putaway, picking and stock tasks for warehouse workers.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // Workers hold a phone upright while scanning; never rotate on them.
        orientation: "portrait",
        theme_color: BRAND_NAVY,
        background_color: BRAND_NAVY,
        lang: "en",
        dir: "ltr",
        categories: ["business", "productivity", "utilities"],
        icons: [
          { src: "/pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        // Long-pressing the installed icon jumps straight into a task.
        shortcuts: [
          {
            name: "My Tasks",
            short_name: "Tasks",
            description: "Open the worker task list",
            url: "/m",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Pick",
            short_name: "Pick",
            description: "Scan SKUs and record picks",
            url: "/m/pick",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Putaway",
            short_name: "Putaway",
            description: "Scan bins to confirm placement",
            url: "/m/putaway",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
      },
      workbox: {
        // App shell. The main bundle is >2 MiB, so raise the default cap.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // SPA deep links work offline...
        navigateFallback: "/index.html",
        // ...but API and websocket paths must never be answered with index.html,
        // or a 404 from the API turns into a bogus HTML 200.
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        runtimeCaching: [
          // --- NEVER CACHED --------------------------------------------------
          // Auth is network-only, always. A cached login/refresh response — or a
          // cached 401 — would be both a security hole and a permanent lockout.
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/v1/auth"),
            handler: "NetworkOnly",
          },
          // Realtime transport must never be intercepted.
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/socket.io"),
            handler: "NetworkOnly",
          },
          // Workbox only routes GET by default, but be explicit: every API
          // mutation goes straight to the network, always, and is never replayed
          // or served from a cache.
          ...(["POST", "PUT", "PATCH", "DELETE"] as const).map((method) => ({
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly" as const,
            method,
          })),

          // --- SHORT-LIVED READ CACHE ---------------------------------------
          // API reads: always try the network first, but if the warehouse wifi
          // stalls, fall back to a recent copy after 3s so the worker still sees
          // their task list. Only explicit 200s are stored (never 401/404), and
          // entries expire after 5 minutes.
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/v1/auth"),
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "veerha-api-read",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 5, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },

          // --- STATIC THIRD PARTY -------------------------------------------
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "veerha-google-fonts-stylesheets" },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "veerha-google-fonts-webfonts",
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@app": path.resolve(__dirname, "./src/app"),
      "@features": path.resolve(__dirname, "./src/features"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
  build: {
    target: "es2020",
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-tooltip"],
          charts: ["recharts"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
}));
