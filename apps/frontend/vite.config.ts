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

/**
 * Vendor chunks. Same four groups as before, but matched against the *package
 * root* rather than by handing rollup a bare package name.
 *
 * That distinction is load-bearing. The object form
 * (`manualChunks: { charts: ["recharts"] }`) sweeps recharts' whole dependency
 * closure into the `charts` chunk — including micro-libraries like clsx that
 * the app shell also uses. One `import { clsx }` from the entry then makes the
 * 410 kB charts chunk a *static* import of the entry, so every worker
 * downloaded and parsed all of recharts at boot no matter which route they
 * opened. Scoping each group to its own package files leaves those shared
 * micro-deps where rollup can place them sensibly, and keeps recharts reachable
 * only through the lazy report routes that actually render a chart.
 */
const VENDOR_CHUNKS: Array<readonly [string, readonly string[]]> = [
  [
    "vendor",
    [
      "react",
      "react-dom",
      "react-router-dom",
      // clsx / cva / tailwind-merge back the `cn()` helper in
      // src/shared/lib/utils.ts, which practically every component calls. They
      // are shared by eager and lazy code alike, and left unpinned rollup
      // parked them inside the `charts` chunk — which is precisely what made
      // the entry statically import all 410 kB of recharts. Pinning them to
      // the shell chunk they belong in keeps that edge from re-forming.
      "clsx",
      "class-variance-authority",
      "tailwind-merge",
    ],
  ],
  [
    "ui",
    [
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
    ],
  ],
  ["charts", ["recharts"]],
  ["query", ["@tanstack/react-query"]],
];

function manualChunks(id: string): string | undefined {
  const segments = id.split("node_modules/");
  if (segments.length < 2) return undefined;
  const pkgPath = segments[segments.length - 1];
  for (const [chunk, packages] of VENDOR_CHUNKS) {
    if (packages.some((p) => pkgPath === p || pkgPath.startsWith(`${p}/`))) {
      return chunk;
    }
  }
  return undefined;
}

/**
 * Libraries that must never end up in the boot payload. Each is only used by a
 * lazy desktop route (charts on reports/analytics, PDF on invoices and POs,
 * xlsx in the import/export dialogs), and together they are the bulk of what
 * made the old precache 3.5 MiB.
 */
const LAZY_ONLY_PACKAGES = ["recharts", "jspdf", "xlsx", "html2canvas"];

/**
 * Files the browser loads before the app can paint: the HTML entry chunk plus
 * everything it reaches through *static* imports. Populated during
 * generateBundle by the plugin below and read afterwards by the workbox
 * manifestTransform, so the precache is derived from the real module graph
 * instead of a filename convention that quietly rots.
 */
const bootFiles = new Set<string>();

function bootGraphPlugin() {
  return {
    name: "veerha-boot-graph",
    generateBundle(_options: unknown, bundle: Record<string, any>) {
      bootFiles.clear();

      const visit = (fileName: string) => {
        if (bootFiles.has(fileName)) return;
        const chunk = bundle[fileName];
        if (!chunk || chunk.type !== "chunk") return;
        bootFiles.add(fileName);
        // `imports` is static only — `dynamicImports` is exactly what we want
        // to leave out, because those are the React.lazy() route chunks.
        for (const imported of chunk.imports as string[]) visit(imported);
      };

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk" && chunk.isEntry) visit(fileName);
      }

      // Guard the whole point of the split: if a refactor ever makes one of
      // these reachable from the entry by a static import again, fail the build
      // here rather than silently restoring a multi-megabyte install payload.
      const leaked = [...bootFiles].flatMap((file) =>
        ((bundle[file].moduleIds ?? []) as string[])
          .filter((id) =>
            LAZY_ONLY_PACKAGES.some(
              (p) => id.includes(`node_modules/${p}/`) || id.includes(`node_modules/${p}@`)
            )
          )
          .map((id) => `${file} <- ${id}`)
      );

      if (leaked.length > 0) {
        throw new Error(
          `[veerha-boot-graph] These lazy-only libraries are statically reachable from the ` +
            `entry chunk and would be downloaded at boot:\n  ${leaked.join("\n  ")}`
        );
      }
    },
  };
}

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
    // Must run before VitePWA: it fills `bootFiles`, which the manifestTransform
    // below reads to decide what belongs in the precache.
    bootGraphPlugin(),
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
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        /**
         * Precache the app shell, not the whole app.
         *
         * The glob above sweeps up every emitted .js, which used to mean a
         * worker installing the PWA over warehouse wifi downloaded all of it —
         * reports, analytics, settings, recharts, jspdf, xlsx — for desktop
         * screens their role cannot open.
         *
         * So drop any JS that the entry does not reach through a *static*
         * import. `bootFiles` is computed from the real rollup graph in
         * generateBundle (see bootGraphPlugin), which runs before the service
         * worker is generated, so this stays correct as routes move between
         * eager and lazy instead of drifting from a filename convention.
         *
         * Non-JS entries — index.html, the CSS, icons, the webmanifest — are
         * always kept: they are the shell itself.
         *
         * Everything dropped here is still cached on first use by the
         * veerha-app-assets rule below, so a screen a user has opened once
         * keeps working offline.
         */
        manifestTransforms: [
          (entries: Array<{ url: string }>) => {
            const manifest = entries.filter((entry) => {
              const file = entry.url.replace(/^\//, "");
              if (!file.endsWith(".js")) return true;
              // workbox-window is dynamically imported by <PwaShell />, so it is
              // not in the static graph — but it is what registers the service
              // worker and drives the update prompt, so keep it in the shell.
              if (/(^|\/)workbox-window/.test(file)) return true;
              return bootFiles.has(file);
            });
            return { manifest };
          },
        ],
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

          // --- LAZY ROUTE CHUNKS --------------------------------------------
          // The route chunks dropped from the precache above. Cache each one
          // the first time a navigation pulls it in, so a screen the user has
          // already opened still works offline. CacheFirst is safe because
          // every filename is content-hashed: a changed chunk is a new URL, so
          // a stale hit is impossible. Precached shell files never reach this
          // route — the precache handler is registered first.
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/assets/") &&
              (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")),
            handler: "CacheFirst",
            options: {
              cacheName: "veerha-app-assets",
              expiration: { maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
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
        manualChunks,
      },
    },
  },
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
}));
