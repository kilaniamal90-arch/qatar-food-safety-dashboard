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

export type AlertLevel = "none" | "warning" | "danger"

export type TableRow = {
  establishmentKey: string
  establishmentName: string
  establishmentNameEn?: string
  area: string
  areaNameEn?: string
  lastInspectionDate: Date | null
  lastInspectionDateFormatted: string
  daysAgo: number | null
  /** Null when establishment has no inspection row (still shown as overdue needing first inspection). */
  rating: InspectionRating | null
  /** For selected dashboard year (`establishment_status_history`); null = undetermined when remote map is wired. */
  operationalStatusForYear: OperationalStatus | null
  needsAlert: boolean
  alertLevel: AlertLevel
}

function tableRowEnglishExportExtras(
  establishment: Establishment,
): Partial<Pick<TableRow, "establishmentNameEn" | "areaNameEn">> {
  const nameEn = establishment.nameEn?.trim()
  const areaEn = establishment.areaNameEn?.trim()
  return {
    ...(nameEn ? { establishmentNameEn: nameEn } : {}),
    ...(areaEn ? { areaNameEn: areaEn } : {}),
  }
}

export function resolveOperationalStatusForDashboard(
  establishment: Establishment,
  operationalStatusByEstablishmentId: ReadonlyMap<
    string,
    OperationalStatus | null
  > | null,
): OperationalStatus | null {
  if (operationalStatusByEstablishmentId == null) {
    return establishment.operationalStatus
  }
  return operationalStatusByEstablishmentId.get(establishment.id) ?? null
}

const RATING_ORDER_WORST_FIRST: InspectionRating[] = [
  "Very Poor",
  "Poor",
  "Fair",
  "Good",
  "Very Good",
  "Excellent",
]

export function formatInspectionDateDdMmYyyy(
  date: Date | null,
  unknownLabel = "—",
): string {
  if (!date || Number.isNaN(date.getTime())) return unknownLabel
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

/** Fair / Poor / Very Poor overdue >30 days → re-inspection alert. */
export function shouldAlert(
  rating: InspectionRating,
  daysAgo: number | null,
): { needsAlert: boolean; alertLevel: AlertLevel } {
  if (daysAgo == null) {
    return { needsAlert: false, alertLevel: "none" }
  }
  if (
    ["Fair", "Poor", "Very Poor"].includes(rating) &&
    daysAgo > 30
  ) {
    return { needsAlert: true, alertLevel: "danger" }
  }
  return { needsAlert: false, alertLevel: "none" }
}

export function prepareTableData(
  establishments: Establishment[],
  inspections: Inspection[],
  selectedYear: YearFilter,
  selectedArea: AreaFilter,
): TableRow[] {
  return prepareTableDataFromSlices(
    establishments,
    inspections,
    selectedYear,
    selectedArea,
  )
}

export function prepareTableDataFromSlices(
  establishments: Establishment[],
  inspections: Inspection[],
  selectedYear: YearFilter,
  selectedArea: AreaFilter,
  dateUnknownLabel = "—",
): TableRow[] {
  const yearNum = Number(selectedYear)

  const filteredEstablishments = isDashboardAreaAggregate(selectedArea)
    ? establishments
    : establishments.filter((e) => e.area === selectedArea)

  const estNameSet = new Set(filteredEstablishments.map((e) => e.name))

  const filteredInspections = inspections.filter((i) => {
    if (!estNameSet.has(i.establishmentName)) return false
    if (!i.inspectionDate || Number.isNaN(i.inspectionDate.getTime())) return true
    return i.inspectionDate.getFullYear() === yearNum
  })

  const inspectionRecency = (insp: Inspection) =>
    insp.inspectionDate?.getTime() ?? Number.NEGATIVE_INFINITY

  const latestInspectionMap = new Map<string, Inspection>()
  for (const inspection of filteredInspections) {
    const existing = latestInspectionMap.get(inspection.establishmentName)
    if (!existing || inspectionRecency(inspection) > inspectionRecency(existing)) {
      latestInspectionMap.set(inspection.establishmentName, inspection)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows: TableRow[] = []

  for (const establishment of filteredEstablishments) {
    const latestInspection = latestInspectionMap.get(establishment.name)
    if (!latestInspection) continue

    const idate = latestInspection.inspectionDate
    let daysAgo: number | null = null
    if (idate && !Number.isNaN(idate.getTime())) {
      const inspectionDate = new Date(idate)
      inspectionDate.setHours(0, 0, 0, 0)
      const todayZ = new Date(today)
      todayZ.setHours(0, 0, 0, 0)
      daysAgo = Math.floor(
        (todayZ.getTime() - inspectionDate.getTime()) /
          (1000 * 60 * 60 * 24),
      )
    }

    const { needsAlert, alertLevel } =
      idate && !Number.isNaN(idate.getTime())
        ? shouldAlert(latestInspection.rating, daysAgo)
        : { needsAlert: false, alertLevel: "none" as AlertLevel }

    rows.push({
      establishmentKey: establishment.name,
      establishmentName: establishment.name,
      ...tableRowEnglishExportExtras(establishment),
      area: establishment.area,
      lastInspectionDate: latestInspection.inspectionDate,
      lastInspectionDateFormatted: formatInspectionDateDdMmYyyy(
        latestInspection.inspectionDate,
        dateUnknownLabel,
      ),
      daysAgo,
      rating: latestInspection.rating,
      operationalStatusForYear: establishment.operationalStatus,
      needsAlert,
      alertLevel,
    })
  }

  rows.sort((a, b) => {
    const ra = RATING_ORDER_WORST_FIRST.indexOf(a.rating as InspectionRating)
    const rb = RATING_ORDER_WORST_FIRST.indexOf(b.rating as InspectionRating)
    if (ra !== rb) return ra - rb
    return a.establishmentName.localeCompare(b.establishmentName, "ar")
  })

  return rows
}

/**
 * Rows that need re-inspection: no inspection recorded, unknown inspection date,
 * or (latest dated inspection exceeds `reinspection_periods` days for its rating).
 * Uses latest inspection across all provided inspection rows (caller supplies full history).
 */
export function prepareOverdueTableDataFromSlices(
  establishments: Establishment[],
  inspectionsAll: Inspection[],
  selectedArea: AreaFilter,
  daysByInspectionRating: Map<InspectionRating, number>,
  operationalStatusByEstablishmentId:
    | ReadonlyMap<string, OperationalStatus | null>
    | null = null,
  dateUnknownLabel = "—",
): TableRow[] {
  const filteredEstablishments = isDashboardAreaAggregate(selectedArea)
    ? establishments
    : establishments.filter((e) => e.area === selectedArea)

  const estNameSet = new Set(filteredEstablishments.map((e) => e.name))

  const filteredInspections = inspectionsAll.filter((i) =>
    estNameSet.has(i.establishmentName),
  )

  const inspectionRecency = (insp: Inspection) =>
    insp.inspectionDate?.getTime() ?? Number.NEGATIVE_INFINITY

  const latestInspectionMap = new Map<string, Inspection>()
  for (const inspection of filteredInspections) {
    const existing = latestInspectionMap.get(inspection.establishmentName)
    if (!existing || inspectionRecency(inspection) > inspectionRecency(existing)) {
      latestInspectionMap.set(inspection.establishmentName, inspection)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows: TableRow[] = []

  function statusFor(est: Establishment): OperationalStatus | null {
    return resolveOperationalStatusForDashboard(
      est,
      operationalStatusByEstablishmentId,
    )
  }

  function pushNoInspection(est: Establishment) {
    rows.push({
      establishmentKey: est.name,
      establishmentName: est.name,
      ...tableRowEnglishExportExtras(est),
      area: est.area,
      lastInspectionDate: null,
      lastInspectionDateFormatted: formatInspectionDateDdMmYyyy(
        null,
        dateUnknownLabel,
      ),
      daysAgo: null,
      rating: null,
      operationalStatusForYear: statusFor(est),
      needsAlert: true,
      alertLevel: "danger",
    })
  }

  function pushUndated(est: Establishment, latestInspection: Inspection) {
    rows.push({
      establishmentKey: est.name,
      establishmentName: est.name,
      ...tableRowEnglishExportExtras(est),
      area: est.area,
      lastInspectionDate: latestInspection.inspectionDate ?? null,
      lastInspectionDateFormatted: formatInspectionDateDdMmYyyy(
        latestInspection.inspectionDate,
        dateUnknownLabel,
      ),
      daysAgo: null,
      rating: latestInspection.rating,
      operationalStatusForYear: statusFor(est),
      needsAlert: true,
      alertLevel: "danger",
    })
  }

  for (const establishment of filteredEstablishments) {
    const latestInspection = latestInspectionMap.get(establishment.name)

    if (!latestInspection) {
      pushNoInspection(establishment)
      continue
    }

    const idate = latestInspection.inspectionDate
    if (!idate || Number.isNaN(idate.getTime())) {
      pushUndated(establishment, latestInspection)
      continue
    }

    const inspectionDate = new Date(idate)
    inspectionDate.setHours(0, 0, 0, 0)
    const todayZ = new Date(today)
    todayZ.setHours(0, 0, 0, 0)
    const daysAgo = Math.floor(
      (todayZ.getTime() - inspectionDate.getTime()) / (1000 * 60 * 60 * 24),
    )

    const threshold = daysByInspectionRating.get(latestInspection.rating)
    if (threshold === undefined) continue

    if (daysAgo > threshold) {
      rows.push({
        establishmentKey: establishment.name,
        establishmentName: establishment.name,
        ...tableRowEnglishExportExtras(establishment),
        area: establishment.area,
        lastInspectionDate: latestInspection.inspectionDate,
        lastInspectionDateFormatted: formatInspectionDateDdMmYyyy(
          latestInspection.inspectionDate,
          dateUnknownLabel,
        ),
        daysAgo,
        rating: latestInspection.rating,
        operationalStatusForYear: statusFor(establishment),
        needsAlert: true,
        alertLevel: "danger",
      })
    }
  }

  rows.sort((a, b) => {
    const ra =
      a.rating == null ? -1 : RATING_ORDER_WORST_FIRST.indexOf(a.rating)
    const rb =
      b.rating == null ? -1 : RATING_ORDER_WORST_FIRST.indexOf(b.rating)
    if (ra !== rb) return ra - rb
    return a.establishmentName.localeCompare(b.establishmentName, "ar")
  })

  return rows
}

function establishmentVisibleInFollowUpTable(
  est: Establishment,
  operationalStatusCurrentYearByEstId:
    | ReadonlyMap<string, OperationalStatus | null>
    | null,
): boolean {
  const st = resolveOperationalStatusForDashboard(
    est,
    operationalStatusCurrentYearByEstId,
  )
  if (st == null) return true
  return st !== "Closed"
}

/**
 * Dashboard status follow-up table: area filter only (not year-scoped inspections).
 * Latest inspection across all dates; hides establishments marked Closed for the embedded
 * `operationalStatusCurrentYearByEstId` map (fetched for the running calendar year); re-inspection
 * flags match admin thresholds (`reinspection_periods`).
 */
export function prepareStatusFollowUpTableDataFromSlices(
  establishments: Establishment[],
  inspectionsAll: Inspection[],
  selectedArea: AreaFilter,
  daysByInspectionRating: Map<InspectionRating, number>,
  operationalStatusCurrentYearByEstId:
    | ReadonlyMap<string, OperationalStatus | null>
    | null = null,
  dateUnknownLabel = "—",
): TableRow[] {
  const filteredEstablishments = isDashboardAreaAggregate(selectedArea)
    ? establishments
    : establishments.filter((e) => e.area === selectedArea)

  const visibleEstablishments = filteredEstablishments.filter((e) =>
    establishmentVisibleInFollowUpTable(e, operationalStatusCurrentYearByEstId),
  )

  const estNameSet = new Set(visibleEstablishments.map((e) => e.name))

  const filteredInspections = inspectionsAll.filter((i) =>
    estNameSet.has(i.establishmentName),
  )

  const inspectionRecency = (insp: Inspection) =>
    insp.inspectionDate?.getTime() ?? Number.NEGATIVE_INFINITY

  const latestInspectionMap = new Map<string, Inspection>()
  for (const inspection of filteredInspections) {
    const existing = latestInspectionMap.get(inspection.establishmentName)
    if (!existing || inspectionRecency(inspection) > inspectionRecency(existing)) {
      latestInspectionMap.set(inspection.establishmentName, inspection)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows: TableRow[] = []

  function statusFor(est: Establishment): OperationalStatus | null {
    return resolveOperationalStatusForDashboard(est, operationalStatusCurrentYearByEstId)
  }

  function pushNoInspection(est: Establishment) {
    rows.push({
      establishmentKey: est.id ? String(est.id) : est.name,
      establishmentName: est.name,
      ...tableRowEnglishExportExtras(est),
      area: est.area,
      lastInspectionDate: null,
      lastInspectionDateFormatted: formatInspectionDateDdMmYyyy(null, dateUnknownLabel),
      daysAgo: null,
      rating: null,
      operationalStatusForYear: statusFor(est),
      needsAlert: true,
      alertLevel: "danger",
    })
  }

  function pushUndated(est: Establishment, latestInspection: Inspection) {
    rows.push({
      establishmentKey: est.id ? String(est.id) : est.name,
      establishmentName: est.name,
      ...tableRowEnglishExportExtras(est),
      area: est.area,
      lastInspectionDate: latestInspection.inspectionDate ?? null,
      lastInspectionDateFormatted: formatInspectionDateDdMmYyyy(
        latestInspection.inspectionDate,
        dateUnknownLabel,
      ),
      daysAgo: null,
      rating: latestInspection.rating,
      operationalStatusForYear: statusFor(est),
      needsAlert: true,
      alertLevel: "danger",
    })
  }

  for (const establishment of visibleEstablishments) {
    const latestInspection = latestInspectionMap.get(establishment.name)

    if (!latestInspection) {
      pushNoInspection(establishment)
      continue
    }

    const idate = latestInspection.inspectionDate
    if (!idate || Number.isNaN(idate.getTime())) {
      pushUndated(establishment, latestInspection)
      continue
    }

    const inspectionDate = new Date(idate)
    inspectionDate.setHours(0, 0, 0, 0)
    const todayZ = new Date(today)
    todayZ.setHours(0, 0, 0, 0)
    const daysAgo = Math.floor(
      (todayZ.getTime() - inspectionDate.getTime()) / (1000 * 60 * 60 * 24),
    )

    const threshold = daysByInspectionRating.get(latestInspection.rating)
    const overdueByConfig =
      threshold !== undefined &&
      Number.isFinite(threshold) &&
      daysAgo > threshold

    rows.push({
      establishmentKey: establishment.id ? String(establishment.id) : establishment.name,
      establishmentName: establishment.name,
      ...tableRowEnglishExportExtras(establishment),
      area: establishment.area,
      lastInspectionDate: latestInspection.inspectionDate,
      lastInspectionDateFormatted: formatInspectionDateDdMmYyyy(
        latestInspection.inspectionDate,
        dateUnknownLabel,
      ),
      daysAgo,
      rating: latestInspection.rating,
      operationalStatusForYear: statusFor(establishment),
      needsAlert: overdueByConfig,
      alertLevel: overdueByConfig ? "danger" : "none",
    })
  }

  rows.sort((a, b) => {
    const ra =
      a.rating == null ? -1 : RATING_ORDER_WORST_FIRST.indexOf(a.rating)
    const rb =
      b.rating == null ? -1 : RATING_ORDER_WORST_FIRST.indexOf(b.rating)
    if (ra !== rb) return ra - rb
    return a.establishmentName.localeCompare(b.establishmentName, "ar")
  })

  return rows
}

/** Convenience: dashboard uses raw singletons. */
export function prepareTableDataFromRaw(
  selectedYear: YearFilter,
  selectedArea: AreaFilter,
): TableRow[] {
  return prepareTableDataFromSlices(
    getActiveEstablishments(),
    getActiveInspections(),
    selectedYear,
    selectedArea,
  )
}