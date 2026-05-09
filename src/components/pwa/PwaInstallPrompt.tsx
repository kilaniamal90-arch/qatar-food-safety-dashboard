import { XIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const DISMISS_UNTIL_KEY = "pwa-install-dismiss-until"

function isDismissed(): boolean {
  const v = localStorage.getItem(DISMISS_UNTIL_KEY)
  if (!v) return false
  return Date.now() < Number(v)
}

function dismissForAWeek() {
  localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000))
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/** Chromium install banner + Safari iOS “Add to Home Screen” hint. */
export function PwaInstallPrompt() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [iosOnly, setIosOnly] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplay() || isDismissed()) return

    if (isIos()) {
      setIosOnly(true)
      setShow(true)
      return
    }

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setIosOnly(false)
      setShow(true)
    }
    window.addEventListener("beforeinstallprompt", onBip)
    return () => window.removeEventListener("beforeinstallprompt", onBip)
  }, [])

  const onInstall = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    setShow(false)
  }, [deferred])

  const onDismiss = useCallback(() => {
    dismissForAWeek()
    setShow(false)
    setDeferred(null)
  }, [])

  if (!show || isStandaloneDisplay()) return null

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[100] border-t border-border bg-card/95 p-4 shadow-lg backdrop-blur-sm md:bottom-4 md:left-auto md:right-4 md:max-w-md md:rounded-xl md:border",
        rtl ? "text-end" : "text-start",
      )}
      role="region"
      aria-label={t("pwa.installTitle")}
    >
      <button
        type="button"
        className={cn(
          "absolute top-3 rounded-md p-1 text-muted-foreground hover:bg-muted",
          rtl ? "left-3" : "right-3",
        )}
        onClick={onDismiss}
        aria-label={t("pwa.dismiss")}
      >
        <XIcon className="size-4" aria-hidden />
      </button>
      <p className="mb-1 pe-8 text-sm font-semibold text-foreground">{t("pwa.installTitle")}</p>
      <p className="mb-3 text-xs text-muted-foreground">
        {iosOnly ? t("pwa.iosHint") : t("pwa.installBody")}
      </p>
      {deferred ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className="gap-2" onClick={() => void onInstall()}>
            {t("pwa.installCta")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
            {t("pwa.dismiss")}
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={onDismiss}>
          {t("pwa.dismiss")}
        </Button>
      )}
    </div>
  )
}
