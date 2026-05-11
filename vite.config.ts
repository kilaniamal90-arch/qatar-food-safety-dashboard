import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pwaManifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "public/manifest.json"), "utf8"),
) as NonNullable<import("vite-plugin-pwa").VitePWAOptions["manifest"]>

// PWA icons are manually edited - DO NOT regenerate automatically.
// Icons location: public/pwa-*.png, public/apple-touch-icon.png (also referenced below in includeAssets).
// No build hooks call generate-pwa-icons.mjs; run that script by hand only if you intend to overwrite assets.

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifestFilename: "manifest.json",
      /** Manual PWA icons — keep in sync with public/ (not auto-generated on build). */
      includeAssets: [
        "favicon.svg",
        "logo.png",
        "pwa-64.png",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-512-maskable.png",
        "apple-touch-icon.png",
      ],
      manifest: pwaManifest,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,json,webmanifest}"],
        /** Do not precache live version probe (must stay network-fresh). */
        globIgnores: ["**/version.json"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\/?/, /^\/_/, /\/[^/?]+\.[^/]+$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "google-fonts",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /\.(js|css|html)(?:\?[^#]*)?$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "app-resources",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
