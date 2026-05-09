import type { ElementType } from "react"
import {
  Building2Icon,
  HomeIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UploadIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useAuth } from "@/auth/AuthContext"

const NAV_ITEMS: readonly {
  id: string
  path: string
  labelKey:
    | "nav.bottom.dashboard"
    | "nav.bottom.establishments"
    | "nav.bottom.importData"
    | "nav.bottom.admin"
    | "nav.bottom.settings"
  icon: ElementType
  comingSoon?: boolean
  adminOnly?: boolean
  requiresImport?: boolean
}[] = [
  {
    id: "dashboard",
    path: "/dashboard",
    labelKey: "nav.bottom.dashboard",
    icon: HomeIcon,
  },
  {
    id: "establishments",
    path: "/establishments",
    labelKey: "nav.bottom.establishments",
    icon: Building2Icon,
  },
  {
    id: "import",
    path: "/import",
    labelKey: "nav.bottom.importData",
    icon: UploadIcon,
    requiresImport: true,
  },
  {
    id: "admin",
    path: "/admin",
    labelKey: "nav.bottom.admin",
    icon: ShieldCheckIcon,
    adminOnly: true,
  },
  {
    id: "settings",
    path: "/settings",
    labelKey: "nav.bottom.settings",
    icon: SettingsIcon,
    comingSoon: true,
  },
]

function isRouteActive(path: string, pathname: string): boolean {
  if (path === "/dashboard" || path === "") {
    return pathname === "/dashboard" || pathname === "/" || pathname === ""
  }
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function MobileBottomNav() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin, canImport } = useAuth()

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    if (item.requiresImport && !canImport) return false
    return true
  })

  return (
    <nav
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-lg md:hidden"
      aria-label={t("nav.mobileNavAria")}
    >
      <div
        className="grid gap-1 px-2 pt-2"
        style={{
          gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))`,
        }}
      >
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active =
            isRouteActive(item.path, location.pathname) && !item.comingSoon
          const disabled = Boolean(item.comingSoon)

          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              aria-current={active ? "page" : undefined}
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (!disabled) navigate(item.path)
              }}
              className={cn(
                "relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg p-2 transition-[transform,background-color,color] duration-200",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active && "bg-primary text-primary-foreground shadow-sm",
                !active &&
                  !disabled &&
                  "text-muted-foreground active:bg-accent",
                disabled && "cursor-not-allowed text-muted-foreground/55",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="max-w-full truncate text-[10px] font-medium leading-tight">
                {t(item.labelKey)}
              </span>
              {item.comingSoon && (
                <span
                  className="absolute -top-0.5 end-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold leading-none text-white"
                  aria-hidden
                >
                  !
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
