import { getActiveEstablishments, getActiveInspections } from "@/data/liveDataset"
import type {
  AreaFilter,
  Establishment,
  Inspection,
  InspectionRating,
  OperationalStatus,
  YearFilter,
} from "@/data/rawData"
import { isDashboardAreaAggregate } from "@/data/rawData"

// ─── Translation keys (must match keys in en.ts / ar.ts) ─────────────────────

export type RatingTKey =
  | "dashboard.excellent"
  | "dashboard.veryGood"
  | "dashboard.good"
  | "dashboard.fair"
  | "dashboard.poor"
  | "dashboard.veryPoor"

export type StatusTKey =
  | "dashboard.open"
  | "dashboard.closed"
  | "dashboard.temporaryClosed"
  | "dashboard.openSoon"
  | "dashboard.statusUndetermined"

// ─── Output types ─────────────────────────────────────────────────────────────

export type RatingEntry = {
  /** Arabic display name – used for emoji lookup. */
  nameAr: string
  /** i18n key – use t(tKey) to render localised label. */
  tKey: RatingTKey
  count: number
  percentage: number
  color: string
  gradient: string
}

export type StatusEntry = {
  /** Arabic display name – used for emoji lookup. */
  nameAr: string
  /** i18n key – use t(tKey) to render localised label. */
  tKey: StatusTKey
  count: number
  percentage: number
  color: string
  /** Mini-card background (establishments overview). */
  gradient: string
}

export type ProcessedData = {
  establishments: {
    total: number
    ratedCount: number
    ratingBreakdown: RatingEntry[]
  }
  inspections: {
    total: number
    statusBreakdown: StatusEntry[]
  }
}

// ─── Metadata maps ────────────────────────────────────────────────────────────

const RATING_ORDER: InspectionRating[] = [
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Poor",
  "Very Poor",
]

const RATING_META: Record<
  InspectionRating,
  { nameAr: string; tKey: RatingTKey; color: string; gradient: string }
> = {
  Excellent: {
    nameAr: "ممتاز",
    tKey: "dashboard.excellent",
    color: "#10B981",
    gradient: "linear-gradient(135deg, #10B981, #059669)",
  },
  "Very Good": {
    nameAr: "جيد جداً",
    tKey: "dashboard.veryGood",
    color: "#84CC16",
    gradient: "linear-gradient(135deg, #84CC16, #65A30D)",
  },
  Good: {
    nameAr: "جيد",
    tKey: "dashboard.good",
    color: "#FBBF24",
    gradient: "linear-gradient(135deg, #FBBF24, #F59E0B)",
  },
  Fair: {
    nameAr: "متوسط",
    tKey: "dashboard.fair",
    color: "#FB923C",
    gradient: "linear-gradient(135deg, #FB923C, #F97316)",
  },
  Poor: {
    nameAr: "ضعيف",
    tKey: "dashboard.poor",
    color: "#F87171",
    gradient: "linear-gradient(135deg, #F87171, #EF4444)",
  },
  "Very Poor": {
    nameAr: "ضعيف جداً",
    tKey: "dashboard.veryPoor",
    color: "#DC2626",
    gradient: "linear-gradient(135deg, #DC2626, #B91C1C)",
  },
}

/** Includes unknown / no row for the selected dashboard year (`establishment_status_history`). */
export type OperationalStatusBucket = OperationalStatus | "Undetermined"

const STATUS_DISTRIBUTION_BUCKETS: OperationalStatus[] = [
  "Open",
  "Closed",
  "Temporary Closed",
  "Open Soon",
]

const STATUS_META: Record<
  OperationalStatusBucket,
  { nameAr: string; tKey: StatusTKey; color: string; gradient: string }
> = {
  Open: {
    nameAr: "مفتوحة",
    tKey: "dashboard.open",
    color: "#10B981",
    gradient: "linear-gradient(135deg, #10B981, #059669)",
  },
  Closed: {
    nameAr: "مغلقة",
    tKey: "dashboard.closed",
    color: "#DC2626",
    gradient: "linear-gradient(135deg, #DC2626, #B91C1C)",
  },
  "Temporary Closed": {
    nameAr: "مغلقة مؤقتاً",
    tKey: "dashboard.temporaryClosed",
    color: "#FBBF24",
    gradient: "linear-gradient(135deg, #FBBF24, #F59E0B)",
  },
  "Open Soon": {
    nameAr: "قريباً",
    tKey: "dashboard.openSoon",
    color: "#8B5CF6",
    gradient: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
  },
  Undetermined: {
    nameAr: "غير محدد",
    tKey: "dashboard.statusUndetermined",
    color: "#94A3B8",
    gradient: "linear-gradient(135deg, #94A3B8, #64748B)",
  },
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Filter + aggregate for any calendar year (e.g. previous year not in the UI year picker).
 * Establishments headline count = establishments **Open** in that year (`establishment_status_history`)
 * after area filter. Rating shares use **open** establishments in that year+area as the denominator (latest
 * inspection within the filtered year counts).
 * Status distribution omits Undetermined entirely; percentages are relative to establishments with known status.
 */
export function processDataFromSlices(
  rawEstablishments: Establishment[],
  rawInspections: Inspection[],
  calendarYear: number,
  area: AreaFilter,
  operationalStatusByEstablishmentId?: ReadonlyMap<
    string,
    OperationalStatus | null
  > | null,
): ProcessedData {
  const filteredEst = isDashboardAreaAggregate(area)
    ? rawEstablishments
    : rawEstablishments.filter((e) => e.area === area)

  const estNameSet = new Set(filteredEst.map((e) => e.name))

  /** Operational status from history for dashboard year — same source as establishments card. */
  const statusBucketForEstablishment = (est: Establishment): OperationalStatusBucket => {
    if (operationalStatusByEstablishmentId) {
      const fromHistory = operationalStatusByEstablishmentId.get(est.id)
      return fromHistory == null ? "Undetermined" : fromHistory
    }
    return est.operationalStatus
  }

  const openEstablishments = filteredEst.filter(
    (est) => statusBucketForEstablishment(est) === "Open",
  )
  const openCount = openEstablishments.length
  const openNameSet = new Set(openEstablishments.map((e) => e.name))

  const inspectionRecency = (insp: Inspection) =>
    insp.inspectionDate?.getTime() ?? Number.NEGATIVE_INFINITY

  // Inspections for rating roll-up: selected year, area-backed names, OPEN establishments only
  const targetYear = calendarYear
  const filteredInsp = rawInspections.filter((i) => {
    if (!estNameSet.has(i.establishmentName)) return false
    if (!openNameSet.has(i.establishmentName)) return false
    if (!i.inspectionDate || Number.isNaN(i.inspectionDate.getTime())) return true
    return i.inspectionDate.getFullYear() === targetYear
  })

  // Latest inspection per open establishment within the filtered year (for ratings widget)
  const latestByEst = new Map<string, Inspection>()
  for (const insp of filteredInsp) {
    const existing = latestByEst.get(insp.establishmentName)
    if (!existing || inspectionRecency(insp) > inspectionRecency(existing)) {
      latestByEst.set(insp.establishmentName, insp)
    }
  }

  const ratingCounts = new Map<InspectionRating, number>(
    RATING_ORDER.map((r) => [r, 0]),
  )
  for (const [, insp] of latestByEst) {
    ratingCounts.set(insp.rating, (ratingCounts.get(insp.rating) ?? 0) + 1)
  }

  const ratingPctBase = openCount
  const ratingBreakdown: RatingEntry[] = RATING_ORDER.map((r) => {
    const count = ratingCounts.get(r) ?? 0
    const pct = ratingPctBase > 0 ? (count / ratingPctBase) * 100 : 0
    const meta = RATING_META[r]
    return {
      nameAr: meta.nameAr,
      tKey: meta.tKey,
      count,
      percentage: Math.round(pct * 10) / 10,
      color: meta.color,
      gradient: meta.gradient,
    }
  })

  // Status bars: omit Undetermined; percentages are among establishments with known status only
  const statusCountsKnown = new Map<OperationalStatus, number>(
    STATUS_DISTRIBUTION_BUCKETS.map((s) => [s, 0]),
  )
  for (const est of filteredEst) {
    const bucket = statusBucketForEstablishment(est)
    if (bucket === "Undetermined") continue
    statusCountsKnown.set(
      bucket,
      (statusCountsKnown.get(bucket) ?? 0) + 1,
    )
  }
  const sumKnownStatus = [...statusCountsKnown.values()].reduce((a, b) => a + b, 0)
  const statusBreakdown: StatusEntry[] = STATUS_DISTRIBUTION_BUCKETS.map((s) => {
    const count = statusCountsKnown.get(s) ?? 0
    const pct = sumKnownStatus > 0 ? (count / sumKnownStatus) * 100 : 0
    const meta = STATUS_META[s]
    return {
      nameAr: meta.nameAr,
      tKey: meta.tKey,
      count,
      percentage: Math.round(pct * 10) / 10,
      color: meta.color,
      gradient: meta.gradient,
    }
  })

  return {
    establishments: {
      total: openCount,
      ratedCount: latestByEst.size,
      ratingBreakdown,
    },
    inspections: {
      total: filteredInsp.length,
      statusBreakdown,
    },
  }
}

export function processDataForCalendarYear(
  calendarYear: number,
  area: AreaFilter,
): ProcessedData {
  return processDataFromSlices(
    getActiveEstablishments(),
    getActiveInspections(),
    calendarYear,
    area,
  )
}

export function processData(year: YearFilter, area: AreaFilter): ProcessedData {
  return processDataForCalendarYear(Number(year), area)
}

/** Dated inspections in calendarYear only (area-aware). Undated rows are omitted so YoY is not polluted by repeats across years. */
function countDatedInspectionsInCalendarYear(
  rawEstablishments: Establishment[],
  rawInspections: Inspection[],
  calendarYear: number,
  area: AreaFilter,
): number {
  const filteredEst = isDashboardAreaAggregate(area)
    ? rawEstablishments
    : rawEstablishments.filter((e) => e.area === area)

  const estNameSet = new Set(filteredEst.map((e) => e.name))

  let n = 0
  for (const i of rawInspections) {
    if (!estNameSet.has(i.establishmentName)) continue
    const d = i.inspectionDate
    if (!d || Number.isNaN(d.getTime())) continue
    if (d.getFullYear() === calendarYear) n += 1
  }
  return n
}

export function calculateInspectionsTrendPctFromSlices(
  establishments: Establishment[],
  inspections: Inspection[],
  currentYear: YearFilter,
  area: AreaFilter,
): number | null {
  const y = Number(currentYear)
  const previousTotal = countDatedInspectionsInCalendarYear(
    establishments,
    inspections,
    y - 1,
    area,
  )
  const currentTotal = countDatedInspectionsInCalendarYear(
    establishments,
    inspections,
    y,
    area,
  )

  if (
    typeof previousTotal !== "number" ||
    !Number.isFinite(previousTotal) ||
    previousTotal <= 0
  ) {
    return null
  }

  const change = ((currentTotal - previousTotal) / previousTotal) * 100
  return Math.round(change * 10) / 10
}

/** Uses live dataset — fallback when remote slices are not wired. */
export function calculateInspectionsTrendPct(
  currentYear: YearFilter,
  area: AreaFilter,
): number | null {
  return calculateInspectionsTrendPctFromSlices(
    getActiveEstablishments(),
    getActiveInspections(),
    currentYear,
    area,
  )
}
