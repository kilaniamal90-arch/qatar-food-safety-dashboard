import { AlertCircle, AlertTriangle, FileSpreadsheet, Filter } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import type { InspectionRating, OperationalStatus } from "@/data/rawData"
import type { TableRow } from "@/data/establishmentsTable"
import { exportFilteredStatusFollowUpToXlsx } from "@/lib/exportFilteredStatusFollowUpTable"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

const RATING_VALUES: InspectionRating[] = [
  "Very Poor",
  "Poor",
  "Fair",
  "Good",
  "Very Good",
  "Excellent",
]

function ratingTranslationKey(rating: InspectionRating): string {
  const map: Record<InspectionRating, string> = {
    Excellent: "ratings.excellent",
    "Very Good": "ratings.veryGood",
    Good: "ratings.good",
    Fair: "ratings.fair",
    Poor: "ratings.poor",
    "Very Poor": "ratings.veryPoor",
  }
  return map[rating]
}

function ratingTextForExcel(row: TableRow, tl: (key: string) => string): string {
  if (row.rating == null) return tl("table.noRating")
  return tl(ratingTranslationKey(row.rating))
}

function statusTextForExcel(
  row: TableRow,
  tl: (key: string) => string,
): string {
  if (row.operationalStatusForYear == null) {
    return tl("dashboard.statusUndetermined")
  }
  const keys: Record<OperationalStatus, string> = {
    Open: "dashboard.open",
    Closed: "dashboard.closed",
    "Temporary Closed": "dashboard.temporaryClosed",
    "Open Soon": "dashboard.openSoon",
  }
  return tl(keys[row.operationalStatusForYear])
}

export function RatingBadge({
  rating,
  displayLabel,
}: {
  rating: InspectionRating
  /** When set (e.g. DB `name_ar` / `name_en`), shown instead of i18n. */
  displayLabel?: string | null
}) {
  const { t } = useTranslation()

  const configs: Record<
    InspectionRating,
    { cls: string; labelKey: string }
  > = {
    Excellent: {
      cls: "border-green-300 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400",
      labelKey: "ratings.excellent",
    },
    "Very Good": {
      cls: "border-lime-300 bg-lime-100 text-lime-700 dark:border-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
      labelKey: "ratings.veryGood",
    },
    Good: {
      cls: "border-yellow-300 bg-yellow-100 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      labelKey: "ratings.good",
    },
    Fair: {
      cls: "border-orange-300 bg-orange-100 text-orange-700 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      labelKey: "ratings.fair",
    },
    Poor: {
      cls: "border-red-300 bg-red-100 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400",
      labelKey: "ratings.poor",
    },
    "Very Poor": {
      cls: "border-red-400 bg-red-200 text-red-800 dark:border-red-600 dark:bg-red-900/50 dark:text-red-300",
      labelKey: "ratings.veryPoor",
    },
  }

  const config = configs[rating]
  const label =
    displayLabel && displayLabel.trim() !== ""
      ? displayLabel.trim()
      : t(config.labelKey)

  return (
    <span
      className={cn(
        "inline-flex shrink-0 whitespace-nowrap items-center rounded-full border px-3 py-1 text-xs font-medium",
        config.cls,
      )}
    >
      {label}
    </span>
  )
}

function OperationalStatusCell({ row }: { row: TableRow }) {
  const { t } = useTranslation()
  if (row.operationalStatusForYear == null) {
    return (
      <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
        {t("dashboard.statusUndetermined")}
      </span>
    )
  }

  const configs: Record<
    OperationalStatus,
    { cls: string; labelKey: string }
  > = {
    Open: {
      cls: "border-green-300 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400",
      labelKey: "dashboard.open",
    },
    Closed: {
      cls: "border-red-300 bg-red-100 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400",
      labelKey: "dashboard.closed",
    },
    "Temporary Closed": {
      cls: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      labelKey: "dashboard.temporaryClosed",
    },
    "Open Soon": {
      cls: "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
      labelKey: "dashboard.openSoon",
    },
  }

  const config = configs[row.operationalStatusForYear]
  return (
    <span
      className={cn(
        "inline-flex shrink-0 whitespace-nowrap items-center rounded-full border px-3 py-1 text-xs font-medium",
        config.cls,
      )}
    >
      {t(config.labelKey)}
    </span>
  )
}

function EstablishmentTableRow({
  row,
  displayIndex,
}: {
  row: TableRow
  displayIndex: number
}) {
  const { t, i18n } = useTranslation()
  const languageIsAr =
    i18n.language?.toLowerCase().startsWith("ar") ?? false
  const areaDisplay = languageIsAr
    ? row.area
    : (row.areaNameEn?.trim() || row.area)

  const alertDaysCls =
    row.alertLevel === "danger"
      ? "font-bold text-red-700 dark:text-red-400"
      : row.alertLevel === "warning"
        ? "font-semibold text-amber-700 dark:text-amber-400"
        : "text-muted-foreground"

  return (
    <tr
      className={cn(
        "border-b border-border transition-colors duration-150 hover:bg-muted/50",
        row.needsAlert &&
          "bg-red-50/80 dark:bg-red-950/20",
      )}
    >
      <td className="w-10 px-2 py-2.5 text-center text-sm tabular-nums text-muted-foreground">
        {displayIndex}
      </td>
      <td className={cn("min-w-[200px] max-w-[320px] px-3 py-2.5 text-start")}>
        <div className="flex items-center justify-start gap-2">
          {row.needsAlert && (
            <AlertCircle
              className="size-4 shrink-0 text-red-600 dark:text-red-400"
              aria-hidden
            />
          )}
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
            title={row.establishmentName}
          >
            {row.establishmentName}
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-muted-foreground">
        {areaDisplay}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-center text-sm text-foreground">
        {row.lastInspectionDateFormatted}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-center">
        <span className={cn("text-sm font-medium", alertDaysCls)}>
          {row.daysAgo == null ? (
            <span className="text-muted-foreground font-normal">{t("dataTable.noInspection")}</span>
          ) : (
            <>
              {row.daysAgo}{" "}
              {row.daysAgo === 1 ? t("table.day") : t("table.days")}
            </>
          )}
        </span>
      </td>
      <td className="max-[899px]:min-w-[9.5rem] whitespace-nowrap px-3 py-2.5 text-center align-middle">
        {row.rating == null ? (
          <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("table.noRating")}
          </span>
        ) : (
          <RatingBadge rating={row.rating} />
        )}
      </td>
      <td className="max-[899px]:min-w-[10.5rem] whitespace-nowrap px-2 py-2.5 text-center align-middle">
        <OperationalStatusCell row={row} />
      </td>
    </tr>
  )
}

const theadCell =
  "px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"

const ROWS_PER_PAGE = 20
const LOAD_DELAY_MS = 300

export function EstablishmentsTable({ data }: { data: TableRow[] }) {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language?.toLowerCase().startsWith("ar") ?? false
  const [filterRating, setFilterRating] = useState<string>("all")
  const [filterAlert, setFilterAlert] = useState(true)

  const [shownCount, setShownCount] = useState(() =>
    Math.min(ROWS_PER_PAGE, data.length),
  )
  const [loading, setLoading] = useState(false)

  const filteredData = useMemo(() => {
    let rows = data
    if (filterRating !== "all") {
      rows = rows.filter((row) => row.rating === filterRating)
    }
    if (filterAlert) {
      rows = rows.filter((row) => row.needsAlert)
    }
    return rows
  }, [data, filterRating, filterAlert])

  const filteredRef = useRef(filteredData)
  const loadPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shownCountRef = useRef(shownCount)

  const loadingRef = useRef(false)

  useEffect(() => {
    filteredRef.current = filteredData
  }, [filteredData])

  useEffect(() => {
    shownCountRef.current = shownCount
  }, [shownCount])

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  /** Reset paging when filters/data change — cancel pending "load more" */
  useEffect(() => {
    if (loadPendingRef.current !== null) {
      clearTimeout(loadPendingRef.current)
      loadPendingRef.current = null
    }
    const first = Math.min(ROWS_PER_PAGE, filteredData.length)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paginated slice when filters change
    setShownCount(first)
    setLoading(false)
    loadingRef.current = false
  }, [filteredData])

  const reinspectionFiltered = useMemo(
    () => filteredData.filter((r) => r.needsAlert).length,
    [filteredData],
  )
  const reinspectionTotal = useMemo(
    () => data.filter((r) => r.needsAlert).length,
    [data],
  )

  const displayedRows = useMemo(
    () => filteredData.slice(0, shownCount),
    [filteredData, shownCount],
  )

  const hasMore = shownCount < filteredData.length

  const loadMore = useCallback(() => {
    if (loadingRef.current) return
    const fd = filteredRef.current
    if (shownCountRef.current >= fd.length) return

    loadingRef.current = true
    setLoading(true)

    loadPendingRef.current = window.setTimeout(() => {
      loadPendingRef.current = null
      const lengthNow = filteredRef.current.length
      setShownCount((prev) => Math.min(prev + ROWS_PER_PAGE, lengthNow))
      setLoading(false)
      loadingRef.current = false
    }, LOAD_DELAY_MS)
  }, [])

  const observerTarget = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = observerTarget.current
    const root = scrollContainerRef.current
    if (!el || !root || filteredData.length === 0 || shownCount >= filteredData.length)
      return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        if (loadingRef.current) return
        const fd = filteredRef.current
        if (shownCountRef.current >= fd.length) return
        loadMore()
      },
      {
        root,
        rootMargin: "120px",
        threshold: 0,
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [filteredData, shownCount, loadMore])

  useEffect(() => {
    return () => {
      if (loadPendingRef.current !== null) {
        clearTimeout(loadPendingRef.current)
      }
    }
  }, [])

  const ratingSelectCls = cn(
    "flex h-10 min-w-[10rem] max-w-full sm:w-[180px]",
    "appearance-none rounded-lg border border-border bg-card ps-10 pe-9 text-sm shadow-sm transition-colors hover:border-primary",
    "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  )

  const ratingSelectMobileCls = cn(
    "flex h-9 min-w-[9rem] max-w-[12rem] shrink-0",
    "appearance-none rounded-lg border border-border bg-card ps-9 pe-8 text-xs shadow-sm transition-colors hover:border-primary",
    "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  )

  const handleExportExcel = useCallback(async () => {
    if (filteredData.length === 0) return
    const stamp = new Date().toISOString().slice(0, 10)
    const isAr = i18n.language?.toLowerCase().startsWith("ar") ?? false
    const filename = isAr
      ? `متابعة-الحالات_${stamp}.xlsx`
      : `Status-Followup_${stamp}.xlsx`

    await exportFilteredStatusFollowUpToXlsx(filteredData, {
      localeArabic: isAr,
      rowRatingText: (row) => ratingTextForExcel(row, t),
      rowStatusText: (row) => statusTextForExcel(row, t),
      filename,
      sheetName: t("table.title"),
    })
  }, [filteredData, i18n.language, t])

  const exportExcelButtonCls = cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors",
    "hover:border-primary hover:bg-muted/40",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "md:gap-2 md:px-3 md:py-2 md:text-sm",
  )

  return (
    <div className="mt-8">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border p-4 sm:p-6">
          {/* Mobile: title, row1 = Excel + rating (scroll), row2 = re-inspection toggle full width */}
          <div className="space-y-3 md:hidden">
            <h3 className="text-lg font-bold leading-tight text-foreground sm:text-xl">
              {t("table.title")}
            </h3>
            <div
              className={cn(
                "flex items-center gap-1.5",
                isRtl ? "flex-row-reverse" : "flex-row",
              )}
            >
              <div className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] pb-0.5">
                <div className="relative w-auto shrink-0">
                  <Filter
                    className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <select
                    id="est-table-rating-filter-mobile"
                    value={filterRating}
                    onChange={(e) => setFilterRating(e.target.value)}
                    className={ratingSelectMobileCls}
                    aria-label={t("table.filterByRating")}
                  >
                    <option value="all">{t("table.allRatings")}</option>
                    {RATING_VALUES.map((r) => (
                      <option key={r} value={r}>
                        {t(ratingTranslationKey(r))}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleExportExcel()}
                disabled={filteredData.length === 0}
                className={exportExcelButtonCls}
                aria-label={t("table.exportExcelAria")}
              >
                <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
                {t("table.exportExcel")}
              </button>
            </div>
            <button
              type="button"
              aria-pressed={filterAlert}
              onClick={() => setFilterAlert((v) => !v)}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                filterAlert
                  ? "border-red-400 bg-red-100 font-semibold text-red-800 shadow-sm ring-2 ring-red-400/35 dark:border-red-600 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-500/35"
                  : "border-border border-dashed bg-muted/40 text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/55 hover:text-foreground",
              )}
            >
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span className="text-center">{t("table.needsReinspectionOnly")}</span>
              {filterAlert && reinspectionTotal > 0 ? (
                <span className="ms-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                  {reinspectionTotal}
                </span>
              ) : null}
            </button>
          </div>

          {/* Tablet & desktop: original layout */}
          <div className="hidden md:flex md:flex-col md:gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3 className="text-xl font-bold text-foreground">
                  {t("table.title")}
                </h3>
                <button
                  type="button"
                  onClick={() => void handleExportExcel()}
                  disabled={filteredData.length === 0}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors",
                    "hover:border-primary hover:bg-muted/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                  aria-label={t("table.exportExcelAria")}
                >
                  <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
                  {t("table.exportExcel")}
                </button>
              </div>
            </div>

            <div className="flex max-w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Filter
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <select
                  id="est-table-rating-filter"
                  value={filterRating}
                  onChange={(e) => setFilterRating(e.target.value)}
                  className={ratingSelectCls}
                  aria-label={t("table.filterByRating")}
                >
                  <option value="all">{t("table.allRatings")}</option>
                  {RATING_VALUES.map((r) => (
                    <option key={r} value={r}>
                      {t(ratingTranslationKey(r))}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                aria-pressed={filterAlert}
                onClick={() => setFilterAlert((v) => !v)}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto",
                  filterAlert
                    ? "border-red-400 bg-red-100 font-semibold text-red-800 shadow-sm ring-2 ring-red-400/35 dark:border-red-600 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-500/35"
                    : "border-border border-dashed bg-muted/40 text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/55 hover:text-foreground",
                )}
              >
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                <span className="text-center">
                  {t("table.needsReinspectionOnly")}
                </span>
                {filterAlert && reinspectionTotal > 0 && (
                  <span className="ms-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                    {reinspectionTotal}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="-mx-px border-t border-border">
          <div
            ref={scrollContainerRef}
            className={cn(
              "relative rounded-lg border border-border",
              "max-h-[min(70vh,720px)] overflow-y-auto shadow-inner",
              "[-webkit-overflow-scrolling:touch]",
            )}
          >
            <div
              className="overflow-x-auto overscroll-x-contain"
              dir={isRtl ? "rtl" : "ltr"}
            >
              <table
                className="w-full caption-bottom border-collapse text-sm"
                style={{ minWidth: 940 }}
              >
                <thead className="sticky top-0 z-20 bg-card shadow-sm">
                  <tr className="border-b border-border">
                    <th
                      className={cn(theadCell, "w-10 min-w-[2.5rem] bg-card px-2 text-center")}
                      scope="col"
                    >
                      #
                    </th>
                    <th
                      className={cn(
                        theadCell,
                        "min-w-[200px] max-w-[320px] bg-card text-start",
                      )}
                      scope="col"
                    >
                      {t("table.establishmentName")}
                    </th>
                    <th
                      className={cn(
                        theadCell,
                        "min-w-[6rem] bg-card text-center",
                      )}
                      scope="col"
                    >
                      {t("table.area")}
                    </th>
                    <th
                      className={cn(theadCell, "min-w-[7rem] bg-card text-center")}
                      scope="col"
                    >
                      {t("table.lastInspection")}
                    </th>
                    <th
                      className={cn(theadCell, "min-w-[5rem] bg-card text-center")}
                      scope="col"
                    >
                      {t("table.daysAgo")}
                    </th>
                    <th
                      className={cn(
                        theadCell,
                        "min-w-[10.5rem] bg-card text-center",
                      )}
                      scope="col"
                    >
                      {t("table.rating")}
                    </th>
                    <th
                      className={cn(theadCell, "min-w-[11rem] bg-card text-center")}
                      scope="col"
                    >
                      {t("table.status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                    colSpan={7}
                  >
                    {t("table.noResults")}
                  </td>
                </tr>
              ) : (
                displayedRows.map((row, index) => (
                  <EstablishmentTableRow
                    key={row.establishmentKey}
                    row={row}
                    displayIndex={index + 1}
                  />
                ))
              )}
                </tbody>
              </table>
            </div>

            {filteredData.length > 0 && (
              <>
                <div ref={observerTarget} className="h-4 w-full shrink-0" aria-hidden />

                {loading && (
                  <div
                    className="flex items-center justify-center gap-3 py-6"
                    role="status"
                    aria-live="polite"
                  >
                    <div
                      className="size-5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
                      aria-hidden
                    />
                    <span className="text-sm text-muted-foreground">
                      {t("table.loading")}
                    </span>
                  </div>
                )}

                {!hasMore && displayedRows.length > 0 && (
                  <div className="px-4 py-6 text-center sm:px-6">
                    <p className="text-sm text-muted-foreground">{t("table.endOfList")}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            {t("table.showing")}{" "}
            <span className="font-medium text-foreground">
              {filteredData.length === 0 ? 0 : displayedRows.length}
            </span>{" "}
            {t("table.of")}{" "}
            <span className="font-medium text-foreground">
              {filteredData.length}
            </span>{" "}
            {t("table.establishments")}
          </span>
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="size-4 shrink-0 text-red-600 dark:text-red-400"
              aria-hidden
            />
            <span>
              {reinspectionFiltered} {t("table.needsReinspection")}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
