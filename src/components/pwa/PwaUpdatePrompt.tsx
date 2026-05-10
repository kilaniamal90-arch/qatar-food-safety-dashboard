import { XIcon } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useRegisterSW } from "virtual:pwa-register/react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const AUTO_DISMISS_MS = 30_000

/** Prompt when a new service worker is waiting (`registerType: 'prompt'`, `skipWaiting: false`). */
export function PwaUpdatePrompt() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  useEffect(() => {
    if (!needRefresh) return

    const id = window.setTimeout(() => {
      setNeedRefresh(false)
    }, AUTO_DISMISS_MS)

    return () => window.clearTimeout(id)
  }, [needRefresh, setNeedRefresh])

  const onUpdate = async () => {
    await updateServiceWorker(true)
  }

  const onDismiss = () => {
    setNeedRefresh(false)
  }

  if (!needRefresh) return null

  return (
    <div
      className={cn(
        "pointer-events-auto fixed z-[102] max-md:bottom-16 bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-lg",
        "rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur-sm",
        rtl ? "text-end" : "text-start",
      )}
      role="region"
      aria-live="polite"
      aria-label={t("pwa.updateAria")}
    >
      <button
        type="button"
        className={cn(
          "absolute top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          rtl ? "left-3" : "right-3",
        )}
        onClick={onDismiss}
        aria-label={t("pwa.dismiss")}
      >
        <XIcon className="size-4" aria-hidden />
      </button>
      <p className="mb-3 pe-8 text-sm font-medium leading-snug text-foreground">
        {t("pwa.updateAvailable")}
      </p>
      <Button type="button" size="sm" className="gap-2 font-semibold" onClick={() => void onUpdate()}>
        {t("pwa.updateCta")}
      </Button>
    </div>
  )
}
