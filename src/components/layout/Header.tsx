import { useCallback, useEffect, useState } from "react"
import { GlobeIcon, MenuIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"

import { SidebarBrand, SidebarNav } from "@/components/layout/Sidebar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { setLocale } from "@/i18n/config"

export function AppHeader({ title }: { title: string }) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  const applyMeta = useCallback(() => {
    document.title = `${title} · ${t("meta.title")}`
  }, [title, t])

  useEffect(() => {
    applyMeta()
  }, [applyMeta, i18n.language])

  const currentLng = i18n.language.startsWith("ar") ? "ar" : "en"

  return (
    <TooltipProvider>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          {/* Mobile menu trigger */}
          <div className="relative flex items-center lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  aria-label="Menu"
                >
                  <MenuIcon className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="start" className="flex flex-col">
                <SheetTitle className="sr-only">{t("header.brand")}</SheetTitle>
                <div className="mt-8">
                  <SidebarBrand />
                  <SidebarNav onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Page title */}
          <div className="min-w-0 flex-1">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
              {title}
            </span>
          </div>

          {/* Controls */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Language */}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" type="button">
                      <GlobeIcon className="size-4" />
                      <span className="sr-only">{t("header.language")}</span>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("header.language")}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("header.language")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={currentLng}
                  onValueChange={(v) => {
                    if (v === "ar" || v === "en") void setLocale(v)
                  }}
                >
                  <DropdownMenuRadioItem value="ar">العربية</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme */}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="relative"
                    >
                      <SunIcon className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                      <MoonIcon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                      <span className="sr-only">{t("header.theme")}</span>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("header.theme")}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("header.theme")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(v) => void setTheme(v)}
                >
                  <DropdownMenuRadioItem value="light">
                    <SunIcon className="me-2 size-4" aria-hidden />
                    {t("header.themeLight")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <MoonIcon className="me-2 size-4" aria-hidden />
                    {t("header.themeDark")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <MonitorIcon className="me-2 size-4" aria-hidden />
                    {t("header.themeSystem")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </TooltipProvider>
  )
}
