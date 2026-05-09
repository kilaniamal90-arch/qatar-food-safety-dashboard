import type { ColumnMapping } from "@/features/data-import/columnMap"
import {
  coerceOperationalStatus,
  coerceRating,
  getMappedCellValue,
  normalizeNameKey,
  parseYearCell,
  validateInspectionRowsStrictForImport,
} from "@/features/data-import/mergePipeline"
import { rawDateProvided } from "@/features/data-import/parseExcelDate"

export type ImportBlockError =
  | { kind: "establishmentsMissingName"; rows: number[] }
  | {
      kind: "statusHistoryUnknownEstablishments"
      items: { displayName: string; rows: number[] }[]
    }
  | {
      kind: "statusHistoryMissingFields"
      missingYearRows: number[]
      missingStatusRows: number[]
    }
  | {
      kind: "inspectionsUnknownEstablishments"
      items: { displayName: string; rows: number[] }[]
    }
  | {
      kind: "inspectionsStrictDateRating"
      dateRows: number[]
      ratingRows: number[]
    }
  /** Phase 1 gate (after mapping, before preview) — Arabic copy in locales. */
  | {
      kind: "phase1EstablishmentAreaLocation"
      missingAreaRows: number[]
      missingLocationRows: number[]
    }
  | {
      kind: "phase1EstablishmentDuplicates"
      items: { display: string; rows: number[] }[]
    }
  | {
      kind: "phase1StatusHistoryDuplicates"
      items: { display: string; rows: number[] }[]
    }
  | {
      kind: "phase1YearsInactive"
      items: {
        year: number
        statusHistoryRows: number[]
        inspectionsRows: number[]
      }[]
    }
  | {
      kind: "phase1InspectionFutureDates"
      items: { establishmentName: string; dateDdMmYyyy: string; row: number }[]
    }
  | {
      kind: "phase2UnknownInspectors"
      items: { inspectorName: string; rows: number[] }[]
    }

function rowHasAnyCellData(row: Record<string, unknown>): boolean {
  for (const v of Object.values(row)) {
    if (v == null || v === "") continue
    if (typeof v === "string") {
      if (v.trim() !== "") return true
      continue
    }
    if (typeof v === "number" && Number.isFinite(v)) return true
    if (typeof v === "boolean") return true
    if (v instanceof Date && !Number.isNaN(v.getTime())) return true
    return true
  }
  return false
}

/** Row numbers (unique) with trailing `…` handled by caller via `formatInspectionValidationRowList`. */
export function validateEstablishmentSheetMandatoryNameWhenRowHasData(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping[],
): number[] {
  const bad: number[] = []
  rows.forEach((row, i) => {
    if (!rowHasAnyCellData(row)) return
    const name = String(getMappedCellValue(row, mapping, "establishmentName") ?? "").trim()
    if (!name) bad.push(i + 2)
  })
  return bad
}

export function buildEstablishmentNameKeySetFromRows(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping[],
): Set<string> {
  const s = new Set<string>()
  for (const row of rows) {
    const name = String(getMappedCellValue(row, mapping, "establishmentName") ?? "").trim()
    if (name) s.add(normalizeNameKey(name))
  }
  return s
}

function aggregateUnknownEstablishmentNamesForRows(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping[],
  establishmentKeys: Set<string>,
  rowFilter: (row: Record<string, unknown>, excelRow: number) => boolean,
): { displayName: string; rows: number[] }[] {
  const m = new Map<string, { displayName: string; rows: number[] }>()
  rows.forEach((row, i) => {
    const excelRow = i + 2
    if (!rowFilter(row, excelRow)) return
    const raw = String(getMappedCellValue(row, mapping, "establishmentName") ?? "").trim()
    const nk = raw ? normalizeNameKey(raw) : ""
    const inSheet = nk !== "" && establishmentKeys.has(nk)
    if (inSheet) return
    const displayName = raw || "—"
    const aggKey = nk || "__EMPTY__"
    const prev = m.get(aggKey)
    if (prev) prev.rows.push(excelRow)
    else m.set(aggKey, { displayName, rows: [excelRow] })
  })
  return [...m.values()]
}

export function findStatusHistoryEstablishmentsNotOnEstablishmentsSheet(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping[],
  establishmentKeys: Set<string>,
): { displayName: string; rows: number[] }[] {
  const out = aggregateUnknownEstablishmentNamesForRows(
    rows,
    mapping,
    establishmentKeys,
    (row) => {
      const raw = String(getMappedCellValue(row, mapping, "establishmentName") ?? "").trim()
      return raw !== ""
    },
  )
  return out.length ? out : []
}

export function validateStatusHistoryMissingYearOrStatus(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping[],
): { missingYearRows: number[]; missingStatusRows: number[] } | null {
  const missingYear: number[] = []
  const missingStatus: number[] = []

  rows.forEach((row, i) => {
    if (!rowHasAnyCellData(row)) return
    const excelRow = i + 2
    const yRaw = getMappedCellValue(row, mapping, "year")
    const yearOk = parseYearCell(yRaw) !== null
    const stRaw = getMappedCellValue(row, mapping, "operationalStatus")
    const statusOk = coerceOperationalStatus(stRaw) !== null

    if (!yearOk) missingYear.push(excelRow)
    if (!statusOk) missingStatus.push(excelRow)
  })

  if (missingYear.length === 0 && missingStatus.length === 0) return null
  return { missingYearRows: missingYear, missingStatusRows: missingStatus }
}

export function findInspectionEstablishmentsNotOnEstablishmentsSheet(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping[],
  establishmentKeys: Set<string>,
): { displayName: string; rows: number[] }[] {
  const out = aggregateUnknownEstablishmentNamesForRows(
    rows,
    mapping,
    establishmentKeys,
    (row) => {
      const rawDate = getMappedCellValue(row, mapping, "inspectionDate")
      const ratingRaw = getMappedCellValue(row, mapping, "rating")
      const hasDateOrRating =
        rawDateProvided(rawDate) || coerceRating(ratingRaw) !== null
      return hasDateOrRating
    },
  )
  return out.length ? out : []
}

/** Ordered gate: CHECK 1 → 2A → 2B → inspections cross-sheet → inspections strict date/rating. */
export function runImportSheetBlockingValidations(opts: {
  establishmentRows: Record<string, unknown>[]
  establishmentMapping: ColumnMapping[]
  statusHistoryRows: Record<string, unknown>[]
  statusHistoryMapping: ColumnMapping[]
  inspectionsRows: Record<string, unknown>[]
  inspectionsMapping: ColumnMapping[]
}): ImportBlockError | null {
  const {
    establishmentRows,
    establishmentMapping,
    statusHistoryRows,
    statusHistoryMapping,
    inspectionsRows,
    inspectionsMapping,
  } = opts

  const estNameMissingRows = validateEstablishmentSheetMandatoryNameWhenRowHasData(
    establishmentRows,
    establishmentMapping,
  )
  if (estNameMissingRows.length > 0) {
    return { kind: "establishmentsMissingName", rows: estNameMissingRows }
  }

  const estKeys = buildEstablishmentNameKeySetFromRows(
    establishmentRows,
    establishmentMapping,
  )

  const statusUnknown = findStatusHistoryEstablishmentsNotOnEstablishmentsSheet(
    statusHistoryRows,
    statusHistoryMapping,
    estKeys,
  )
  if (statusUnknown.length > 0) {
    return { kind: "statusHistoryUnknownEstablishments", items: statusUnknown }
  }

  const statusFields = validateStatusHistoryMissingYearOrStatus(
    statusHistoryRows,
    statusHistoryMapping,
  )
  if (statusFields) {
    return { kind: "statusHistoryMissingFields", ...statusFields }
  }

  const inspUnknown = findInspectionEstablishmentsNotOnEstablishmentsSheet(
    inspectionsRows,
    inspectionsMapping,
    estKeys,
  )
  if (inspUnknown.length > 0) {
    return { kind: "inspectionsUnknownEstablishments", items: inspUnknown }
  }

  const strict = validateInspectionRowsStrictForImport(
    inspectionsRows,
    inspectionsMapping,
  )
  if (strict) {
    return {
      kind: "inspectionsStrictDateRating",
      dateRows: strict.dateProblemExcelRows,
      ratingRows: strict.ratingProblemExcelRows,
    }
  }

  return null
}
