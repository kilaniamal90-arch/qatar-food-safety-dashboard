import { Loader2Icon } from "lucide-react"
import { MotionConfig, motion } from "framer-motion"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"

import { useAuth } from "@/auth/AuthContext"
import { DashboardEventsBar } from "@/components/dashboard/DashboardEventsBar"
import {
  DashboardFilters,
} from "@/components/dashboard/DashboardFilters"
import { EstablishmentsCard } from "@/components/dashboard/EstablishmentsCard"
import { EstablishmentsTable } from "@/components/dashboard/EstablishmentsTable"
import { InspectionsCard } from "@/components/dashboard/InspectionsCard"
import { RatingsTrendChart } from "@/components/dashboard/RatingsTrendChart"
import { WelcomeCard } from "@/components/dashboard/WelcomeCard"
import type { AreaFilter, YearFilter } from "@/data/rawData"
import { useFilterAreas } from "@/hooks/useFilterAreas"
import { useDashboardRemote } from "@/hooks/useDashboardRemote"
import { useYears } from "@/hooks/useYears"
import {
  dashboardSectionContainer,
  dashboardSectionItem,
} from "@/lib/dashboardMotion"
import { useTranslation } from "react-i18next"

/** Non-admins must never query with `all`; map to `my-areas` until the UI selection catches up. */
function resolveRemoteDashboardArea(
  isAdmin: boolean,
  area: AreaFilter,
  assignedIds: readonly string[],
): AreaFilter {
  if (isAdmin) return area
  if (assignedIds.length === 0) return "my-areas"
  if (area === "all") return "my-areas"
  return area
}

export function DashboardPage() {
  const { t } = useTranslation()
  const { user, isAdmin } = useAuth()
  const [year, setYear] = useState<YearFilter>(() => String(new Date().getFullYear()))
  const [area, setArea] = useState<AreaFilter>("all")
  const location = useLocation()
  const prevPathRef = useRef<string | null>(null)

  const {
    data: areas,
    loading: areasLoading,
    refetch: refetchAreas,
  } = useFilterAreas()

  const {
    data: activeYearRows,
    loading: yearsLoading,
    refetch: refetchYears,
  } = useYears()

  const yearOptions = useMemo(
    () =>
      activeYearRows
        .map((r) => r.year)
        .filter((y) => Number.isFinite(y) && y > 0)
        .map((y) => String(y)),
    [activeYearRows],
  )

  useEffect(() => {
    if (yearsLoading) return
    if (yearOptions.length === 0) return
    if (!yearOptions.includes(year)) {
      setYear(yearOptions[yearOptions.length - 1]!)
    }
  }, [yearsLoading, yearOptions, year])

  useEffect(() => {
    const prev = prevPathRef.current
    prevPathRef.current = location.pathname
    if (location.pathname === "/dashboard" && prev !== null && prev !== "/dashboard") {
      refetchAreas()
      refetchYears()
    }
  }, [location.pathname, refetchAreas, refetchYears])

  useLayoutEffect(() => {
    if (isAdmin) return
    if (user.areas.length === 0) return
    setArea((a) => {
      if (a !== "all") return a
      return user.areas.length >= 2 ? "my-areas" : a
    })
  }, [isAdmin, user.areas])

  useLayoutEffect(() => {
    if (isAdmin || areasLoading) return
    if (user.areas.length !== 1) return
    const row = areas.find((x) => x.id === user.areas[0])
    if (!row) return
    setArea((a) =>
      a === "all" || a === "my-areas" ? (row.nameAr as AreaFilter) : a,
    )
  }, [isAdmin, areasLoading, user.areas, areas])

  useEffect(() => {
    if (area === "all" || area === "my-areas") return
    if (areasLoading) return
    const ok = areas.some((a) => a.nameAr === area || a.nameEn === area)
    if (!ok) {
      setArea(
        isAdmin
          ? "all"
          : user.areas.length >= 2
            ? "my-areas"
            : user.areas.length === 1
              ? ((areas.find((x) => x.id === user.areas[0])?.nameAr as AreaFilter) ??
                "my-areas")
              : "all",
      )
    }
  }, [areas, area, areasLoading, isAdmin, user.areas])

  const remoteArea = useMemo(
    () => resolveRemoteDashboardArea(isAdmin, area, user.areas),
    [isAdmin, area, user.areas],
  )

  const {
    loading,
    error,
    processedData,
    inspectionsTrendPct,
    tableRows,
    establishments,
    inspectionsAll,
  } = useDashboardRemote(
    year,
    remoteArea,
    areas,
    areasLoading,
    t("common.dateUnknown"),
    user.areas,
  )

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className="mx-auto max-w-[1400px] space-y-6"
        initial="hidden"
        animate="show"
        variants={dashboardSectionContainer}
      >
        <motion.div variants={dashboardSectionItem}>
          <DashboardFilters
            year={year}
            yearOptions={yearOptions}
            yearsLoading={yearsLoading}
            area={area}
            areas={areas}
            areasLoading={areasLoading}
            onYearChange={setYear}
            onAreaChange={setArea}
            onRefreshAreas={refetchAreas}
          />
        </motion.div>

        {loading ? (
          <motion.div
            variants={dashboardSectionItem}
            className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card py-16 shadow-sm"
            role="status"
            aria-live="polite"
          >
            <Loader2Icon className="size-10 animate-spin text-primary" aria-hidden />
            <p className="text-muted-foreground text-sm font-medium">Loading dashboard…</p>
          </motion.div>
        ) : error ? (
          <motion.div
            variants={dashboardSectionItem}
            className="rounded-2xl border border-destructive/40 bg-destructive/10 px-6 py-10 text-center text-destructive text-sm"
          >
            {error}
          </motion.div>
        ) : (
          <>
            <motion.div variants={dashboardSectionItem}>
              <WelcomeCard />
            </motion.div>

            <motion.div
              variants={dashboardSectionItem}
              className="grid grid-cols-1 gap-6 md:grid-cols-2"
            >
              <EstablishmentsCard
                total={processedData.establishments.total}
                statusBreakdown={processedData.inspections.statusBreakdown}
              />
              <InspectionsCard
                total={processedData.inspections.total}
                ratingBreakdown={processedData.establishments.ratingBreakdown}
                trendPct={inspectionsTrendPct}
                year={year}
              />
            </motion.div>

            <motion.div variants={dashboardSectionItem}>
              <RatingsTrendChart
                key={`ratings-trend-${remoteArea}-${establishments.length}-${inspectionsAll.length}`}
                establishments={establishments}
                inspectionsAll={inspectionsAll}
                area={remoteArea}
                areas={areas}
              />
            </motion.div>

            <motion.div variants={dashboardSectionItem} className="mt-2">
              <EstablishmentsTable data={tableRows} />
            </motion.div>
          </>
        )}
      </motion.div>
      {!loading && !error ? (
        <>
          <div className="h-20 shrink-0 md:h-12" aria-hidden />
          <DashboardEventsBar year={year} />
        </>
      ) : null}
    </MotionConfig>
  )
}
