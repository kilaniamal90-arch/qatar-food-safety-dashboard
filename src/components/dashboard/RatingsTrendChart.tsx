import html2canvas from "html2canvas"
import { Download } from "lucide-react"
import { useTheme } from "next-themes"
import { createPortal, flushSync } from "react-dom"
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { useTranslation } from "react-i18next"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"
import type { TooltipContentProps } from "recharts/types/component/Tooltip"

import type { ManagedArea } from "@/admin/types"
import type {
  AreaFilter,
  Establishment,
  Inspection,
  InspectionRating,
} from "@/data/rawData"
import { coerceRating } from "@/features/data-import/mergePipeline"
import { useRatings } from "@/hooks/useRatings"
import { useYears } from "@/hooks/useYears"
import {
  aggregateLatestInspectionRatingsByYear,
  percentageChartDomainMax,
  RATINGS_TREND_ORDER,
  seriesToChartRows,
} from "@/lib/ratingsTrendAggregate"
import { cn } from "@/lib/utils"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import toast from "react-hot-toast"

const STROKE_FALLBACK: Record<InspectionRating, string> = {
  Excellent: "#10B981",
  "Very Good": "#84CC16",
  Good: "#FBBF24",
  Fair: "#FB923C",
  Poor: "#F87171",
  "Very Poor": "#DC2626",
}

function normalizeHex(color: string): string {
  const c = color.trim()
  if (!c) return "#64748b"
  if (c.startsWith("#")) return c
  if (/^[0-9a-fA-F]{3,8}$/.test(c)) return `#${c}`
  return c
}

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

function areaExportSlug(area: AreaFilter, areas: ManagedArea[]): string {
  if (area === "all") return "all"
  if (area === "my-areas") return "my_areas"
  const hit = areas.find((a) => a.nameAr === area || a.nameEn === area)
  const raw = (hit?.nameEn ?? hit?.nameAr ?? String(area))
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, "")
  return raw.slice(0, 48) || "area"
}

/** Area label for captions / export: locale-aware name, All Areas, or My Areas. */
function resolveAreaDisplayLabel(
  area: AreaFilter,
  areas: ManagedArea[],
  languageIsAr: boolean,
  tAll: string,
  tMyAreas: string,
): string {
  if (area === "all") return tAll
  if (area === "my-areas") return tMyAreas
  const hit = areas.find((a) => a.nameAr === area || a.nameEn === area)
  if (!hit) return String(area)
  return languageIsAr ? hit.nameAr : hit.nameEn
}

type TrendTooltipProps = TooltipContentProps<ValueType, NameType> & {
  countByYearRating: Map<number, Map<InspectionRating, number>>
  totalsByYear: Map<number, number>
  ratingOrder: InspectionRating[]
}

function TrendTooltip({
  active,
  label,
  countByYearRating,
  totalsByYear,
  ratingOrder,
}: TrendTooltipProps) {
  const { t } = useTranslation()
  if (!active || label == null || label === "") return null

  const year = Number(label)
  if (!Number.isFinite(year)) return null

  const total = totalsByYear.get(year) ?? 0
  const rowMap = countByYearRating.get(year)

  return (
    <div
      className="max-w-[240px] rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm"
      dir="auto"
    >
      <p className="mb-1.5 font-semibold text-foreground">
        {t("dashboard.ratingsTrend.tooltipYear")}: {label}
      </p>
      <ul className="space-y-1 text-muted-foreground">
        {ratingOrder.map((r) => {
          const count = rowMap?.get(r) ?? 0
          const pct =
            total > 0 ? Math.round((count / total) * 1000) / 10 : 0
          return (
            <li key={r} className="flex flex-wrap justify-between gap-2">
              <span className="text-foreground">
                {t(ratingTranslationKey(r))}:
              </span>
              <span className="tabular-nums">
                {t("dashboard.ratingsTrend.tooltipEstablishments", {
                  count,
                })}{" "}
                ({pct}%)
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

type LinePack = {
  rows: Array<Record<string, string | number>>
  countByYearRating: Map<number, Map<InspectionRating, number>>
  totalsByYear: Map<number, number>
}

function RatingsTrendLineChart({
  chartPack,
  ratingLines,
  hidden,
  mode,
  percentageYMax,
  containerClassName,
  containerStyle,
  disableAnimations = false,
}: {
  chartPack: LinePack
  ratingLines: { rating: InspectionRating; color: string }[]
  hidden: ReadonlySet<InspectionRating>
  mode: "count" | "percentage"
  percentageYMax: number
  containerClassName?: string
  containerStyle?: CSSProperties
  /** When true (PNG export), draw paths immediately so html2canvas captures full polylines. */
  disableAnimations?: boolean
}) {
  const { rows, countByYearRating, totalsByYear } = chartPack
  const ratingsInOrder = useMemo(
    () => ratingLines.map((x) => x.rating),
    [ratingLines],
  )

  return (
    <div className={cn(containerClassName)} style={containerStyle} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/80" />
          <XAxis
            dataKey="year"
            tick={{ fill: "var(--foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            allowDecimals={mode === "percentage"}
            domain={
              mode === "percentage" ? [0, percentageYMax] : [0, "auto"]
            }
            tickFormatter={
              mode === "percentage" ? (v) => `${v}%` : undefined
            }
          />
          <Tooltip
            content={(props) => (
              <TrendTooltip
                {...props}
                countByYearRating={countByYearRating}
                totalsByYear={totalsByYear}
                ratingOrder={ratingsInOrder}
              />
            )}
          />
          {ratingLines.map(({ rating, color }) => (
            <Line
              key={rating}
              type="monotone"
              dataKey={rating}
              name={rating}
              stroke={color}
              strokeWidth={3}
              dot
              activeDot={{ r: 6 }}
              hide={hidden.has(rating)}
              isAnimationActive={!disableAnimations}
              animationDuration={disableAnimations ? 0 : 1200}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ExportRatingsTrendSnapshot({
  areaLabel,
  mode,
  ratingLines,
  chartPack,
  percentageYMax,
  isDark,
  t,
  i18n,
}: {
  areaLabel: string
  mode: "count" | "percentage"
  ratingLines: { rating: InspectionRating; color: string }[]
  chartPack: LinePack
  percentageYMax: number
  isDark: boolean
  t: (k: string, o?: Record<string, string>) => string
  i18n: { dir: () => string }
}) {
  const bg = isDark ? "#0f172a" : "#ffffff"
  const titleMuted = isDark ? "#e2e8f0" : "#1e293b"
  const bodyMuted = isDark ? "#94a3b8" : "#475569"
  const border = isDark ? "#334155" : "#e2e8f0"

  return (
    <div
      className="box-border overflow-x-visible overflow-y-visible rounded-xl border shadow-lg"
      style={{
        width: 1080,
        background: bg,
        borderColor: border,
        padding: 28,
        direction: i18n.dir() === "rtl" ? "rtl" : "ltr",
      }}
      dir={i18n.dir()}
    >
      <h1
        className="m-0 text-2xl font-bold leading-tight"
        style={{ color: "#8B1538" }}
      >
        {t("dashboard.ratingsTrend.title")}
      </h1>
      <p
        className="mt-3 text-[15px] leading-relaxed"
        style={{ color: titleMuted }}
      >
        {t("dashboard.ratingsTrend.captionWithArea", { area: areaLabel })}
      </p>
      <p
        className="mt-2 text-sm font-semibold"
        style={{ color: "#8B1538" }}
      >
        {mode === "count"
          ? t("dashboard.ratingsTrend.exportActiveCount")
          : t("dashboard.ratingsTrend.exportActivePercentage")}
      </p>

      <p
        className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide"
        style={{ color: "#8B1538" }}
      >
        {t("dashboard.ratingsTrend.exportLegendHeading")}
      </p>
      <div
        className="flex flex-wrap gap-x-5 gap-y-3"
        style={{ marginBottom: 20 }}
      >
        {ratingLines.map(({ rating, color }) => (
          <div
            key={rating}
            className="flex items-center gap-2 text-sm font-medium"
            style={{ color: titleMuted }}
          >
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: color }}
            />
            {t(ratingTranslationKey(rating))}
          </div>
        ))}
      </div>

      <div
        style={{
          borderTop: `1px solid ${border}`,
          paddingTop: 20,
          color: bodyMuted,
        }}
      >
        <RatingsTrendLineChart
          chartPack={chartPack}
          ratingLines={ratingLines}
          hidden={new Set()}
          mode={mode}
          percentageYMax={percentageYMax}
          containerStyle={{ width: "100%", height: 400 }}
          disableAnimations
        />
      </div>
    </div>
  )
}

export function RatingsTrendChart({
  establishments,
  inspectionsAll,
  area,
  areas,
  className,
}: {
  establishments: Establishment[]
  inspectionsAll: Inspection[]
  area: AreaFilter
  areas: ManagedArea[]
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { data: yearsRows, loading: yearsLoading } = useYears()
  const { data: ratingsRows, loading: ratingsLoading } = useRatings()

  const languageIsAr =
    i18n.language?.toLowerCase().startsWith("ar") ?? false

  const areaDisplayLabel = useMemo(
    () =>
      resolveAreaDisplayLabel(
        area,
        areas,
        languageIsAr,
        t("dashboard.areaAll"),
        t("dashboard.areas.myAreas"),
      ),
    [area, areas, languageIsAr, t],
  )

  const [mode, setMode] = useState<"count" | "percentage">("count")
  const [hidden, setHidden] = useState<ReadonlySet<InspectionRating>>(
    () => new Set(),
  )
  const [exportActive, setExportActive] = useState(false)
  const exportMountRef = useRef<HTMLDivElement>(null)

  const activeCalendarYears = useMemo(() => {
    return yearsRows
      .map((y) => y.year)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)
      .slice(-10)
  }, [yearsRows])

  const ratingLines = useMemo(() => {
    const seen = new Set<InspectionRating>()
    const out: { rating: InspectionRating; color: string }[] = []
    const sorted = [...ratingsRows].sort((a, b) => a.order - b.order)

    for (const r of sorted) {
      const canonical =
        coerceRating(r.nameEn) ?? coerceRating(r.nameAr)
      if (!canonical || !RATINGS_TREND_ORDER.includes(canonical)) continue
      if (seen.has(canonical)) continue
      seen.add(canonical)
      out.push({
        rating: canonical,
        color: normalizeHex(r.color || STROKE_FALLBACK[canonical]),
      })
    }

    for (const r of RATINGS_TREND_ORDER) {
      if (!seen.has(r)) {
        out.push({ rating: r, color: normalizeHex(STROKE_FALLBACK[r]) })
        seen.add(r)
      }
    }

    out.sort(
      (a, b) =>
        RATINGS_TREND_ORDER.indexOf(a.rating) -
        RATINGS_TREND_ORDER.indexOf(b.rating),
    )
    return out
  }, [ratingsRows])

  const ratingsInOrder = useMemo(
    () => ratingLines.map((x) => x.rating),
    [ratingLines],
  )

  const series = useMemo(
    () =>
      aggregateLatestInspectionRatingsByYear(
        establishments,
        inspectionsAll,
        activeCalendarYears,
      ),
    [establishments, inspectionsAll, activeCalendarYears],
  )

  const percentageOnlyPack = useMemo(
    () => seriesToChartRows(series, ratingsInOrder, "percentage"),
    [series, ratingsInOrder],
  )

  const percentageYMax = useMemo(
    () =>
      percentageChartDomainMax(percentageOnlyPack.rows, ratingsInOrder),
    [percentageOnlyPack.rows, ratingsInOrder],
  )

  const { rows, totalsByYear, countByYearRating } = useMemo(
    () => seriesToChartRows(series, ratingsInOrder, mode),
    [series, ratingsInOrder, mode],
  )

  const chartPack = useMemo(
    () => ({ rows, countByYearRating, totalsByYear }),
    [rows, countByYearRating, totalsByYear],
  )

  const hasAnyCount = useMemo(() => {
    for (const v of totalsByYear.values()) {
      if (v > 0) return true
    }
    return false
  }, [totalsByYear])

  const exportPng = useCallback(async () => {
    if (!hasAnyCount) return
    const isDark = resolvedTheme === "dark"
    flushSync(() => {
      setExportActive(true)
    })
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    )
    /** Let export chart mount; Recharts still lays out async without path animation (see disableAnimations). */
    await new Promise((r) => setTimeout(r, 800))

    const el = exportMountRef.current
    try {
      if (!el) throw new Error("Export mount missing")

      el.querySelectorAll("svg").forEach((svg) => {
        svg.style.opacity = "0.9999"
        void svg.getBoundingClientRect()
      })
      await new Promise((r) => setTimeout(r, 50))
      el.querySelectorAll("svg").forEach((svg) => {
        svg.style.removeProperty("opacity")
      })
      await new Promise((r) => setTimeout(r, 200))

      const width = Math.max(Math.ceil(el.scrollWidth), el.offsetWidth)
      const height = Math.max(Math.ceil(el.scrollHeight), el.offsetHeight)

      const canvas = await html2canvas(el, {
        backgroundColor: isDark ? "#0f172a" : "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        foreignObjectRendering: false,
        width,
        height,
      })
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      )
      if (!blob) throw new Error("PNG export failed")
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `ratings-trend-${areaExportSlug(area, areas)}-${stamp}.png`
      a.rel = "noopener noreferrer"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(t("dashboard.ratingsTrend.exportSuccess"))
    } catch {
      toast.error(t("dashboard.ratingsTrend.exportError"))
    } finally {
      flushSync(() => {
        setExportActive(false)
      })
    }
  }, [
    area,
    areas,
    hasAnyCount,
    resolvedTheme,
    t,
  ])

  const toggleRating = useCallback((r: InspectionRating) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(r)) next.delete(r)
      else next.add(r)
      return next
    })
  }, [])

  const loading = yearsLoading || ratingsLoading

  const exportPortal =
    exportActive && hasAnyCount && !loading ? (
      createPortal(
        <div
          ref={exportMountRef}
          style={{
            position: "fixed",
            left: -12000,
            top: 0,
            zIndex: -5,
            pointerEvents: "none",
          }}
          aria-hidden
        >
          <ExportRatingsTrendSnapshot
            areaLabel={areaDisplayLabel}
            mode={mode}
            ratingLines={ratingLines}
            chartPack={chartPack}
            percentageYMax={percentageYMax}
            isDark={resolvedTheme === "dark"}
            t={t}
            i18n={i18n}
          />
        </div>,
        document.body,
      )
    ) : null

  return (
    <>
      {exportPortal}
      <div
        className={cn(
          "rounded-2xl p-[1px] shadow-md",
          "bg-gradient-to-br from-[#8B1538]/25 via-[#D4AF37]/12 to-[#8B1538]/18",
          "dark:from-[#8B1538]/38 dark:via-[#D4AF37]/18 dark:to-[#8B1538]/28",
          className,
        )}
      >
        <div
          className={cn(
            "flex flex-col gap-4 rounded-[15px] border border-border/70 bg-card/85 p-4 backdrop-blur-md sm:p-6",
            "dark:border-border/60 dark:bg-card/72",
          )}
          dir={i18n.dir()}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h3 className="text-lg font-bold text-foreground sm:text-xl">
                {t("dashboard.ratingsTrend.title")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("dashboard.ratingsTrend.captionWithArea", {
                  area: areaDisplayLabel,
                })}
              </p>
            </div>

            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
              <Tabs
                value={mode}
                onValueChange={(v) => {
                  if (v === "count" || v === "percentage") setMode(v)
                }}
                className="w-auto"
              >
                <TabsList className="h-auto min-h-10 w-auto gap-1 p-1 transition-all duration-300">
                  <TabsTrigger
                    value="count"
                    className="px-3 py-1.5 text-xs sm:text-sm"
                  >
                    {t("dashboard.ratingsTrend.count")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="percentage"
                    className="px-3 py-1.5 text-xs sm:text-sm"
                  >
                    {t("dashboard.ratingsTrend.percentage")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <button
                type="button"
                onClick={() => void exportPng()}
                disabled={!hasAnyCount || loading}
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-all duration-300",
                  "hover:border-primary/50 hover:bg-muted/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:pointer-events-none disabled:opacity-45",
                )}
                aria-label={t("dashboard.ratingsTrend.exportAria")}
              >
                <Download className="size-4 shrink-0" aria-hidden />
              </button>
            </div>
          </div>

          {loading ? (
            <div
              className="flex h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {t("dashboard.ratingsTrend.loading")}
            </div>
          ) : activeCalendarYears.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
              {t("dashboard.ratingsTrend.noActiveYears")}
            </div>
          ) : !hasAnyCount ? (
            <div className="flex h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
              {t("dashboard.ratingsTrend.empty")}
            </div>
          ) : (
            <>
              <div className="w-full min-w-0 overflow-x-auto transition-all duration-300">
                <div className="min-h-[400px] min-w-[520px]" key={mode}>
                  <RatingsTrendLineChart
                    chartPack={chartPack}
                    ratingLines={ratingLines}
                    hidden={hidden}
                    mode={mode}
                    percentageYMax={percentageYMax}
                    containerClassName="h-[400px] w-full"
                  />
                </div>
              </div>

              <div
                className={cn(
                  "flex flex-wrap justify-center gap-x-4 gap-y-2 overflow-x-auto border-t border-border/60 pt-4",
                  "-mt-1",
                )}
                role="group"
                aria-label={t("dashboard.ratingsTrend.legendAria")}
              >
                {ratingLines.map(({ rating, color }) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => toggleRating(rating)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium transition-opacity duration-300 sm:text-sm",
                      "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      hidden.has(rating)
                        ? "opacity-35 line-through"
                        : "opacity-100",
                    )}
                  >
                    <span
                      className="h-1 w-6 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    {t(ratingTranslationKey(rating))}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
