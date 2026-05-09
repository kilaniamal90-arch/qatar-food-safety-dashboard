import type { ElementType } from "react"
import {
  Building2Icon,
  LayoutDashboardIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UploadIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { NavLink } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useAuth } from "@/auth/AuthContext"

type NavItem = {
  to: string
  labelKey: string
  icon: ElementType
  comingSoon?: boolean
  adminOnly?: boolean
  requiresImport?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboardIcon },
  { to: "/establishments", labelKey: "nav.establishments", icon: Building2Icon },
  { to: "/import", labelKey: "nav.importData", icon: UploadIcon, requiresImport: true },
  { to: "/admin", labelKey: "nav.admin", icon: ShieldCheckIcon, adminOnly: true },
  { to: "/settings", labelKey: "nav.settings", icon: SettingsIcon, comingSoon: true },
]

const navItemBase =
  "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const { isAdmin, canImport } = useAuth()

  const items = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    if (item.requiresImport && !canImport) return false
    return true
  })

  return (
    <nav className="grid gap-1" aria-label={t("header.brand")}>
      {items.map(({ to, labelKey, icon: Icon, comingSoon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/dashboard"}
          onClick={comingSoon ? (e) => e.preventDefault() : onNavigate}
          className={({ isActive }) =>
            cn(
              navItemBase,
              isActive && !comingSoon
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-sidebar-foreground hover:bg-sidebar-accent",
              comingSoon && "cursor-default opacity-70",
            )
          }
          aria-disabled={comingSoon}
          tabIndex={comingSoon ? -1 : undefined}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 truncate">{t(labelKey as "nav.dashboard")}</span>
          {comingSoon && (
            <span className="ms-auto rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white leading-none">
              {t("nav.comingSoon")}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function SidebarBrand() {
  const { t } = useTranslation()
  return (
    <div className="mb-6 flex items-center gap-3 px-1">
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-xl shadow-sm"
        style={{ background: "linear-gradient(135deg, #8B1538 0%, #6B0F2A 100%)" }}
        aria-hidden
      >
        <ShieldAlertIcon className="size-6 text-white" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight text-sidebar-foreground">
          {t("header.brand")}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {t("header.brandSub")}
        </p>
      </div>
    </div>
  )
}

export function SidebarFooter() {
  const { t } = useTranslation()
  return (
    <div className="mt-4 rounded-lg border border-border bg-secondary/40 px-3 py-3 text-center">
      <p className="text-xs font-medium text-muted-foreground">{t("sidebar.version")}</p>
      <p className="mt-0.5 text-xs text-muted-foreground/70">{t("sidebar.copyright")}</p>
    </div>
  )
}

export function SidebarPanel({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "hidden w-[280px] shrink-0 border-e border-border bg-sidebar lg:flex lg:flex-col",
        className,
      )}
    >
      <div className="flex h-full flex-col px-4 py-6">
        <SidebarBrand />
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <SidebarFooter />
      </div>
    </aside>
  )
}
