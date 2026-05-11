import type { LucideIcon } from "lucide-react"
import {
  GlobeIcon,
  InfoIcon,
  LockIcon,
  LogOutIcon,
  MoonIcon,
  PaletteIcon,
  SunIcon,
  UserIcon,
  Loader2Icon,
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useTheme } from "next-themes"

import { useAuth } from "@/auth/AuthContext"
import { ChangePasswordDialog } from "@/features/settings/ChangePasswordDialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { setLocale } from "@/i18n/config"
import { APP_VERSION } from "@/lib/version"
import { cn } from "@/lib/utils"

function SettingsSectionCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border border-border shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border bg-muted/35 px-4 py-4 sm:px-5">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          <Icon className="size-5" />
        </div>
        <h2 className="pt-1.5 text-base font-semibold leading-tight text-foreground sm:text-lg">
          {title}
        </h2>
      </div>
      <div className="space-y-4 px-4 py-5 sm:px-5">{children}</div>
    </Card>
  )
}

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { setTheme, resolvedTheme } = useTheme()
  const { user, signOut } = useAuth()

  const lng = i18n.language.startsWith("ar") ? "ar" : "en"
  const isDark = resolvedTheme === "dark"
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)

  const handleLogout = async () => {
    setLogoutBusy(true)
    try {
      await signOut()
      navigate("/login", { replace: true })
    } finally {
      setLogoutBusy(false)
      setLogoutOpen(false)
    }
  }

  const displayEmail = user.email?.trim() || "—"
  const roleLabel = t(`settings.roles.${user.role}` as "settings.roles.admin")

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-300">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("settings.general")}
        </h1>
      </header>

      <SettingsSectionCard icon={UserIcon} title={t("settings.accountTitle")}>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t("settings.nameLabel")}</dt>
            <dd className="mt-0.5 font-medium text-foreground">{user.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("settings.emailLabel")}</dt>
            <dd className="mt-0.5 font-medium break-all text-foreground">
              {displayEmail}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("settings.roleLabel")}</dt>
            <dd className="mt-0.5 font-medium text-foreground">{roleLabel}</dd>
          </div>
        </dl>
      </SettingsSectionCard>

      <SettingsSectionCard icon={PaletteIcon} title={t("settings.appearanceTitle")}>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <GlobeIcon className="size-4 shrink-0 text-primary" aria-hidden />
              {t("settings.languageLabel")}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={lng === "en" ? "default" : "outline"}
                className="min-w-[7rem]"
                onClick={() => void setLocale("en")}
              >
                {t("settings.languageEnglish")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={lng === "ar" ? "default" : "outline"}
                className="min-w-[7rem]"
                onClick={() => void setLocale("ar")}
              >
                {t("settings.languageArabic")}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              {isDark ? (
                <MoonIcon className="size-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <SunIcon className="size-4 shrink-0 text-primary" aria-hidden />
              )}
              {t("settings.themeLabel")}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={!isDark ? "default" : "outline"}
                className="min-w-[7rem] gap-1.5"
                onClick={() => setTheme("light")}
              >
                <SunIcon className="size-3.5" aria-hidden />
                {t("header.themeLight")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={isDark ? "default" : "outline"}
                className="min-w-[7rem] gap-1.5"
                onClick={() => setTheme("dark")}
              >
                <MoonIcon className="size-3.5" aria-hidden />
                {t("header.themeDark")}
              </Button>
            </div>
          </div>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard icon={LockIcon} title={t("settings.securityTitle")}>
        <Button type="button" onClick={() => setPasswordOpen(true)}>
          {t("settings.changePassword")}
        </Button>
        <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      </SettingsSectionCard>

      <SettingsSectionCard icon={InfoIcon} title={t("settings.appInfoTitle")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{t("settings.appVersionLabel")}</span>
          <span className="font-mono font-semibold text-foreground">{APP_VERSION}</span>
        </div>
      </SettingsSectionCard>

      <Card className="overflow-hidden border border-border shadow-sm">
        <div className="border-b border-border bg-muted/35 px-4 py-4 sm:px-5">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            {t("settings.logoutTitle")}
          </h2>
        </div>
        <div className="px-4 py-5 sm:px-5">
          <Button
            type="button"
            size="lg"
            className={cn(
              "h-12 w-full gap-2.5 text-base font-semibold text-white shadow-md",
              "!bg-red-600 hover:!bg-red-700",
              "focus-visible:ring-2 focus-visible:!ring-red-500 focus-visible:ring-offset-2",
            )}
            onClick={() => setLogoutOpen(true)}
          >
            <LogOutIcon className="size-5 shrink-0" aria-hidden />
            {t("settings.logoutButton")}
          </Button>
        </div>
        <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("settings.logoutConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("settings.logoutConfirmMessage")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={logoutBusy}>
                {t("settings.logoutCancel")}
              </AlertDialogCancel>
              <Button
                className="gap-2 !bg-red-600 text-white hover:!bg-red-700 sm:mt-0"
                disabled={logoutBusy}
                onClick={() => void handleLogout()}
              >
                {logoutBusy ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" aria-hidden />
                    {t("settings.loggingOut")}
                  </>
                ) : (
                  <>
                    <LogOutIcon className="size-4" aria-hidden />
                    {t("settings.logoutConfirm")}
                  </>
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </div>
  )
}
