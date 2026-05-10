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

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      manifestFilename: "manifest.json",
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
        skipWaiting: false,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,json,webmanifest}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\/?/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 365,
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
                maxAgeSeconds: 60 * 60 * 24 * 365,
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
