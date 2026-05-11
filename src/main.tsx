import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { AppProviders } from "@/components/providers/AppProviders"
import { APP_VERSION } from "@/lib/version"

import App from "./App.tsx"
import "./index.css"

if (import.meta.env.PROD) {
  const VERSION_POLL_MS = 30_000
  setInterval(() => {
    void (async () => {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
        if (!response.ok) return
        const data = (await response.json()) as { version?: string }
        if (data.version && data.version !== APP_VERSION) {
          window.location.reload()
        }
      } catch {
        /* ignore */
      }
    })()
  }, VERSION_POLL_MS)
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </AppProviders>
  </StrictMode>,
)
