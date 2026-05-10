import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BellIcon,
  Building2,
  CalendarIcon,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  LayoutList,
  Loader2Icon,
  Lock,
  MapPin,
  Pencil,
  Plus,
  RefreshCwIcon,
  Search,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"
import toast from "react-hot-toast"

import { useAuth } from "@/auth/AuthContext"
import { RatingBadge } from "@/components/dashboard/EstablishmentsTable"
import { AddEstablishmentDialog } from "@/features/establishments/AddEstablishmentDialog"
import { AddInspectionDialog } from "@/features/establishments/AddInspectionDialog"
import { DeleteEstablishmentConfirmDialog } from "@/features/establishments/DeleteEstablishmentConfirmDialog"
import { EstablishmentDetailSheet } from "@/features/establishments/EstablishmentDetailSheet"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import type { InspectionRating, OperationalStatus } from "@/data/rawData"
import { shouldAlert } from "@/data/establishmentsTable"
import { useFilterAreas } from "@/hooks/useFilterAreas"
import { useEstablishments } from "@/hooks/useEstablishments"
import type { DataTableSortMode, EnrichedEstablishmentRow } from "@/lib/dataTableModel"
import { canDeleteEstablishment } from "@/lib/permissions/canDeleteEstablishment"
import { canEditEstablishment } from "@/lib/permissions/canEditEstablishment"
import {
  exportEstablishmentsExcel,
  exportEstablishmentsPdf,
  type EstablishmentsExportColumnTitles,
  type EstablishmentsExportRow,
} from "@/lib/dataTableExport"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const VIEW_STORAGE_KEY = "establishments_view_mode"
type ViewMode = "list" | "cards" | "table"

const LIST_CHUNK = 20
const CARD_CHUNK = 18
const TABLE_CHUNK = 20
const TABLE_MIN_W = 1200

const STATUS_OPTIONS: OperationalStatus[] = [
  "Open",
  "Closed",
  "Temporary Closed",
  "Open Soon",
]

const RATING_FILTERS: ("all" | InspectionRating)[] = [
  "all",
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Poor",
  "Very Poor",
]

const QUICK_RATING_ORDER: InspectionRating[] = [
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Poor",
  "Very Poor",
]

const RATING_HEX: Record<InspectionRating, string> = {
  Excellent: "#16a34a",
  "Very Good": "#84cc16",
  Good: "#ca8a04",
  Fair: "#ea580c",
  Poor: "#dc2626",
  "Very Poor": "#991b1b",
}

/** Sort modes exposed in Establishments filter toolbar (rating sort removed). */
const ESTABLISHMENT_SORT_MODES: DataTableSortMode[] = [
  "name_az",
  "name_za",
  "insp_new",
  "insp_old",
  "days_recent",
  "days_stale",
  "count_most",
  "count_least",
]

/** English operational status labels for PDF export (avoid i18n keys). */
const OPERATIONAL_STATUS_PDF_EN: Record<OperationalStatus, string> = {
  Open: "Open",
  Closed: "Closed",
  "Temporary Closed": "Temporary Closed",
  "Open Soon": "Open Soon",
}

const selectBase = cn(
  "h-9 min-h-9 w-full appearance-none rounded-lg border border-border bg-card",
  "px-2 py-1.5 pe-8 text-xs font-medium shadow-sm",
  "md:h-10 md:min-h-10 md:px-3 md:py-2 md:pe-9 md:text-sm",
  "transition-[border-color,box-shadow] duration-200 hover:border-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "cursor-pointer",
  "placeholder:text-xs md:placeholder:text-sm",
)

const dateInputBase = cn(
  "h-9 min-h-9 w-full rounded-lg border border-border bg-card",
  "px-2 py-1.5 text-xs font-medium shadow-sm text-foreground",
  "md:h-10 md:min-h-10 md:px-3 md:py-2 md:text-sm",
  "transition-[border-color,box-shadow] duration-200 hover:border-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "placeholder:text-xs md:placeholder:text-sm",
)

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

function ratingEmoji(rating: InspectionRating | null): string {
  if (!rating) return "⚪"
  if (rating === "Excellent" || rating === "Very Good") return "🟢"
  if (rating === "Good" || rating === "Fair") return "🟡"
  return "🔴"
}

function ratingBarBorderClass(rating: InspectionRating | null): string {
  if (!rating) return "border-t-muted-foreground/40"
  switch (rating) {
    case "Excellent":
      return "border-t-green-500"
    case "Very Good":
      return "border-t-lime-500"
    case "Good":
      return "border-t-yellow-500"
    case "Fair":
      return "border-t-orange-500"
    case "Poor":
      return "border-t-red-500"
    case "Very Poor":
      return "border-t-red-700"
    default:
      return "border-t-muted-foreground/40"
  }
}

function daysToneClass(days: number | null): string {
  if (days == null) return "text-muted-foreground"
  if (days <= 30) return "text-green-700 dark:text-green-400"
  if (days <= 90) return "text-amber-700 dark:text-amber-400"
  return "text-red-700 dark:text-red-400"
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

type HeaderSortId = "name" | "lastInsp" | "daysAgo" | "count"

function headerSortIcon(
  id: HeaderSortId,
  mode: DataTableSortMode,
): typeof ArrowUpDown {
  const map: Record<HeaderSortId, [DataTableSortMode, DataTableSortMode]> = {
    name: ["name_az", "name_za"],
    lastInsp: ["insp_new", "insp_old"],
    daysAgo: ["days_recent", "days_stale"],
    count: ["count_most", "count_least"],
  }
  const [a, b] = map[id]
  if (mode === a) return ArrowUp
  if (mode === b) return ArrowDown
  return ArrowUpDown
}

function SortableTh({
  children,
  sortId,
  sortMode,
  onSort,
  align = "center",
  className,
}: {
  children: ReactNode
  sortId: HeaderSortId
  sortMode: DataTableSortMode
  onSort: (id: HeaderSortId) => void
  align?: "start" | "center"
  className?: string
}) {
  const Icon = headerSortIcon(sortId, sortMode)
  const justify = align === "start" ? "justify-start" : "justify-center"
  const text = align === "start" ? "text-start" : "text-center"
  return (
    <th scope="col" className={cn(className, text)}>
      <button
        type="button"
        onClick={() => onSort(sortId)}
        className={cn(
          "inline-flex w-full items-center gap-1 rounded text-inherit hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          justify,
        )}
      >
        {children}
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    </th>
  )
}

function readStoredViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY)
    if (v === "list" || v === "cards" || v === "table") return v
  } catch {
    /* private mode */
  }
  return "list"
}

export function EstablishmentsPage() {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language.startsWith("ar")
  const langAr = i18n.language.toLowerCase().startsWith("ar")
  const showPdfExport = !langAr
  const tEn = i18n.getFixedT(null, "translation", "en")
  const location = useLocation()
  const prevPathRef = useRef<string | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>(() => readStoredViewMode())
  const [search, setSearch] = useState("")
  const [area, setArea] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<OperationalStatus | "all">("all")
  const [ratingFilter, setRatingFilter] = useState<InspectionRating | "all">("all")
  const [sortMode, setSortMode] = useState<DataTableSortMode>("name_az")
  const [lastInspectionFrom, setLastInspectionFrom] = useState("")
  const [lastInspectionTo, setLastInspectionTo] = useState("")
  const [visibleCount, setVisibleCount] = useState(LIST_CHUNK)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickRow, setQuickRow] = useState<EnrichedEstablishmentRow | null>(null)
  const [addInspectionTarget, setAddInspectionTarget] =
    useState<EnrichedEstablishmentRow | null>(null)
  const [alertBannerOpen, setAlertBannerOpen] = useState(true)
  const [detailReloadKey, setDetailReloadKey] = useState(0)
  const [showAddEstablishment, setShowAddEstablishment] = useState(false)
  const [showEditEstablishment, setShowEditEstablishment] = useState(false)
  const [editEstablishmentRow, setEditEstablishmentRow] =
    useState<EnrichedEstablishmentRow | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTargetRow, setDeleteTargetRow] = useState<EnrichedEstablishmentRow | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [isMdUp, setIsMdUp] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  )

  const { user } = useAuth()

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const onChange = () => setIsMdUp(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const filtersPanelOpen = isMdUp || mobileFiltersOpen

  const listSentinelRef = useRef<HTMLDivElement>(null)
  const cardSentinelRef = useRef<HTMLDivElement>(null)
  const tableSentinelRef = useRef<HTMLDivElement>(null)

  const {
    data: areaRows,
    loading: areasLoading,
    refetch: refetchAreas,
  } = useFilterAreas()
  useEffect(() => {
    const prev = prevPathRef.current
    prevPathRef.current = location.pathname
    if (location.pathname === "/establishments" && prev !== null && prev !== "/establishments") {
      void refetchAreas()
    }
  }, [location.pathname, refetchAreas])

  const areaIdResolved = useMemo(() => {
    if (area === "all") return undefined
    const hit = areaRows.find((x) => x.nameAr === area || x.nameEn === area)
    return hit?.id
  }, [area, areaRows])

  const {
    sortedAll,
    loading: rowsLoading,
    error: rowsError,
    totalFiltered,
    refetch: refetchRows,
  } = useEstablishments({
    search,
    areaId: areaIdResolved,
    statusEn: statusFilter,
    ratingEn: ratingFilter,
    sortMode,
    page: 1,
    pageSize: 20,
    lastInspectionFrom: lastInspectionFrom || null,
    lastInspectionTo: lastInspectionTo || null,
    dateUnknownLabel: t("common.dateUnknown"),
  })

  const loading = rowsLoading

  useEffect(() => {
    if (sortMode === "rating_best" || sortMode === "rating_worst") {
      setSortMode("name_az")
    }
  }, [sortMode])

  useEffect(() => {
    if (rowsError) toast.error(rowsError)
  }, [rowsError])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode)
    } catch {
      /* ignore */
    }
  }, [viewMode])

  const chunkForMode = viewMode === "cards" ? CARD_CHUNK : LIST_CHUNK
  useEffect(() => {
    setVisibleCount(chunkForMode)
  }, [
    search,
    area,
    statusFilter,
    ratingFilter,
    sortMode,
    lastInspectionFrom,
    lastInspectionTo,
    viewMode,
  ])

  const openQuick = useCallback((row: EnrichedEstablishmentRow) => {
    setQuickRow(row)
    setQuickOpen(true)
  }, [])

  const closeQuick = useCallback(() => {
    setQuickOpen(false)
    setQuickRow(null)
  }, [])

  const openAddInspection = useCallback((r: EnrichedEstablishmentRow) => {
    setAddInspectionTarget(r)
  }, [])

  useEffect(() => {
    if (!quickOpen || !quickRow) return
    const id = quickRow.establishment.id
    const next = sortedAll.find((r) => r.establishment.id === id)
    if (next) setQuickRow(next)
  }, [sortedAll, quickOpen, quickRow?.establishment.id])

  /** Load more when sentinel visible */
  useEffect(() => {
    const sentinel =
      viewMode === "list"
        ? listSentinelRef.current
        : viewMode === "cards"
          ? cardSentinelRef.current
          : tableSentinelRef.current
    if (!sentinel || loading) return

    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (e?.isIntersecting && visibleCount < sortedAll.length) {
          const step = viewMode === "cards" ? CARD_CHUNK : viewMode === "table" ? TABLE_CHUNK : LIST_CHUNK
          setVisibleCount((n) => Math.min(n + step, sortedAll.length))
        }
      },
      { rootMargin: "120px" },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [viewMode, loading, visibleCount, sortedAll.length])

  const displayRows = useMemo(
    () => sortedAll.slice(0, visibleCount),
    [sortedAll, visibleCount],
  )

  const areaOptions = useMemo(
    () => ["all", ...areaRows.map((r) => r.nameAr)] as string[],
    [areaRows],
  )

  const areaSelectLabel = useCallback(
    (a: string) => {
      if (a === "all") return t("dataTable.filter.allAreas")
      const row = areaRows.find((x) => x.nameAr === a || x.nameEn === a)
      if (!row) return a
      return i18n.language === "ar" ? row.nameAr : row.nameEn || row.nameAr
    },
    [areaRows, i18n.language, t],
  )

  const establishmentAreaLabel = useCallback(
    (areaStr: string) => {
      const row = areaRows.find((x) => x.nameAr === areaStr || x.nameEn === areaStr)
      if (row) return i18n.language === "ar" ? row.nameAr : row.nameEn || row.nameAr
      return areaStr
    },
    [areaRows, i18n.language],
  )

  useEffect(() => {
    if (area === "all") return
    if (areasLoading) return
    const ok = areaRows.some((x) => x.nameAr === area || x.nameEn === area)
    if (!ok) setArea("all")
  }, [areaRows, area, areasLoading])

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

  const ratingBadgeDisplayLabel = useCallback(
    (r: EnrichedEstablishmentRow) => {
      if (!r.latestRating) return undefined
      if (i18n.language.startsWith("ar")) return t(ratingTranslationKey(r.latestRating))
      const en = r.latestRatingNameEn?.trim()
      if (en) return en
      return undefined
    },
    [i18n.language, t],
  )

  const ratingExportLabel = useCallback(
    (row: EnrichedEstablishmentRow) => {
      const lbl = ratingBadgeDisplayLabel(row)
      if (lbl) return lbl
      if (row.latestRating) return t(ratingTranslationKey(row.latestRating))
      return t("dataTable.noRating")
    },
    [ratingBadgeDisplayLabel, t],
  )

  const visitsLabel = useCallback(
    (n: number) => t("dataTable.visits", { count: n }),
    [t],
  )

  const daysAgoLabel = useCallback(
    (days: number | null) => {
      if (days == null) return t("dataTable.noInspection")
      const unit = days === 1 ? t("dataTable.day") : t("dataTable.days")
      return `${days}\u00A0${unit}`
    },
    [t],
  )

  const excelColTitles: EstablishmentsExportColumnTitles = useMemo(
    () => ({
      rowNum: "#",
      name: t("dataTable.col.name"),
      area: t("dataTable.col.area"),
      location: t("dataTable.col.location"),
      status: t("dataTable.col.status"),
      lastInspection: t("dataTable.col.lastInspection"),
      daysAgo: t("dataTable.col.daysAgo"),
      rating: t("dataTable.col.rating"),
      inspectionCount: t("dataTable.col.inspectionCount"),
    }),
    [t],
  )

  const pdfColTitles: EstablishmentsExportColumnTitles = useMemo(
    () => ({
      rowNum: "#",
      name: tEn("dataTable.col.name"),
      area: tEn("dataTable.col.area"),
      location: tEn("dataTable.col.location"),
      status: tEn("dataTable.col.status"),
      lastInspection: tEn("dataTable.col.lastInspection"),
      daysAgo: tEn("dataTable.col.daysAgo"),
      rating: tEn("dataTable.col.rating"),
      inspectionCount: tEn("dataTable.col.inspectionCount"),
    }),
    [tEn],
  )

  const buildExcelExportRows = useCallback((): EstablishmentsExportRow[] => {
    return sortedAll.map((row, i) => {
      const e = row.establishment
      const name = langAr ? e.name : e.nameEn?.trim() || e.name
      return {
        rowNum: i + 1,
        name,
        area: establishmentAreaLabel(String(e.area)),
        location: e.location?.trim() ?? "",
        status: statusLabel(e.operationalStatus),
        lastInspection: row.lastInspectionFormatted,
        daysAgo: daysAgoLabel(row.daysAgo),
        rating: ratingExportLabel(row),
        inspectionCount: String(row.inspectionCount),
      }
    })
  }, [
    sortedAll,
    langAr,
    establishmentAreaLabel,
    statusLabel,
    daysAgoLabel,
    ratingExportLabel,
  ])

  const buildPdfExportRows = useCallback((): EstablishmentsExportRow[] => {
    const daysEn = (days: number | null) => {
      if (days == null) return tEn("dataTable.noInspection")
      const unit = days === 1 ? tEn("dataTable.day") : tEn("dataTable.days")
      return `${days}\u00A0${unit}`
    }
    const ratingEnText = (row: EnrichedEstablishmentRow) =>
      row.latestRatingNameEn?.trim() ||
      (row.latestRating != null ? row.latestRating : tEn("dataTable.noRating"))

    return sortedAll.map((row, i) => {
      const e = row.establishment
      return {
        rowNum: i + 1,
        name: e.nameEn?.trim() || e.name,
        area: row.areaNameEn?.trim() || "—",
        location: e.location?.trim() ?? "",
        status: OPERATIONAL_STATUS_PDF_EN[e.operationalStatus],
        lastInspection: row.lastInspectionFormatted,
        daysAgo: daysEn(row.daysAgo),
        rating: ratingEnText(row),
        inspectionCount: String(row.inspectionCount),
      }
    })
  }, [sortedAll, tEn])

  const handleExportExcel = () => {
    try {
      const rows = buildExcelExportRows()
      exportEstablishmentsExcel(rows, excelColTitles, "establishments")
      toast.success(t("establishmentsPage.export.success", { count: rows.length }))
    } catch {
      toast.error(t("establishmentsPage.export.failed"))
    }
  }

  const handleExportPdf = () => {
    try {
      const rows = buildPdfExportRows()
      exportEstablishmentsPdf(
        rows,
        pdfColTitles,
        tEn("dataTable.pdfHeader1"),
        tEn("dataTable.pdfHeader2"),
        "establishments",
      )
      toast.success(t("establishmentsPage.export.success", { count: rows.length }))
    } catch {
      toast.error(t("establishmentsPage.export.failed"))
    }
  }

  const ratingQuickCounts = useMemo(() => {
    const m = new Map<InspectionRating, number>()
    for (const r of QUICK_RATING_ORDER) m.set(r, 0)
    for (const row of sortedAll) {
      const rt = row.latestRating
      if (rt) m.set(rt, (m.get(rt) ?? 0) + 1)
    }
    return m
  }, [sortedAll])

  const reinspectionCount = useMemo(
    () =>
      sortedAll.filter((row) => {
        if (!row.latestRating || row.daysAgo == null) return false
        return shouldAlert(row.latestRating, row.daysAgo).needsAlert
      }).length,
    [sortedAll],
  )

  const clearFilters = () => {
    setSearch("")
    setArea("all")
    setStatusFilter("all")
    setRatingFilter("all")
    setSortMode("name_az")
    setLastInspectionFrom("")
    setLastInspectionTo("")
  }

  const onHeaderSort = (id: HeaderSortId) => {
    const map: Record<HeaderSortId, [DataTableSortMode, DataTableSortMode]> = {
      name: ["name_az", "name_za"],
      lastInsp: ["insp_new", "insp_old"],
      daysAgo: ["days_recent", "days_stale"],
      count: ["count_most", "count_least"],
    }
    const [a, b] = map[id]
    setSortMode((m) => (m === a ? b : a))
  }

  const resolveRowAreaId = useCallback(
    (row: EnrichedEstablishmentRow) => {
      if (row.establishment.areaId) return row.establishment.areaId
      const e = row.establishment
      const ar = String(e.area ?? "").trim()
      const rowEn = String(row.areaNameEn ?? "").trim()
      const hit = areaRows.find(
        (a) =>
          a.nameAr.trim() === ar ||
          a.nameEn.trim() === ar ||
          (rowEn !== "" &&
            (a.nameEn.trim() === rowEn || a.nameAr.trim() === rowEn)),
      )
      return hit?.id ?? ""
    },
    [areaRows],
  )

  const openDeleteConfirm = useCallback(
    (row: EnrichedEstablishmentRow) => {
      const areaIdForPerm = resolveRowAreaId(row) || null
      if (
        !canDeleteEstablishment(
          { area_id: areaIdForPerm },
          { role: user.role, areas: user.areas },
        )
      ) {
        toast.error(t("establishmentsPage.deleteDialog.noPermission"))
        return
      }
      setDeleteTargetRow(row)
      setDeleteConfirmOpen(true)
    },
    [resolveRowAreaId, user.role, user.areas, t],
  )

  const handleConfirmDeleteEstablishment = useCallback(async () => {
    const row = deleteTargetRow
    if (!row) return
    const areaIdForPerm = resolveRowAreaId(row) || null
    if (
      !canDeleteEstablishment(
        { area_id: areaIdForPerm },
        { role: user.role, areas: user.areas },
      )
    ) {
      toast.error(t("establishmentsPage.deleteDialog.noPermission"))
      setDeleteConfirmOpen(false)
      setDeleteTargetRow(null)
      return
    }
    const inspectionCount = row.inspectionCount
    setDeleteSubmitting(true)
    try {
      const { error } = await supabase
        .from("establishments")
        .delete()
        .eq("id", row.establishment.id)
      if (error) throw error
      toast.success(
        t("establishmentsPage.deleteDialog.success", { count: inspectionCount }),
      )
      setDeleteConfirmOpen(false)
      setDeleteTargetRow(null)
      refetchRows()
      setDetailReloadKey((k) => k + 1)
    } catch (e) {
      console.error(e)
      toast.error(t("establishmentsPage.deleteDialog.error"))
    } finally {
      setDeleteSubmitting(false)
    }
  }, [
    deleteTargetRow,
    resolveRowAreaId,
    user.role,
    user.areas,
    t,
    refetchRows,
  ])

  const viewToggleClass = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-200",
      active
        ? "bg-[#8B1538] text-white shadow-sm"
        : "bg-card text-[#8B1538] border border-[#8B1538]/40 hover:bg-[#8B1538]/10",
    )

  const EstablishmentActions = ({
    row,
    alignEnd = true,
    variant = "icon",
  }: {
    row: EnrichedEstablishmentRow
    alignEnd?: boolean
    variant?: "icon" | "button"
  }) => {
    const areaIdForPerm = resolveRowAreaId(row) || null
    const canEditRow = canEditEstablishment(
      { area_id: areaIdForPerm },
      { role: user.role, areas: user.areas },
    )
    const canDeleteRow = canDeleteEstablishment(
      { area_id: areaIdForPerm },
      { role: user.role, areas: user.areas },
    )

    return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant === "button" ? "outline" : "ghost"}
          size={variant === "button" ? "sm" : "icon"}
          className={cn(
            "shrink-0",
            variant === "icon" && "size-9 text-[#8B1538]",
            variant === "button" &&
              "border-[#8B1538]/35 text-[#8B1538] hover:bg-[#8B1538]/10",
          )}
          aria-label={t("establishmentsPage.actions.menu")}
          onClick={(e) => e.stopPropagation()}
        >
          {variant === "button" ? (
            <span className="flex items-center gap-1">
              <Sparkles className="size-4" aria-hidden />
              {t("establishmentsPage.actions.trigger")}
            </span>
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={alignEnd ? "end" : "start"}
        className="min-w-[14rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem
          className="font-semibold text-[#8B1538] focus:text-[#8B1538]"
          onSelect={() => openAddInspection(row)}
        >
          📋 {t("establishmentsPage.actions.addInspection")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openQuick(row)}>
          👁️ {t("establishmentsPage.actions.viewDetails")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn(
            !canEditRow && "cursor-not-allowed opacity-50",
            canEditRow && "focus:text-[#8B1538]",
          )}
          aria-disabled={!canEditRow}
          onSelect={(e) => {
            if (!canEditRow) {
              e.preventDefault()
              toast.error(t("establishmentsPage.editDialog.noPermission"))
              return
            }
            setEditEstablishmentRow(row)
            setShowEditEstablishment(true)
          }}
        >
          <span className={cn("flex w-full items-center gap-2", isRtl && "flex-row-reverse")}>
            <Pencil className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              {t("establishmentsPage.actions.editEstablishment")}
            </span>
            {!canEditRow ? (
              <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={cn(
            !canDeleteRow && "cursor-not-allowed opacity-50",
            canDeleteRow && "text-red-600 focus:text-red-600",
          )}
          aria-disabled={!canDeleteRow}
          onSelect={(e) => {
            if (!canDeleteRow) {
              e.preventDefault()
              toast.error(t("establishmentsPage.deleteDialog.noPermission"))
              return
            }
            openDeleteConfirm(row)
          }}
        >
          <span className={cn("flex w-full items-center gap-2", isRtl && "flex-row-reverse")}>
            <Trash2 className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              {t("establishmentsPage.actions.deleteEstablishment")}
            </span>
            {!canDeleteRow ? (
              <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-28 md:pb-8">
      <header
        className={cn(
          "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between",
        )}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-[#8B1538] dark:text-[#c94d6d]">
              {t("establishmentsPage.title")}
            </h1>
            <span className="rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/15 px-3 py-0.5 text-sm font-bold tabular-nums text-[#6B0F2A] dark:text-[#fcd34d]">
              ({totalFiltered})
            </span>
          </div>
        </div>

        <div
          className={cn(
            "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center",
            isRtl && "sm:flex-row-reverse",
          )}
        >
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("establishmentsPage.searchPlaceholder")}
              className="h-10 ps-9"
              aria-label={t("establishmentsPage.searchPlaceholder")}
            />
          </div>
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              isRtl && "flex-row-reverse sm:flex-row-reverse",
            )}
          >
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-[#8B1538]/35 text-[#8B1538] hover:bg-[#8B1538]/10"
              onClick={() => handleExportExcel()}
              disabled={loading || sortedAll.length === 0}
              aria-label={t("establishmentsPage.export.excel")}
            >
              <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
              <span>{t("establishmentsPage.export.excel")}</span>
            </Button>
            {showPdfExport ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-[#8B1538]/35 text-[#8B1538] hover:bg-[#8B1538]/10"
                onClick={() => handleExportPdf()}
                disabled={loading || sortedAll.length === 0}
                aria-label={t("establishmentsPage.export.pdf")}
              >
                <FileText className="size-4 shrink-0" aria-hidden />
                <span>{t("establishmentsPage.export.pdf")}</span>
              </Button>
            ) : null}
            <Button
              type="button"
              className="gap-2 whitespace-nowrap bg-[#8B1538] text-white hover:bg-[#8B1538]/90"
              onClick={() => setShowAddEstablishment(true)}
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              {t("establishmentsPage.addEstablishment")}
            </Button>
          </div>
        </div>
      </header>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="space-y-2 p-3 md:space-y-4 md:p-5">
          <button
            type="button"
            id="establishments-filters-toggle"
            aria-expanded={mobileFiltersOpen}
            aria-controls="establishments-filters-panel"
            className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/35 px-3 py-2 text-start text-xs font-medium shadow-sm transition-colors hover:bg-muted/55 md:hidden"
            onClick={() => setMobileFiltersOpen((v) => !v)}
          >
            <span>
              {mobileFiltersOpen
                ? t("establishmentsPage.filtersToggleHide")
                : t("establishmentsPage.filtersToggleShow")}
            </span>
          </button>

          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-in-out",
              filtersPanelOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              "md:grid-rows-[1fr]",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                id="establishments-filters-panel"
                role="search"
                inert={!filtersPanelOpen && !isMdUp}
                className={cn(
                  "flex flex-col gap-2 md:gap-3 xl:flex-row xl:flex-wrap xl:items-end",
                  "max-md:mt-1 max-md:rounded-xl max-md:border max-md:border-border/90 max-md:bg-card/80 max-md:p-3 max-md:shadow-sm",
                )}
              >
                <div
                  className={cn(
                    "grid w-full min-w-0 gap-2 md:gap-3 xl:flex-1",
                    "max-md:grid-cols-6",
                    "md:grid md:grid-cols-2 lg:grid-cols-3",
                    "xl:flex xl:flex-wrap",
                  )}
                >
                  <div className="min-w-[140px] space-y-0.5 max-md:col-span-2 md:space-y-1">
                    <Label className="max-md:text-xs" htmlFor="est-area">
                      {t("dataTable.filter.area")}
                    </Label>
                    <div className="flex gap-1.5 md:gap-2">
                      <select
                        id="est-area"
                        value={area}
                        disabled={areasLoading && areaRows.length === 0}
                        onChange={(e) => setArea(e.target.value)}
                        className={cn(selectBase, "min-w-0 flex-1")}
                      >
                        {areaOptions.map((a) => (
                          <option key={a} value={a}>
                            {areaSelectLabel(a)}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 min-h-9 w-9 shrink-0 md:h-10 md:min-h-10 md:w-10"
                        onClick={() => refetchAreas()}
                        disabled={areasLoading}
                        aria-label={t("dashboard.refreshAreasAria")}
                      >
                        {areasLoading ? (
                          <Loader2Icon className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <RefreshCwIcon className="size-4" aria-hidden />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="min-w-[140px] space-y-0.5 max-md:col-span-2 md:space-y-1">
                    <Label className="max-md:text-xs" htmlFor="est-status">
                      {t("dataTable.filter.status")}
                    </Label>
                    <select
                      id="est-status"
                      value={statusFilter}
                      onChange={(e) =>
                        setStatusFilter(e.target.value as OperationalStatus | "all")
                      }
                      className={selectBase}
                    >
                      <option value="all">{t("dataTable.filter.allStatuses")}</option>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[140px] space-y-0.5 max-md:col-span-2 md:space-y-1">
                    <Label className="max-md:text-xs" htmlFor="est-rating">
                      {t("dataTable.filter.rating")}
                    </Label>
                    <select
                      id="est-rating"
                      value={ratingFilter}
                      onChange={(e) =>
                        setRatingFilter(e.target.value as InspectionRating | "all")
                      }
                      className={selectBase}
                    >
                      {RATING_FILTERS.map((r) => (
                        <option key={r} value={r}>
                          {r === "all"
                            ? t("dataTable.filter.allRatings")
                            : t(ratingTranslationKey(r))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="hidden min-w-[160px] space-y-1 md:block">
                    <Label className="max-md:text-xs" htmlFor="est-sort">
                      {t("dataTable.filter.sortBy")}
                    </Label>
                    <select
                      id="est-sort"
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value as DataTableSortMode)}
                      className={selectBase}
                    >
                      {ESTABLISHMENT_SORT_MODES.map((m) => (
                        <option key={m} value={m}>
                          {t(`dataTable.sort.${m}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[160px] space-y-0.5 max-md:col-span-3 md:space-y-1">
                    <Label className="max-md:text-xs" htmlFor="est-insp-from">
                      {t("dataTable.filter.dateFrom")}
                    </Label>
                    <Input
                      id="est-insp-from"
                      type="date"
                      value={lastInspectionFrom}
                      onChange={(e) => setLastInspectionFrom(e.target.value)}
                      className={dateInputBase}
                      dir="ltr"
                    />
                  </div>
                  <div className="min-w-[160px] space-y-0.5 max-md:col-span-3 md:space-y-1">
                    <Label className="max-md:text-xs" htmlFor="est-insp-to">
                      {t("dataTable.filter.dateTo")}
                    </Label>
                    <Input
                      id="est-insp-to"
                      type="date"
                      value={lastInspectionTo}
                      onChange={(e) => setLastInspectionTo(e.target.value)}
                      className={dateInputBase}
                      dir="ltr"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full shrink-0 border-[#8B1538]/30 text-[#8B1538] max-md:mt-1 max-md:text-xs md:w-auto xl:ms-auto"
                  onClick={clearFilters}
                >
                  {t("establishmentsPage.clearFilters")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {reinspectionCount > 0 ? (
        <details
          open={alertBannerOpen}
          onToggle={(e) => setAlertBannerOpen((e.target as HTMLDetailsElement).open)}
          className="rounded-xl border border-amber-500/40 bg-amber-50/70 dark:border-amber-700/40 dark:bg-amber-950/25"
        >
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-amber-950 dark:text-amber-100">
            ⚠️ {t("establishmentsPage.alertBanner", { count: reinspectionCount })}
          </summary>
          <p className="border-t border-amber-500/25 px-4 pb-3 pt-2 text-sm text-amber-950/85 dark:text-amber-100/85">
            {t("establishmentsPage.alertBannerHint")}
          </p>
        </details>
      ) : null}

      <section aria-label={t("establishmentsPage.quickRatings")}>
        <p className="mb-2 text-sm font-medium text-muted-foreground">
          {t("establishmentsPage.quickRatings")}
        </p>
        <div
          className={cn(
            "flex flex-wrap gap-2",
            isRtl && "flex-row-reverse",
          )}
        >
          <Button
            type="button"
            variant={ratingFilter === "all" ? "default" : "outline"}
            size="sm"
            className={cn(
              "font-semibold",
              ratingFilter === "all" && "bg-[#8B1538] hover:bg-[#8B1538]/90",
            )}
            onClick={() => setRatingFilter("all")}
          >
            {t("dataTable.filter.allRatings")} ({sortedAll.length})
          </Button>
          {QUICK_RATING_ORDER.map((r) => {
            const c = ratingQuickCounts.get(r) ?? 0
            const active = ratingFilter === r
            return (
              <Button
                key={r}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                className={cn("font-semibold", active && "border-transparent text-white hover:opacity-90")}
                style={active ? { backgroundColor: RATING_HEX[r], color: "#fff" } : undefined}
                onClick={() => setRatingFilter(r)}
              >
                {t(ratingTranslationKey(r))} ({c})
              </Button>
            )
          })}
        </div>
      </section>

      <div
        className={cn(
          "flex flex-wrap gap-2",
          isRtl ? "flex-row-reverse justify-end" : "justify-start",
        )}
        role="group"
        aria-label={t("establishmentsPage.viewModes")}
      >
        <button
          type="button"
          className={viewToggleClass(viewMode === "list")}
          onClick={() => setViewMode("list")}
        >
          <LayoutList className="size-4" aria-hidden />
          {t("establishmentsPage.viewList")}
        </button>
        <button
          type="button"
          className={viewToggleClass(viewMode === "cards")}
          onClick={() => setViewMode("cards")}
        >
          <LayoutGrid className="size-4" aria-hidden />
          {t("establishmentsPage.viewCards")}
        </button>
        <button
          type="button"
          className={viewToggleClass(viewMode === "table")}
          onClick={() => setViewMode("table")}
        >
          <Table2 className="size-4" aria-hidden />
          {t("establishmentsPage.viewTable")}
        </button>
      </div>

      <div
        className={cn(
          "transition-opacity duration-200",
          loading ? "opacity-60" : "opacity-100",
        )}
      >
        {viewMode === "list" ? (
          <div className="space-y-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border-b border-border p-4">
                    <Skeleton className="h-16 w-full" />
                  </div>
                ))
              : null}
            {!loading && displayRows.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Building2 className="mx-auto mb-2 size-10 opacity-40" aria-hidden />
                <p className="font-medium">{t("establishmentsPage.empty")}</p>
              </div>
            ) : null}
            {!loading &&
              displayRows.map((row, idx) => {
                const e = row.establishment
                const ratingLbl =
                  ratingBadgeDisplayLabel(row) ??
                  (row.latestRating ? t(ratingTranslationKey(row.latestRating)) : "—")
                return (
                  <div key={e.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openQuick(row)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault()
                          openQuick(row)
                        }
                      }}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-muted/50",
                        isRtl && "flex-row-reverse text-end",
                      )}
                    >
                      <span className="text-xl leading-none" aria-hidden>
                        {ratingEmoji(row.latestRating)}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-lg font-bold text-foreground">{e.name}</p>
                        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="size-4 shrink-0 opacity-70" aria-hidden />
                          <span>
                            {establishmentAreaLabel(String(e.area))}
                            {e.location?.trim() ? ` — ${e.location}` : ""}
                          </span>
                        </p>
                        <p className="text-sm text-foreground/90">
                          <span className="inline-flex items-center gap-1">
                            <CalendarIcon className="size-3.5 opacity-70" aria-hidden />
                            {row.lastInspectionFormatted}
                          </span>
                          <span className="mx-1.5 text-muted-foreground">•</span>
                          <span>⭐ {ratingLbl}</span>
                          <span className="mx-1.5 text-muted-foreground">•</span>
                          <span className={daysToneClass(row.daysAgo)}>
                            {daysAgoLabel(row.daysAgo)}
                          </span>
                          <span className="mx-1.5 text-muted-foreground">•</span>
                          <span>{visitsLabel(row.inspectionCount)}</span>
                        </p>
                      </div>
                      <EstablishmentActions row={row} alignEnd={!isRtl} />
                    </div>
                    {idx < displayRows.length - 1 ? (
                      <div className="mx-4 border-b border-border/80" />
                    ) : null}
                  </div>
                )
              })}
            {!loading && displayRows.length > 0 ? (
              <div ref={listSentinelRef} className="h-4 w-full" aria-hidden />
            ) : null}
          </div>
        ) : null}

        {viewMode === "cards" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 w-full rounded-xl" />
                ))
              : null}
            {!loading && displayRows.length === 0 ? (
              <div className="col-span-full py-16 text-center text-muted-foreground">
                <LayoutGrid className="mx-auto mb-2 size-10 opacity-40" aria-hidden />
                <p className="font-medium">{t("establishmentsPage.empty")}</p>
              </div>
            ) : null}
            {!loading &&
              displayRows.map((row) => {
                const e = row.establishment
                const ratingLbl =
                  ratingBadgeDisplayLabel(row) ??
                  (row.latestRating ? t(ratingTranslationKey(row.latestRating)) : "—")
                return (
                  <Card
                    key={e.id}
                    className={cn(
                      "overflow-hidden border-2 border-t-4 shadow-sm transition-all duration-200 hover:z-10 hover:scale-[1.02] hover:shadow-lg",
                      ratingBarBorderClass(row.latestRating),
                    )}
                  >
                    <CardContent className="space-y-3 p-4">
                      <button
                        type="button"
                        onClick={() => openQuick(row)}
                        className="w-full space-y-2 text-start"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-lg" aria-hidden>
                            {ratingEmoji(row.latestRating)}
                          </span>
                          <span
                            className={cn(
                              "inline-flex max-w-[65%] truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              operationalStatusClass(e.operationalStatus),
                            )}
                          >
                            {statusLabel(e.operationalStatus)}
                          </span>
                        </div>
                        <p className="font-bold text-foreground">{e.name}</p>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          {establishmentAreaLabel(String(e.area))}
                        </p>
                        <p className="flex items-center gap-1.5 text-sm">
                          <CalendarIcon className="size-3.5 text-muted-foreground" aria-hidden />
                          {row.lastInspectionFormatted}
                        </p>
                        <p className="text-sm">⭐ {ratingLbl}</p>
                        <p
                          className={cn(
                            "flex items-center gap-1.5 text-sm font-medium",
                            daysToneClass(row.daysAgo),
                          )}
                        >
                          <BellIcon className="size-3.5 opacity-80" aria-hidden />
                          {daysAgoLabel(row.daysAgo)}
                        </p>
                      </button>
                      <div className="mt-1 border-t border-border pt-3 text-center">
                        <div className="mb-1 text-xs text-muted-foreground">
                          {t("establishmentsPage.col.visits")}
                        </div>
                        <div className="text-3xl font-bold tabular-nums text-[#8B1538] dark:text-[#c94d6d]">
                          {row.inspectionCount}
                        </div>
                      </div>
                      <div className="border-t border-border pt-3">
                        <EstablishmentActions row={row} variant="button" alignEnd />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            {!loading && displayRows.length > 0 ? (
              <div ref={cardSentinelRef} className="col-span-full h-4" aria-hidden />
            ) : null}
          </div>
        ) : null}

        {viewMode === "table" ? (
          <>
            <div
              className={cn(
                "relative rounded-lg border border-border",
                "max-h-[min(70vh,720px)] overflow-y-auto shadow-inner",
                "[-webkit-overflow-scrolling:touch]",
              )}
            >
              <div className="overflow-x-auto overscroll-x-contain" dir={isRtl ? "rtl" : "ltr"}>
                <table
                  className="caption-bottom border-collapse text-sm"
                  style={{ minWidth: TABLE_MIN_W }}
                >
                  <thead className="sticky top-0 z-20 bg-card shadow-sm">
                    <tr className="border-b border-border">
                      <th className="w-[48px] min-w-[48px] bg-card px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        #
                      </th>
                      <SortableTh
                        sortId="name"
                        sortMode={sortMode}
                        onSort={onHeaderSort}
                        align="start"
                        className="min-w-[200px] bg-card px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {t("establishmentsPage.col.name")}
                      </SortableTh>
                      <th className="min-w-[120px] bg-card px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("establishmentsPage.col.area")}
                      </th>
                      <SortableTh
                        sortId="lastInsp"
                        sortMode={sortMode}
                        onSort={onHeaderSort}
                        align="center"
                        className="min-w-[120px] bg-card px-2 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {t("establishmentsPage.col.lastInspection")}
                      </SortableTh>
                      <th className="min-w-[130px] bg-card px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("establishmentsPage.col.rating")}
                      </th>
                      <SortableTh
                        sortId="daysAgo"
                        sortMode={sortMode}
                        onSort={onHeaderSort}
                        align="center"
                        className="min-w-[100px] bg-card px-2 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {t("establishmentsPage.col.daysAgo")}
                      </SortableTh>
                      <th className="min-w-[120px] bg-card px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("establishmentsPage.col.status")}
                      </th>
                      <SortableTh
                        sortId="count"
                        sortMode={sortMode}
                        onSort={onHeaderSort}
                        align="center"
                        className="min-w-[90px] bg-card px-2 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {t("establishmentsPage.col.visits")}
                      </SortableTh>
                      <th className="min-w-[100px] bg-card px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("establishmentsPage.col.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="border-b border-border">
                            {Array.from({ length: 9 }).map((__, j) => (
                              <td key={j} className="px-2 py-3">
                                <Skeleton className="h-8 w-full" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : null}
                    {!loading && displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Table2 className="size-10 opacity-40" aria-hidden />
                            <p className="font-medium">{t("establishmentsPage.empty")}</p>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {!loading &&
                      displayRows.map((row) => {
                        const e = row.establishment
                        const rowNum =
                          sortedAll.findIndex((r) => r.establishment.id === e.id) + 1
                        return (
                          <tr
                            key={e.id}
                            className={cn(
                              "cursor-pointer border-b border-border transition-colors",
                              "even:bg-muted/25 hover:bg-muted/45",
                            )}
                            onClick={() => openQuick(row)}
                          >
                            <td className="px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                              {rowNum}
                            </td>
                            <td className="px-3 py-2.5 text-start font-bold">{e.name}</td>
                            <td className="px-2 py-2.5 text-center text-sm">
                              {establishmentAreaLabel(String(e.area))}
                            </td>
                            <td className="px-2 py-2.5 text-center tabular-nums">
                              {row.lastInspectionFormatted}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              {row.latestRating ? (
                                <RatingBadge
                                  rating={row.latestRating}
                                  displayLabel={ratingBadgeDisplayLabel(row)}
                                />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-2.5 text-center tabular-nums",
                                daysToneClass(row.daysAgo),
                              )}
                            >
                              {daysAgoLabel(row.daysAgo)}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <span
                                className={cn(
                                  "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                  operationalStatusClass(e.operationalStatus),
                                )}
                              >
                                {statusLabel(e.operationalStatus)}
                              </span>
                            </td>
                            <td className="px-2 py-2.5 text-center tabular-nums">
                              {row.inspectionCount}
                            </td>
                            <td
                              className="px-2 py-2.5"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              <div className="flex justify-center">
                                <EstablishmentActions row={row} alignEnd />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
            {!loading && displayRows.length > 0 ? (
              <div ref={tableSentinelRef} className="h-4 w-full" aria-hidden />
            ) : null}
          </>
        ) : null}
      </div>

      {loading && displayRows.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" aria-hidden />
          <span>{t("establishmentsPage.loading")}</span>
        </div>
      ) : null}

      <EstablishmentDetailSheet
        open={quickOpen}
        onOpenChange={(next) => {
          if (!next) closeQuick()
        }}
        row={quickRow}
        onAddInspection={openAddInspection}
        inspectionsReloadKey={detailReloadKey}
        onInspectionsChanged={() => {
          refetchRows()
          setDetailReloadKey((k) => k + 1)
        }}
      />

      <AddInspectionDialog
        open={addInspectionTarget !== null}
        onOpenChange={(next) => {
          if (!next) setAddInspectionTarget(null)
        }}
        row={addInspectionTarget}
        onSuccess={() => {
          refetchRows()
          setDetailReloadKey((k) => k + 1)
        }}
      />

      <AddEstablishmentDialog
        open={showAddEstablishment}
        onClose={() => setShowAddEstablishment(false)}
        onSuccess={() => {
          setShowAddEstablishment(false)
          refetchRows()
        }}
      />

      <AddEstablishmentDialog
        open={showEditEstablishment && editEstablishmentRow != null}
        mode="edit"
        editRow={editEstablishmentRow}
        onClose={() => {
          setShowEditEstablishment(false)
          setEditEstablishmentRow(null)
        }}
        onSuccess={() => {
          setShowEditEstablishment(false)
          setEditEstablishmentRow(null)
          refetchRows()
          setDetailReloadKey((k) => k + 1)
        }}
      />

      <DeleteEstablishmentConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(next) => {
          setDeleteConfirmOpen(next)
          if (!next) {
            setDeleteTargetRow(null)
            setDeleteSubmitting(false)
          }
        }}
        establishmentName={deleteTargetRow?.establishment.name ?? ""}
        inspectionCount={deleteTargetRow?.inspectionCount ?? 0}
        deleting={deleteSubmitting}
        onConfirm={() => void handleConfirmDeleteEstablishment()}
      />
    </div>
  )
}
