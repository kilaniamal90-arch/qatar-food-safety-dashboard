import { useState } from "react"
import { useTranslation } from "react-i18next"

import type { ManagedEvent } from "@/admin/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import type { YearFilter } from "@/data/rawData"
import { useAllYearEventsForYear, useUpcomingEventsForYear } from "@/hooks/useEvents"
import { toIsoDateLocal } from "@/lib/dateIsoLocal"
import { cn } from "@/lib/utils"

function formatEventDate(iso: string, arabic: boolean): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(
    arabic ? "ar-QA-u-nu-latn" : "en-US",
  )
}

function eventTitle(ev: ManagedEvent, ar: boolean) {
  return ar ? ev.titleAr : ev.titleEn
}

function eventArea(ev: ManagedEvent, ar: boolean) {
  const primary = ar ? ev.areaNameAr : ev.areaNameEn
  if (primary?.trim()) return primary.trim()
  const fb = ar ? ev.areaNameEn : ev.areaNameAr
  if (fb?.trim()) return fb.trim()
  return "—"
}

function eventDescription(ev: ManagedEvent, ar: boolean) {
  const d = ar ? ev.descriptionAr : ev.descriptionEn
  return d?.trim() ? d : null
}

function isPastEventDate(iso: string, todayIso: string): boolean {
  return iso < todayIso
}

export function DashboardEventsBar({ year }: { year: YearFilter }) {
  const { t, i18n } = useTranslation()
  const ar = i18n.language?.toLowerCase().startsWith("ar")
  const rtl = i18n.dir() === "rtl"

  const {
    data: upcomingEvents,
    loading,
    error,
  } = useUpcomingEventsForYear(year)
  const {
    data: allYearEvents,
    loading: modalLoading,
    error: modalError,
  } = useAllYearEventsForYear(year)
  const [modalOpen, setModalOpen] = useState(false)

  const todayIso = toIsoDateLocal(new Date())

  const renderSegments = (keyPrefix: string) =>
    upcomingEvents.map((ev, i) => (
      <span
        key={`${keyPrefix}-${ev.id}-${i}`}
        className="inline-flex items-center gap-1 whitespace-nowrap"
      >
        {i > 0 ? <span className="text-white/50">|</span> : null}
        <span className="text-lg leading-none">{ev.icon || "🎯"}</span>
        <span>
          {eventTitle(ev, ar)}{" "}
          <span className="text-white/85">
            ({eventArea(ev, ar)}, {formatEventDate(ev.eventDate, ar)})
          </span>
        </span>
      </span>
    ))

  const hasTicker = upcomingEvents.length > 0 && !error

  return (
    <>
      <div
        className={cn(
          "fixed inset-x-0 z-40 border-t border-[#D4AF37]/45 bg-gradient-to-r from-[#5c0e24] via-[#7a122f] to-[#5c0e24] shadow-[0_-6px_28px_rgba(0,0,0,0.18)] backdrop-blur-sm",
          "dark:from-[#2a0610] dark:via-[#420a18] dark:to-[#2a0610] dark:border-[#D4AF37]/35",
          "pb-[env(safe-area-inset-bottom)]",
          "bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:bottom-0",
        )}
        role="region"
        aria-label={t("dashboard.events.ariaBar")}
      >
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-2.5 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:min-w-0 sm:flex-1 sm:justify-start">
            <Badge
              variant="secondary"
              className="border border-white/25 bg-white/15 text-xs font-semibold text-white shadow-none hover:bg-white/20"
            >
              {t("dashboard.events.countBadge", { count: upcomingEvents.length })}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-[#D4AF37]/60 bg-black/15 text-xs font-semibold text-white hover:bg-black/25 hover:text-white sm:hidden"
              onClick={() => setModalOpen(true)}
            >
              {t("dashboard.events.viewAll")}
            </Button>
          </div>

          <div className="min-h-8 min-w-0 flex-1 sm:flex-[2]">
            {loading ? (
              <p className="px-1 text-center text-xs text-white/80 sm:text-start md:text-sm">
                {t("dashboard.events.loading")}
              </p>
            ) : error ? (
              <p className="px-1 text-center text-xs text-red-200 sm:text-start">{error}</p>
            ) : upcomingEvents.length === 0 ? (
              <p className="px-1 text-center text-xs text-white/80 sm:text-start md:text-sm">
                {t("dashboard.events.empty")}
              </p>
            ) : (
              <div
                className={cn(
                  "events-marquee-outer relative overflow-hidden rounded-lg bg-black/15 py-1 text-[11px] text-white ring-1 ring-inset ring-white/10 [--events-marquee-duration:36s] sm:text-xs md:text-sm",
                )}
              >
                {hasTicker ? (
                  <div className="events-marquee-track flex w-max text-white/95" dir="ltr">
                    <span className="inline-flex shrink-0 items-center gap-2 px-4">
                      <span className="shrink-0 text-base" aria-hidden>
                        📢
                      </span>
                      <span className="shrink-0 font-bold text-[#F5E6A8]">
                        {t("dashboard.events.tickerLabel")}:
                      </span>
                      <span className="inline-flex items-center gap-x-1 gap-y-0.5">
                        {renderSegments("a")}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-2 px-4" aria-hidden>
                      <span className="shrink-0 text-base">📢</span>
                      <span className="shrink-0 font-bold text-[#F5E6A8]">
                        {t("dashboard.events.tickerLabel")}:
                      </span>
                      <span className="inline-flex items-center gap-x-1 gap-y-0.5">
                        {renderSegments("b")}
                      </span>
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="hidden shrink-0 sm:block">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-[#D4AF37]/60 bg-black/15 text-xs font-semibold text-white hover:bg-black/25 hover:text-white"
              onClick={() => setModalOpen(true)}
            >
              {t("dashboard.events.viewAll")}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-h-[min(85vh,calc(100dvh-2rem))] max-w-lg sm:max-w-2xl"
          dir={rtl ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle className={cn(rtl && "text-end")}>
              {t("dashboard.events.modalTitle", { year })}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(65vh,32rem)] space-y-0 overflow-y-auto pe-1">
            {modalLoading ? (
              <p className="text-sm text-muted-foreground">{t("dashboard.events.loading")}</p>
            ) : modalError ? (
              <p className="text-sm text-destructive">{modalError}</p>
            ) : allYearEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dashboard.events.modalEmpty")}</p>
            ) : (
              allYearEvents.map((ev, idx) => {
                const past = isPastEventDate(ev.eventDate, todayIso)
                return (
                  <div key={ev.id}>
                    {idx > 0 ? <Separator className="my-4" /> : null}
                    <div
                      className={cn(
                        "flex gap-3 rounded-lg px-1 py-0.5 transition-colors",
                        past && "opacity-80",
                      )}
                    >
                      <span
                        className={cn(
                          "text-2xl leading-none",
                          past && "grayscale-[0.35]",
                        )}
                        aria-hidden
                      >
                        {ev.icon || "🎯"}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div
                          className={cn(
                            "flex flex-wrap items-center gap-2",
                            rtl ? "flex-row-reverse" : "flex-row",
                          )}
                        >
                          <p
                            className={cn(
                              "font-semibold leading-snug",
                              past ? "text-muted-foreground" : "text-foreground",
                            )}
                          >
                            {eventTitle(ev, ar)}
                          </p>
                          {past ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-semibold uppercase tracking-wide",
                                "border-muted-foreground/40 text-muted-foreground",
                              )}
                            >
                              {t("dashboard.events.pastLabel")}
                            </Badge>
                          ) : null}
                        </div>
                        {eventDescription(ev, ar) ? (
                          <p
                            className={cn(
                              "text-sm leading-relaxed",
                              past ? "text-muted-foreground/90" : "text-muted-foreground",
                            )}
                          >
                            {eventDescription(ev, ar)}
                          </p>
                        ) : null}
                        <p
                          className={cn(
                            "text-sm",
                            past ? "text-muted-foreground/90" : "text-muted-foreground",
                          )}
                        >
                          {eventArea(ev, ar)} · {formatEventDate(ev.eventDate, ar)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
