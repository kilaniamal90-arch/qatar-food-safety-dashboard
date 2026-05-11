import { Loader2Icon, Lock, Pencil, Printer, Trash2 } from "lucide-react"
import { flushSync } from "react-dom"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import toast from "react-hot-toast"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useAuth } from "@/auth/AuthContext"
import { RatingBadge } from "@/components/dashboard/EstablishmentsTable"
import { AddInspectionDialog } from "@/features/establishments/AddInspectionDialog"
import { DeleteInspectionConfirmDialog } from "@/features/establishments/DeleteInspectionConfirmDialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Establishment, InspectionRating, OperationalStatus } from "@/data/rawData"
import { formatInspectionDateDdMmYyyy } from "@/data/establishmentsTable"
import { useFilterAreas } from "@/hooks/useFilterAreas"
import { useEstablishmentDetails } from "@/hooks/useEstablishmentDetails"
import type { EnrichedEstablishmentRow } from "@/lib/dataTableModel"
import {
  inspectorDisplayName,
  type EstablishmentInspectionDetail,
} from "@/lib/supabase/remoteDataset"
import {
  buildEstablishmentPrintHtml,
  openEstablishmentPrintWindow,
  type EstablishmentPrintField,
} from "@/lib/establishmentPrintWindow"
import { canDeleteInspection, canEditInspection } from "@/lib/permissions/canMutateInspection"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const RATING_SCORE: Record<InspectionRating, number> = {
  Excellent: 6,
  "Very Good": 5,
  Good: 4,
  Fair: 3,
  Poor: 2,
  "Very Poor": 1,
}

const RATING_HEX: Record<InspectionRating, string> = {
  Excellent: "#16a34a",
  "Very Good": "#84cc16",
  Good: "#ca8a04",
  Fair: "#ea580c",
  Poor: "#dc2626",
  "Very Poor": "#991b1b",
}

/** Y-axis tick value (score) → canonical rating; score 1 = bottom (worst), 6 = top (best). */
const SCORE_TO_RATING: Record<number, InspectionRating> = {
  1: "Very Poor",
  2: "Poor",
  3: "Fair",
  4: "Good",
  5: "Very Good",
  6: "Excellent",
}

const INSPECTIONS_PAGE = 5

/** Wait for Recharts SVG + layout after switching to Chart tab (print capture). */
const CHART_DOM_WAIT_MS = 3000
/** Short settle after layout before html2canvas (straight X labels need less time than angled). */
const CHART_CAPTURE_AFTER_DOM_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * Poll until the chart mount under `container` has non-trivial size and Recharts has rendered.
 */
async function waitForChartReadyForCapture(
  getContainer: () => HTMLElement | null,
  timeoutMs: number,
): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const container = getContainer()
    if (container) {
      const wrap = container.querySelector(".recharts-wrapper")
      const svg = wrap?.querySelector("svg")
      const rect = container.getBoundingClientRect()
      if (
        wrap &&
        svg &&
        rect.width >= 48 &&
        rect.height >= 48 &&
        svg.getBoundingClientRect().width >= 32
      ) {
        return container
      }
    }
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
  }
  return getContainer()
}

async function captureChartRegionToPng(
  chartElement: HTMLElement | null,
  logging: boolean,
): Promise<string | null> {
  if (!chartElement) return null
  const { default: html2canvas } = await import("html2canvas")
  try {
    const canvas = await html2canvas(chartElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    })
    if (canvas.width < 32 || canvas.height < 32) return null
    const dataUrl = canvas.toDataURL("image/png")
    if (dataUrl.startsWith("data:image/png") && dataUrl.length > 800) return dataUrl
  } catch (err) {
    if (logging) {
      console.warn("[establishmentPrint] html2canvas failed:", err)
    }
  }
  return null
}

function formatPrintIssueDate(now: Date, easternArabicNumerals: boolean): string {
  const d = String(now.getDate()).padStart(2, "0")
  const mo = String(now.getMonth() + 1).padStart(2, "0")
  const y = String(now.getFullYear())
  const western = `${d}/${mo}/${y}`
  if (!easternArabicNumerals) return western
  return western.replace(/[0-9]/g, (ch) =>
    String.fromCharCode(0x0660 + (ch.charCodeAt(0) - 48)),
  )
}

function nonEmpty(v: unknown): v is string | number {
  if (v == null) return false
  if (typeof v === "number") return Number.isFinite(v)
  return String(v).trim() !== ""
}

function operationalStatusClass(s: OperationalStatus): string {
  switch (s) {
    case "Open":
      return "border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-900/35 dark:text-green-400"
    case "Closed":
      return "border-red-300 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-900/35 dark:text-red-400"
    case "Temporary Closed":
      return "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-900/35 dark:text-orange-400"
    case "Open Soon":
      return "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-700 dark:bg-sky-900/35 dark:text-sky-400"
    default:
      return "border-border bg-muted text-foreground"
  }
}

function ratingTranslationKey(r: InspectionRating): string {
  const map: Record<InspectionRating, string> = {
    Excellent: "ratings.excellent",
    "Very Good": "ratings.veryGood",
    Good: "ratings.good",
    Fair: "ratings.fair",
    Poor: "ratings.poor",
    "Very Poor": "ratings.veryPoor",
  }
  return map[r]
}

function RatingYAxisTick({
  x,
  y,
  payload,
  showNames,
  orientation,
  t: tl,
}: {
  x: number
  y: number
  payload: { value: number }
  showNames: boolean
  orientation: "left" | "right"
  t: (key: string) => string
}) {
  const v = Number(payload?.value)
  if (!Number.isFinite(v)) return null
  const anchor = orientation === "right" ? "start" : "end"
  const textX = x + (orientation === "right" ? 4 : -4)
  if (!showNames) {
    return (
      <text
        x={textX}
        y={y}
        dy={3}
        fill="#737373"
        fontSize={11}
        textAnchor={anchor}
      >
        {v}
      </text>
    )
  }
  const rating = SCORE_TO_RATING[v]
  if (!rating) return null
  const label = tl(ratingTranslationKey(rating))
  const fill = RATING_HEX[rating]
  return (
    <text
      x={textX}
      y={y}
      dy={3}
      fill={fill}
      fontSize={11}
      fontWeight={600}
      textAnchor={anchor}
    >
      {label}
    </text>
  )
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  )
}

function useEstablishmentAreaLabel() {
  const { data: areaRows } = useFilterAreas()
  const { i18n } = useTranslation()

  return useCallback(
    (e: Establishment) => {
      const areaStr = String(e.area)
      const row = areaRows.find((x) => x.nameAr === areaStr || x.nameEn === areaStr)
      if (row) return i18n.language.startsWith("ar") ? row.nameAr : row.nameEn || row.nameAr
      return areaStr
    },
    [areaRows, i18n.language],
  )
}

export function EstablishmentDetailSheet({
  open,
  onOpenChange,
  row,
  onAddInspection,
  inspectionsReloadKey = 0,
  onInspectionsChanged,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  row: EnrichedEstablishmentRow | null
  onAddInspection: (row: EnrichedEstablishmentRow) => void
  inspectionsReloadKey?: number
  onInspectionsChanged?: () => void
}) {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language.startsWith("ar")
  const { user } = useAuth()
  const { data: areaRows } = useFilterAreas()
  const detailId = open && row ? row.establishment.id : null
  const { establishment: fetchedEst, inspections, loading, error, refetch: refetchInspections } =
    useEstablishmentDetails(detailId, inspectionsReloadKey)

  const establishment = fetchedEst ?? row?.establishment ?? null
  const areaLabel = useEstablishmentAreaLabel()
  const [tab, setTab] = useState("info")
  const [inspectVisible, setInspectVisible] = useState(INSPECTIONS_PAGE)
  const chartCaptureRef = useRef<HTMLDivElement>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const [editingInspection, setEditingInspection] = useState<EstablishmentInspectionDetail | null>(
    null,
  )
  const [editInspectionOpen, setEditInspectionOpen] = useState(false)
  const [deleteInspectionTarget, setDeleteInspectionTarget] =
    useState<EstablishmentInspectionDetail | null>(null)
  const [deleteInspectionOpen, setDeleteInspectionOpen] = useState(false)
  const [deleteInspectionSubmitting, setDeleteInspectionSubmitting] = useState(false)
  const [notesDraft, setNotesDraft] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)
  const notesSaveInFlightRef = useRef(false)

  useEffect(() => {
    setNotesDraft(establishment?.establishmentNote ?? "")
  }, [establishment?.id, establishment?.establishmentNote])

  const resolvedAreaIdForPerm = useMemo(() => {
    if (!establishment) return null
    if (establishment.areaId?.trim()) return establishment.areaId
    const ar = String(establishment.area ?? "").trim()
    const en = String(establishment.areaNameEn ?? "").trim()
    const hit = areaRows.find(
      (a) =>
        a.nameAr.trim() === ar ||
        a.nameEn.trim() === ar ||
        (en !== "" && (a.nameEn.trim() === en || a.nameAr.trim() === en)),
    )
    return hit?.id ?? null
  }, [establishment, areaRows])

  useEffect(() => {
    if (!open) {
      setTab("info")
      setInspectVisible(INSPECTIONS_PAGE)
      setIsPrinting(false)
    }
  }, [open])

  useEffect(() => {
    setInspectVisible(INSPECTIONS_PAGE)
  }, [detailId, inspections.length])

  const handleEditInspectionClick = (ins: EstablishmentInspectionDetail) => {
    if (!establishment || !row) return
    if (
      !canEditInspection(
        ins,
        establishment,
        { role: user.role, areas: user.areas },
        resolvedAreaIdForPerm,
      )
    ) {
      toast.error(t("addInspection.noPermissionEdit"))
      return
    }
    setEditingInspection(ins)
    setEditInspectionOpen(true)
  }

  const handleDeleteInspectionClick = (ins: EstablishmentInspectionDetail) => {
    if (!establishment) return
    if (
      !canDeleteInspection(
        ins,
        establishment,
        { role: user.role, areas: user.areas },
        resolvedAreaIdForPerm,
      )
    ) {
      toast.error(t("addInspection.noPermissionDelete"))
      return
    }
    setDeleteInspectionTarget(ins)
    setDeleteInspectionOpen(true)
  }

  const confirmDeleteInspection = async (ins: EstablishmentInspectionDetail) => {
    if (!establishment) return
    if (
      !canDeleteInspection(
        ins,
        establishment,
        { role: user.role, areas: user.areas },
        resolvedAreaIdForPerm,
      )
    ) {
      toast.error(t("addInspection.noPermissionDelete"))
      setDeleteInspectionOpen(false)
      setDeleteInspectionTarget(null)
      return
    }
    setDeleteInspectionSubmitting(true)
    try {
      const { error: delErr } = await supabase.from("inspections").delete().eq("id", ins.id)
      if (delErr) throw delErr
      toast.success(t("addInspection.successDelete"))
      void refetchInspections()
      onInspectionsChanged?.()
    } catch (e) {
      console.error(e)
      toast.error(t("addInspection.errorDelete"))
    } finally {
      setDeleteInspectionSubmitting(false)
      setDeleteInspectionOpen(false)
      setDeleteInspectionTarget(null)
    }
  }

  const commitNotesIfDirty = useCallback(async () => {
    if (!establishment?.id || notesSaveInFlightRef.current) return
    const trimmed = notesDraft.trim()
    const server = (establishment.establishmentNote ?? "").trim()
    if (trimmed === server) return
    notesSaveInFlightRef.current = true
    setSavingNotes(true)
    try {
      const { error } = await supabase
        .from("establishments")
        .update({ notes: trimmed === "" ? null : trimmed })
        .eq("id", establishment.id)
      if (error) throw error
      toast.success(t("establishmentsPage.detail.notesSaved"))
      void refetchInspections()
    } catch (e) {
      console.error(e)
      toast.error(t("establishmentsPage.detail.notesSaveFailed"))
    } finally {
      notesSaveInFlightRef.current = false
      setSavingNotes(false)
    }
  }, [establishment, notesDraft, refetchInspections, t])

  const statusLabel = useCallback(
    (s: OperationalStatus) => {
      const keys: Record<OperationalStatus, string> = {
        Open: "dashboard.open",
        Closed: "dashboard.closed",
        "Temporary Closed": "dashboard.temporaryClosed",
        "Open Soon": "dashboard.openSoon",
      }
      return t(keys[s])
    },
    [t],
  )

  const ratingDisplay = useCallback(
    (ins: EstablishmentInspectionDetail) => {
      if (i18n.language.startsWith("ar")) {
        return t(ratingTranslationKey(ins.rating))
      }
      if (ins.ratingNameEn?.trim()) return ins.ratingNameEn.trim()
      return undefined
    },
    [i18n.language, t],
  )

  const [isMdUp, setIsMdUp] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  )

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const fn = () => setIsMdUp(mq.matches)
    mq.addEventListener("change", fn)
    return () => mq.removeEventListener("change", fn)
  }, [])

  const deleteInspectionDialogDetails = useMemo(() => {
    const ins = deleteInspectionTarget
    if (!ins) return [] as string[]
    const dateStr = ins.inspectionDate
      ? formatInspectionDateDdMmYyyy(ins.inspectionDate, t("common.dateUnknown"))
      : t("common.dateUnknown")
    const ratingLine = isRtl
      ? (ins.ratingNameAr.trim() ||
          ratingDisplay(ins) ||
          t(ratingTranslationKey(ins.rating)))
      : (ins.ratingNameEn.trim() ||
          ratingDisplay(ins) ||
          t(ratingTranslationKey(ins.rating)))
    const lines: string[] = [
      `${t("establishmentsPage.detail.printColDate")}: ${dateStr}`,
      `${t("establishmentsPage.detail.printColRating")}: ${ratingLine}`,
    ]
    const inspLine = inspectorDisplayName(ins, i18n.language.startsWith("ar"))
    if (inspLine.trim() && inspLine !== "—") {
      lines.push(`${t("establishmentsPage.detail.printColInspector")}: ${inspLine}`)
    }
    return lines
  }, [deleteInspectionTarget, i18n.language, ratingDisplay, t])

  const { chartSeries, chartDatedTotal } = useMemo(() => {
    const dated = inspections.filter(
      (i) => i.inspectionDate && !Number.isNaN(i.inspectionDate.getTime()),
    )
    const chrono = [...dated].sort(
      (a, b) => a.inspectionDate!.getTime() - b.inspectionDate!.getTime(),
    )
    const cap = isMdUp ? 12 : 10
    const limited = chrono.slice(-cap)
    const langAr = i18n.language.startsWith("ar")
    const series = limited.map((i) => {
      const ratingLabelLocalized = langAr
        ? i.ratingNameAr?.trim() || t(ratingTranslationKey(i.rating))
        : i.ratingNameEn?.trim() || t(ratingTranslationKey(i.rating))
      return {
        id: i.id,
        ts: i.inspectionDate!.getTime(),
        dateLabel: formatInspectionDateDdMmYyyy(
          i.inspectionDate,
          t("common.dateUnknown"),
        ),
        score: RATING_SCORE[i.rating],
        rating: i.rating,
        fill: i.ratingColor?.trim() || RATING_HEX[i.rating],
        name: ratingDisplay(i) ?? t(ratingTranslationKey(i.rating)),
        ratingLabelLocalized,
        inspector: inspectorDisplayName(i, langAr),
      }
    })
    if (import.meta.env.DEV) {
      const datedCount = inspections.filter((i) => i.inspectionDate != null).length
      console.log(
        "[establishmentChart] inspections:",
        inspections.length,
        "dated raw:",
        datedCount,
        "dated with valid date:",
        chrono.length,
        "chart points:",
        series.length,
        "cap:",
        cap,
      )
    }
    return { chartSeries: series, chartDatedTotal: chrono.length }
  }, [inspections, ratingDisplay, t, i18n.language, isMdUp])

  const chartXTickFormatter = useCallback(
    (value: string) => chartSeries.find((p) => p.id === value)?.dateLabel ?? value,
    [chartSeries],
  )

  /** English: chronological left→right. Arabic: reverse series so X order is newest→oldest left→right under LTR plot. */
  const chartDataForDisplay = useMemo(() => {
    if (!isRtl) return chartSeries
    return [...chartSeries].reverse()
  }, [chartSeries, isRtl])

  const [forceNamedYAxisForCapture, setForceNamedYAxisForCapture] = useState(false)

  const showRatingNamesOnY = isMdUp || forceNamedYAxisForCapture
  const yAxisOrientation = isRtl ? "right" : "left"
  const yAxisWidth = showRatingNamesOnY ? (isRtl ? 118 : 94) : 32

  const handlePrint = async () => {
    if (!establishment) return

    setIsPrinting(true)
    try {
    const e = establishment

    let chartImageDataUrl: string | null = null
    if (chartDatedTotal >= 2) {
      const prevTab = tab
      try {
        flushSync(() => {
          setForceNamedYAxisForCapture(true)
          setTab("chart")
        })

        await waitForChartReadyForCapture(() => chartCaptureRef.current, CHART_DOM_WAIT_MS)
        await sleep(CHART_CAPTURE_AFTER_DOM_MS)
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        })

        const root = chartCaptureRef.current
        const wrapper = root?.querySelector(".recharts-wrapper") as HTMLElement | null
        const chartElement = wrapper ?? root
        try {
          chartImageDataUrl = await captureChartRegionToPng(chartElement, import.meta.env.DEV)
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn("[establishmentPrint] Chart capture failed:", err)
          }
        }

        if (!chartImageDataUrl && chartDatedTotal >= 2) {
          toast(t("establishmentsPage.detail.chartCaptureFallbackToast"), { duration: 4500 })
        }
      } finally {
        flushSync(() => {
          setForceNamedYAxisForCapture(false)
          setTab(prevTab)
        })
      }
    }
    const fields: EstablishmentPrintField[] = []
    const push = (label: string, value: unknown) => {
      if (value == null) return
      if (typeof value === "number" && Number.isFinite(value)) {
        fields.push({ label, value: String(value) })
        return
      }
      const s = String(value).trim()
      if (s === "" || s === "—") return
      fields.push({ label, value: s })
    }

    push(
      t("establishmentsPage.detail.name"),
      i18n.language.startsWith("ar") ? e.name : e.nameEn?.trim() || e.name,
    )
    if (nonEmpty(e.nameInEms)) push(t("establishmentsPage.detail.nameEms"), e.nameInEms)
    push(t("establishmentsPage.detail.mainArea"), areaLabel(e))
    if (nonEmpty(e.location) && e.location !== "—") {
      push(t("establishmentsPage.detail.location"), e.location)
    }
    push(t("establishmentsPage.detail.operationalStatus"), statusLabel(e.operationalStatus))
    if (nonEmpty(e.activityType)) push(t("establishmentsPage.detail.activityType"), e.activityType)
    if (nonEmpty(e.crNumber)) push(t("establishmentsPage.detail.crNumber"), e.crNumber)
    if (nonEmpty(e.accountStatusInEms)) {
      push(t("establishmentsPage.detail.accountEms"), e.accountStatusInEms)
    }
    if (e.nbOutlets != null && e.nbOutlets >= 0) {
      push(t("establishmentsPage.detail.nbOutlets"), e.nbOutlets)
    }
    if (nonEmpty(e.phone)) push(t("establishmentsPage.detail.phone"), e.phone)
    if (nonEmpty(e.personInCharge)) {
      push(t("establishmentsPage.detail.personInCharge"), e.personInCharge)
    }
    if (nonEmpty(e.email)) push(t("establishmentsPage.detail.email"), e.email)
    if (nonEmpty(e.serviceHours)) push(t("establishmentsPage.detail.serviceHours"), e.serviceHours)

    const inspectionRows = inspections.map((ins, idx) => ({
      num: idx + 1,
      date: ins.inspectionDate
        ? formatInspectionDateDdMmYyyy(ins.inspectionDate, t("common.dateUnknown"))
        : t("common.dateUnknown"),
      rating: ratingDisplay(ins) ?? t(ratingTranslationKey(ins.rating)),
      inspector: inspectorDisplayName(ins, i18n.language.startsWith("ar")),
      ref: ins.refNumber?.trim() || "—",
      task: ins.taskType?.trim() || "—",
      note: ins.note?.trim(),
    }))

    const trendItems = chartSeries.map((p) => ({
      dateLabel: p.dateLabel,
      ratingLabel: p.name,
      score: p.score,
    }))

    const printIssueDateFormatted = formatPrintIssueDate(new Date(), isRtl)
    const printHeaderActivity = nonEmpty(e.activityType)
      ? String(e.activityType).trim()
      : t("establishmentsPage.detail.printActivityUnspecified")

    const displayName = i18n.language.startsWith("ar") ? e.name : e.nameEn?.trim() || e.name
    const html = buildEstablishmentPrintHtml({
      dir: isRtl ? "rtl" : "ltr",
      lang: isRtl ? "ar" : "en",
      documentTitle: displayName,
      printHeaderTitle: t("establishmentsPage.detail.printHeaderTitle"),
      printHeaderName: displayName,
      printHeaderActivity,
      printIssueDateLabel: t("establishmentsPage.detail.printIssueDate"),
      printIssueDateFormatted,
      sectionEstablishment: t("establishmentsPage.detail.printSectionEstablishment"),
      sectionInspections: t("establishmentsPage.detail.printInspectionsTitle"),
      sectionTrend: t("establishmentsPage.detail.printChartTitle"),
      printChartCaption: t("establishmentsPage.detail.printChartCaption"),
      printChartUnavailable: t("establishmentsPage.detail.printChartUnavailable"),
      emptyInspections: t("establishmentsPage.detail.noInspections"),
      chartNotEnough: t("establishmentsPage.detail.chartNotEnoughPrint"),
      tableNum: "#",
      tableDate: t("establishmentsPage.detail.printColDate"),
      tableRating: t("establishmentsPage.detail.printColRating"),
      tableInspector: t("establishmentsPage.detail.printColInspector"),
      tableRef: t("establishmentsPage.detail.printColRef"),
      tableTask: t("establishmentsPage.detail.printColTask"),
      fields,
      photoUrl: nonEmpty(e.establishmentPhoto) ? String(e.establishmentPhoto).trim() : null,
      inspections: inspectionRows,
      trendItems,
      chartImageDataUrl,
      establishmentNotesPrint: nonEmpty(e.establishmentNote) ? String(e.establishmentNote).trim() : null,
      sectionNotesTitle: t("establishmentsPage.detail.tabNotes"),
    })

    if (!openEstablishmentPrintWindow(html)) {
      toast.error(t("establishmentsPage.detail.printFailed"))
    }
    } finally {
      setIsPrinting(false)
    }
  }

  const renderInfoFields = (e: Establishment, opts?: { forPrint?: boolean }) => (
    <div
      className={cn("space-y-6", opts?.forPrint && "text-black")}
      dir={opts?.forPrint ? (isRtl ? "rtl" : "ltr") : undefined}
    >
      <div className="space-y-3 rounded-lg border border-[#8B1538]/25 bg-card/50 p-4 dark:bg-card/30">
        <p className="text-sm font-bold text-[#8B1538] dark:text-[#c94d6d]">
          📋 {t("establishmentsPage.detail.basic")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label={t("establishmentsPage.detail.name")}>
            {i18n.language.startsWith("ar") ? e.name : e.nameEn?.trim() || e.name}
          </DetailField>
          {nonEmpty(e.nameInEms) ? (
            <DetailField label={t("establishmentsPage.detail.nameEms")}>{e.nameInEms}</DetailField>
          ) : null}
          <DetailField label={t("establishmentsPage.detail.mainArea")}>{areaLabel(e)}</DetailField>
          {nonEmpty(e.location) && e.location !== "—" ? (
            <DetailField label={t("establishmentsPage.detail.location")}>{e.location}</DetailField>
          ) : null}
          <DetailField label={t("establishmentsPage.detail.operationalStatus")}>
            <span
              className={cn(
                "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                operationalStatusClass(e.operationalStatus),
              )}
            >
              {statusLabel(e.operationalStatus)}
            </span>
          </DetailField>
          {nonEmpty(e.activityType) ? (
            <DetailField label={t("establishmentsPage.detail.activityType")}>{e.activityType}</DetailField>
          ) : null}
        </div>
      </div>

      {nonEmpty(e.crNumber) || nonEmpty(e.accountStatusInEms) || e.nbOutlets != null ? (
        <div className="space-y-3 rounded-lg border border-[#8B1538]/25 bg-card/50 p-4 dark:bg-card/30">
          <p className="text-sm font-bold text-[#8B1538] dark:text-[#c94d6d]">
            📊 {t("establishmentsPage.detail.registration")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {nonEmpty(e.crNumber) ? (
              <DetailField label={t("establishmentsPage.detail.crNumber")}>{e.crNumber}</DetailField>
            ) : null}
            {nonEmpty(e.accountStatusInEms) ? (
              <DetailField label={t("establishmentsPage.detail.accountEms")}>
                {e.accountStatusInEms}
              </DetailField>
            ) : null}
            {e.nbOutlets != null && e.nbOutlets >= 0 ? (
              <DetailField label={t("establishmentsPage.detail.nbOutlets")}>{e.nbOutlets}</DetailField>
            ) : null}
          </div>
        </div>
      ) : null}

      {nonEmpty(e.phone) ||
      nonEmpty(e.personInCharge) ||
      nonEmpty(e.email) ||
      nonEmpty(e.serviceHours) ? (
        <div className="space-y-3 rounded-lg border border-[#8B1538]/25 bg-card/50 p-4 dark:bg-card/30">
          <p className="text-sm font-bold text-[#8B1538] dark:text-[#c94d6d]">
            📞 {t("establishmentsPage.detail.contact")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {nonEmpty(e.phone) ? (
              <DetailField label={t("establishmentsPage.detail.phone")}>{e.phone}</DetailField>
            ) : null}
            {nonEmpty(e.personInCharge) ? (
              <DetailField label={t("establishmentsPage.detail.personInCharge")}>
                {e.personInCharge}
              </DetailField>
            ) : null}
            {nonEmpty(e.email) ? (
              <DetailField label={t("establishmentsPage.detail.email")}>{e.email}</DetailField>
            ) : null}
            {nonEmpty(e.serviceHours) ? (
              <DetailField label={t("establishmentsPage.detail.serviceHours")}>
                {e.serviceHours}
              </DetailField>
            ) : null}
          </div>
        </div>
      ) : null}

      {nonEmpty(e.establishmentPhoto) ? (
        <div className="space-y-3 rounded-lg border border-[#8B1538]/25 bg-card/50 p-4 dark:bg-card/30">
          <p className="text-sm font-bold text-[#8B1538] dark:text-[#c94d6d]">
            📷 {t("establishmentsPage.detail.photo")}
          </p>
          <img
            src={e.establishmentPhoto}
            alt=""
            className="max-h-64 max-w-full rounded-md border object-contain"
            crossOrigin="anonymous"
          />
        </div>
      ) : null}
    </div>
  )

  const inspectionsSlice = useMemo(
    () => inspections.slice(0, inspectVisible),
    [inspections, inspectVisible],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="start"
        className={cn(
          "flex w-[min(100%,36rem)] max-w-[42rem] flex-col gap-4 overflow-y-auto border-[#8B1538]/20 bg-sidebar p-4 sm:p-6",
          isRtl && "text-end",
        )}
      >
        {row && establishment ? (
          <>
            <div
              className={cn(
                "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:hidden",
                isRtl && "sm:flex-row-reverse",
              )}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <SheetTitle className="text-balance text-[#8B1538] dark:text-[#c94d6d]">
                  {i18n.language.startsWith("ar")
                    ? establishment.name
                    : establishment.nameEn?.trim() || establishment.name}
                </SheetTitle>
                <SheetDescription className="text-balance">
                  {areaLabel(establishment)}
                  {establishment.location?.trim() && establishment.location !== "—"
                    ? ` · ${establishment.location}`
                    : ""}
                </SheetDescription>
              </div>
              <div
                className={cn(
                  "flex shrink-0 flex-wrap items-center gap-2",
                  isRtl && "sm:flex-row-reverse",
                )}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "gap-2",
                    isPrinting
                      ? "cursor-wait border-muted-foreground/30 bg-muted/80 text-muted-foreground hover:bg-muted/80"
                      : "border-[#8B1538]/35 text-[#8B1538] hover:bg-[#8B1538]/10",
                  )}
                  disabled={loading || isPrinting}
                  aria-busy={isPrinting}
                  onClick={() => void handlePrint()}
                >
                  {isPrinting ? (
                    <>
                      <Loader2Icon className="size-4 shrink-0 animate-spin" aria-hidden />
                      {t("establishmentsPage.detail.printPreparing")}
                    </>
                  ) : (
                    <>
                      <Printer className="size-4 shrink-0" aria-hidden />
                      {t("establishmentsPage.detail.print")}
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="print:hidden">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2Icon className="size-5 animate-spin" aria-hidden />
                {t("establishmentsPage.detail.loading")}
              </div>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive">
                {error === "not_found"
                  ? t("establishmentsPage.detail.notFound")
                  : error}
              </p>
            ) : null}

            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="mb-1 w-full justify-start" dir={isRtl ? "rtl" : "ltr"}>
                <TabsTrigger value="info">{t("establishmentsPage.detail.tabInfo")}</TabsTrigger>
                <TabsTrigger value="inspections">
                  {t("establishmentsPage.detail.tabInspections")}
                </TabsTrigger>
                <TabsTrigger value="chart">{t("establishmentsPage.detail.tabChart")}</TabsTrigger>
                <TabsTrigger value="notes">{t("establishmentsPage.detail.tabNotes")}</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4">
                {renderInfoFields(establishment)}
              </TabsContent>

              <TabsContent value="inspections" className="mt-4 space-y-4">
                {inspections.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    {t("establishmentsPage.detail.noInspections")}
                  </p>
                ) : (
                  <>
                    {inspectionsSlice.map((ins) => {
                      const canEditInsp = canEditInspection(
                        ins,
                        establishment,
                        { role: user.role, areas: user.areas },
                        resolvedAreaIdForPerm,
                      )
                      const canDelInsp = canDeleteInspection(
                        ins,
                        establishment,
                        { role: user.role, areas: user.areas },
                        resolvedAreaIdForPerm,
                      )
                      return (
                      <div
                        key={ins.id}
                        className="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-sm dark:bg-card/40"
                      >
                        <div
                          className={cn(
                            "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
                            isRtl && "sm:flex-row-reverse",
                          )}
                        >
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">
                                {ins.inspectionDate
                                  ? formatInspectionDateDdMmYyyy(
                                      ins.inspectionDate,
                                      t("common.dateUnknown"),
                                    )
                                  : t("common.dateUnknown")}
                              </span>
                              <RatingBadge
                                rating={ins.rating}
                                displayLabel={ratingDisplay(ins)}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("establishmentsPage.detail.inspector")}:{" "}
                              {inspectorDisplayName(ins, i18n.language.startsWith("ar"))}
                            </p>
                            {ins.refNumber ? (
                              <p className="text-xs text-muted-foreground">
                                {t("establishmentsPage.detail.refNumber")}: {ins.refNumber}
                              </p>
                            ) : null}
                            {ins.taskType ? (
                              <p className="text-xs text-muted-foreground">
                                {t("establishmentsPage.detail.taskType")}: {ins.taskType}
                              </p>
                            ) : null}
                            {ins.note ? (
                              <p className="whitespace-pre-wrap text-sm">{ins.note}</p>
                            ) : null}
                          </div>
                          <div
                            className={cn(
                              "flex shrink-0 flex-wrap gap-2",
                              isRtl ? "sm:justify-start" : "sm:justify-end",
                            )}
                          >
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 border-[#8B1538]/35 text-[#8B1538] hover:bg-[#8B1538]/10"
                              disabled={!canEditInsp}
                              onClick={() => handleEditInspectionClick(ins)}
                            >
                              <Pencil className="size-3.5 shrink-0" aria-hidden />
                              {t("addInspection.editShort")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={cn(
                                "h-8 gap-1 text-red-600 hover:bg-red-50 hover:text-red-700",
                                !canDelInsp && "cursor-not-allowed opacity-50",
                              )}
                              disabled={!canDelInsp}
                              onClick={() => handleDeleteInspectionClick(ins)}
                            >
                              <Trash2 className="size-3.5 shrink-0" aria-hidden />
                              {t("addInspection.deleteShort")}
                              {!canDelInsp ? (
                                <Lock className="size-3.5 shrink-0" aria-hidden />
                              ) : null}
                            </Button>
                          </div>
                        </div>
                      </div>
                      )
                    })}
                    {inspectVisible < inspections.length ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full border-[#8B1538]/35"
                        onClick={() =>
                          setInspectVisible((n) =>
                            Math.min(n + INSPECTIONS_PAGE, inspections.length),
                          )
                        }
                      >
                        {t("establishmentsPage.detail.showMore")}
                      </Button>
                    ) : null}
                  </>
                )}
              </TabsContent>

              <TabsContent value="chart" className="mt-4">
                {chartDatedTotal < 2 ? (
                  <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {t("establishmentsPage.detail.chartNotEnough")}
                  </p>
                ) : (
                  <div
                    ref={chartCaptureRef}
                    data-print-chart-capture=""
                    className="flex w-full min-w-0 flex-col gap-2 rounded-lg border border-border bg-card/40 p-2 dark:bg-card/25"
                  >
                    <p
                      className="px-1 text-center text-xs text-muted-foreground"
                      dir={isRtl ? "rtl" : "ltr"}
                    >
                      {chartDatedTotal > chartSeries.length
                        ? t("establishmentsPage.detail.chartShowingLastTruncated", {
                            shown: chartSeries.length,
                            total: chartDatedTotal,
                          })
                        : t("establishmentsPage.detail.chartShowingLast", {
                            count: chartSeries.length,
                          })}
                    </p>
                    <div dir="ltr" className="h-[300px] w-full min-w-0 md:h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartDataForDisplay}
                        margin={{
                          top: 12,
                          bottom: 8,
                          left: yAxisOrientation === "left" ? (showRatingNamesOnY ? 4 : 10) : 10,
                          right: yAxisOrientation === "right" ? (showRatingNamesOnY ? 4 : 10) : 12,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          dataKey="id"
                          type="category"
                          tickFormatter={chartXTickFormatter}
                          interval={0}
                          angle={0}
                          textAnchor="middle"
                          height={60}
                          padding={{ left: 8, right: 8 }}
                          tick={{ fontSize: 10 }}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          domain={[1, 6]}
                          ticks={[1, 2, 3, 4, 5, 6]}
                          orientation={yAxisOrientation}
                          width={yAxisWidth}
                          tick={(tickProps) => {
                            const p = tickProps.payload as { value?: number }
                            return (
                              <RatingYAxisTick
                                x={tickProps.x}
                                y={tickProps.y}
                                payload={{ value: Number(p?.value ?? 0) }}
                                showNames={showRatingNamesOnY}
                                orientation={yAxisOrientation}
                                t={t}
                              />
                            )
                          }}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const p = payload[0]?.payload as (typeof chartSeries)[0]
                            const hasInspector =
                              Boolean(p.inspector) &&
                              p.inspector !== "—" &&
                              p.inspector.length > 0
                            return (
                              <div
                                className="max-w-[min(90vw,18rem)] rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
                                dir={isRtl ? "rtl" : "ltr"}
                              >
                                <p className="font-semibold text-foreground">
                                  {t("establishmentsPage.detail.chartTooltipDate", {
                                    date: p.dateLabel,
                                  })}
                                </p>
                                <p
                                  className="mt-1 font-medium"
                                  style={{ color: p.fill ?? "#8B1538" }}
                                >
                                  {t("establishmentsPage.detail.chartTooltipRating", {
                                    rating: p.ratingLabelLocalized,
                                  })}
                                </p>
                                {hasInspector ? (
                                  <p className="mt-0.5 break-words text-muted-foreground">
                                    {t("establishmentsPage.detail.chartTooltipInspector", {
                                      inspector: p.inspector,
                                    })}
                                  </p>
                                ) : null}
                              </div>
                            )
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke="#8B1538"
                          strokeWidth={2}
                          isAnimationActive={false}
                          dot={(props: {
                            cx?: number
                            cy?: number
                            payload?: (typeof chartSeries)[0]
                          }) => {
                            const { cx, cy, payload } = props
                            if (cx == null || cy == null) return <g />
                            return (
                              <circle
                                cx={cx}
                                cy={cy}
                                r={5}
                                fill={payload?.fill ?? "#8B1538"}
                                stroke="#fff"
                                strokeWidth={1}
                              />
                            )
                          }}
                          activeDot={{ r: 7 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="notes" className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t("establishmentsPage.detail.notesEditorHint")}
                </p>
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => void commitNotesIfDirty()}
                  dir={isRtl ? "rtl" : "ltr"}
                  disabled={loading || savingNotes}
                  placeholder={t("addInspection.notesPlaceholder")}
                  className="min-h-[10rem] resize-y whitespace-pre-wrap"
                />
                <div
                  className={cn(
                    "flex",
                    isRtl ? "justify-start" : "justify-end",
                  )}
                >
                  <Button
                    type="button"
                    className="bg-[#8B1538] text-white hover:bg-[#8B1538]/90"
                    disabled={loading || savingNotes}
                    onClick={() => void commitNotesIfDirty()}
                  >
                    {savingNotes ? (
                      <Loader2Icon className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    {t("establishmentsPage.detail.notesSave")}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            <AddInspectionDialog
              open={editInspectionOpen}
              onOpenChange={(next) => {
                setEditInspectionOpen(next)
                if (!next) setEditingInspection(null)
              }}
              row={row}
              editingInspection={editingInspection}
              establishmentAreaIdResolved={resolvedAreaIdForPerm}
              onSuccess={() => {
                setEditInspectionOpen(false)
                setEditingInspection(null)
                void refetchInspections()
                onInspectionsChanged?.()
              }}
            />

            <DeleteInspectionConfirmDialog
              open={deleteInspectionOpen}
              onOpenChange={(next) => {
                setDeleteInspectionOpen(next)
                if (!next) {
                  setDeleteInspectionTarget(null)
                  setDeleteInspectionSubmitting(false)
                }
              }}
              title={t("addInspection.deleteDialog.confirmTitle")}
              message={t("addInspection.deleteDialog.confirmMessage")}
              details={deleteInspectionDialogDetails}
              warning={t("addInspection.deleteDialog.warningCannotUndo")}
              cancelLabel={t("addInspection.cancel")}
              confirmLabel={t("addInspection.deleteDialog.confirm")}
              deleting={deleteInspectionSubmitting}
              onConfirm={() => {
                const ins = deleteInspectionTarget
                if (ins) void confirmDeleteInspection(ins)
              }}
              dir={isRtl ? "rtl" : "ltr"}
            />

            <div
              className={cn(
                "mt-4 flex flex-col gap-2 border-t border-border pt-4",
                isRtl && "sm:flex-row-reverse",
              )}
            >
              <Button
                type="button"
                className="w-full bg-[#8B1538] text-white hover:bg-[#8B1538]/90"
                onClick={() => row && onAddInspection(row)}
              >
                📋 {t("establishmentsPage.actions.addInspection")}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                {t("establishmentsPage.quick.close")}
              </Button>
            </div>
            </div>

          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
