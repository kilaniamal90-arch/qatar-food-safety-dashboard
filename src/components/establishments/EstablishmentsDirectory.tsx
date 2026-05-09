import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import { SearchIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { EstablishmentCard } from "@/components/establishments/EstablishmentCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import type { Establishment } from "@/data/mockBuilder"
import { AREAS, ACTIVITY_TYPES } from "@/data/mockBuilder"
import { useDebounce } from "@/hooks/useDebounce"
import { filterEstablishments } from "@/lib/inspectionStats"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 12

export function EstablishmentsDirectory({
  establishments,
  className,
}: {
  establishments: Establishment[]
  className?: string
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const debounced = useDebounce(search, 280)
  const [area, setArea] = useState("all")
  const [activity, setActivity] = useState("all")
  const [status, setStatus] = useState<Establishment["status"] | "all">("all")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const sentinelRef = useRef<HTMLDivElement>(null)

  const baseFiltered = useMemo(() => {
    return filterEstablishments(establishments, {
      area,
      activityType: activity,
    }).filter((e) => (status === "all" ? true : e.status === status))
  }, [establishments, area, activity, status])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return baseFiltered
    return baseFiltered.filter((e) => {
      const hay = `${e.name} ${e.crNumber} ${e.location} ${e.area}`.toLowerCase()
      return hay.includes(q)
    })
  }, [baseFiltered, debounced])

  useEffect(() => {
    startTransition(() => {
      setVisibleCount(PAGE_SIZE)
    })
  }, [debounced])

  const resetPaging = () => {
    startTransition(() => {
      setVisibleCount(PAGE_SIZE)
    })
  }

  const visible = filtered.slice(
    0,
    Math.min(visibleCount, filtered.length),
  )
  const canLoadMore = visibleCount < filtered.length

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !canLoadMore) return

    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries[0]?.isIntersecting
        if (hit) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length))
        }
      },
      { rootMargin: "160px" },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [canLoadMore, filtered.length])

  const selectClass =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className={cn("space-y-6", className)}>
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label className="sr-only" htmlFor="est-search">
              {t("establishments.searchPlaceholder")}
            </Label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="est-search"
                className="ps-10"
                placeholder={t("establishments.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="est-area">{t("establishments.area")}</Label>
            <select
              id="est-area"
              className={selectClass}
              value={area}
              onChange={(e) => {
                setArea(e.target.value)
                resetPaging()
              }}
            >
              <option value="all">{t("establishments.all")}</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="est-activity">{t("establishments.activity")}</Label>
            <select
              id="est-activity"
              className={selectClass}
              value={activity}
              onChange={(e) => {
                setActivity(e.target.value)
                resetPaging()
              }}
            >
              <option value="all">{t("establishments.all")}</option>
              {ACTIVITY_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:max-w-xs">
          <Label htmlFor="est-status">{t("establishments.status")}</Label>
          <select
            id="est-status"
            className={selectClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Establishment["status"] | "all")
              resetPaging()
            }}
          >
            <option value="all">{t("establishments.all")}</option>
            <option value="Open">{t("establishments.statusLabel.Open")}</option>
            <option value="Closed">
              {t("establishments.statusLabel.Closed")}
            </option>
            <option value="Under Review">
              {t("establishments.statusLabel.Under Review")}
            </option>
          </select>
        </div>
      </div>

      {search === debounced ? (
        <p className="text-sm text-muted-foreground">
          {t("establishments.showing", { count: visible.length, total: filtered.length })}
        </p>
      ) : null}

      {search !== debounced ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("establishments.noResults")}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((e) => (
              <EstablishmentCard key={e.id} e={e} />
            ))}
          </div>
          {canLoadMore ? (
            <div className="flex flex-col items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length))
                }
              >
                {t("establishments.loadMore")}
              </Button>
              <div ref={sentinelRef} className="h-2 w-full" aria-hidden />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
