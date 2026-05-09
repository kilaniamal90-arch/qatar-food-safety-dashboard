import { useTranslation } from "react-i18next"
import { Outlet, useLocation } from "react-router-dom"

import { AppHeader } from "@/components/layout/Header"
import { MobileBottomNav } from "@/components/layout/MobileBottomNav"
import { SidebarPanel } from "@/components/layout/Sidebar"

function useHeaderTitle(): string {
  const { pathname } = useLocation()
  const { t } = useTranslation()

  if (pathname === "/dashboard" || pathname === "/" || pathname === "") {
    return t("dashboard.title")
  }
  if (pathname.startsWith("/establishments")) return t("nav.establishments")
  if (pathname.startsWith("/import") || pathname.startsWith("/data-import"))
    return t("nav.importData")
  if (pathname.startsWith("/admin")) return t("nav.admin")
  if (pathname.startsWith("/settings")) return t("nav.settings")

  return t("meta.title")
}

export function AppLayout() {
  const title = useHeaderTitle()
  const { t } = useTranslation()

  return (
    <div className="flex min-h-svh w-full bg-background">
      <a href="#main-content" className="skip-link">
        {t("header.skipToContent")}
      </a>
      <SidebarPanel />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader title={title} />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <div className="px-4 py-6 pb-24 sm:px-6 md:pb-6">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileBottomNav />
    </div>
  )
}
