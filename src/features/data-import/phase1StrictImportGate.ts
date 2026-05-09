/**
 * Strict pre-preview gate (checks 1–5) after column mapping succeeds and existing
 * `runImportSheetBlockingValidations` passes. Runs in order; first failure stops the import.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ColumnMapping } from "@/features/data-import/columnMap"
import type { ImportBlockError } from "@/features/data-import/importSheetValidation"
import { formatInspectionDateDdMmYyyy } from "@/data/establishmentsTable"
import { getMappedCellValue, normalizeNameKey, parseYearCell } from "@/features/data-import/mergePipeline"
import { parseExcelDate, rawDateProvided } from "@/features/data-import/parseExcelDate"

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

function trimCell(v: unknown): string {
  return String(v ?? "").trim()
}

/** Area / Location must look like real data (not blanks or placeholder dashes). */
function isMissingAreaOrLocationCell(v: unknown): boolean {
  if (v === null || v === undefined) return true
  const s = String(v).trim()
  if (s === "") return true
  if (s === "—" || s === "-") return true
  return false
}

function startOfCalendarTodayLocal(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

function isCalendarDayAfterFuture(d: Date, todayLocal: Date): boolean {
  const ins = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const t0 = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate())
  return ins.getTime() > t0.getTime()
}

/** Calendar years enabled for import / dashboard (`years.is_active = true`). */
export async function fetchActiveCalendarYears(
  supabase: SupabaseClient,
): Promise<Set<number>> {
  const { data, error } = await supabase.from("years").select("year").eq("is_active", true)
  if (error) throw new Error(error.message)
  const out = new Set<number>()
  for (const row of data ?? []) {
    const y = (row as { year?: unknown }).year
    if (typeof y !== "number" || !Number.isFinite(y)) continue
    out.add(Math.trunc(y))
  }
  return out
}

/**
 * Runs checks 1 → 5; returns first failing `ImportBlockError`, or null.
 * Requires Supabase only for active-years check (4).
 */
export async function runPhase1StrictImportValidations(opts: {
  supabase: SupabaseClient
  establishmentRows: Record<string, unknown>[]
  establishmentMapping: ColumnMapping[]
  statusHistoryRows: Record<string, unknown>[]
  statusHistoryMapping: ColumnMapping[]
  inspectionsRows: Record<string, unknown>[]
  inspectionsMapping: ColumnMapping[]
}): Promise<ImportBlockError | null> {
  const {
    supabase,
    establishmentRows,
    establishmentMapping,
    statusHistoryRows,
    statusHistoryMapping,
    inspectionsRows,
    inspectionsMapping,
  } = opts

  // CHECK 1
  const missingAreaRows: number[] = []
  const missingLocationRows: number[] = []
  establishmentRows.forEach((row, i) => {
    if (!rowHasAnyCellData(row)) return
    const name = trimCell(getMappedCellValue(row, establishmentMapping, "establishmentName"))
    if (!name) return
    const excelRow = i + 2
    const areaRaw = getMappedCellValue(row, establishmentMapping, "area")
    const locRaw = getMappedCellValue(row, establishmentMapping, "location")
    if (isMissingAreaOrLocationCell(areaRaw)) missingAreaRows.push(excelRow)
    if (isMissingAreaOrLocationCell(locRaw)) missingLocationRows.push(excelRow)
  })
  if (missingAreaRows.length > 0 || missingLocationRows.length > 0) {
    return {
      kind: "phase1EstablishmentAreaLocation",
      missingAreaRows: [...new Set(missingAreaRows)].sort((a, b) => a - b),
      missingLocationRows: [...new Set(missingLocationRows)].sort((a, b) => a - b),
    }
  }

  // CHECK 2
  type DupEstBucket = {
    rows: number[]
    displayParts: { name: string; area: string; loc: string }
  }
  const estDupMap = new Map<string, DupEstBucket>()
  establishmentRows.forEach((row, i) => {
    const name = trimCell(getMappedCellValue(row, establishmentMapping, "establishmentName"))
    if (!name) return
    const excelRow = i + 2
    const area = trimCell(getMappedCellValue(row, establishmentMapping, "area"))
    const loc = trimCell(getMappedCellValue(row, establishmentMapping, "location"))
    const k = `${normalizeNameKey(name)}|${normalizeNameKey(area)}|${normalizeNameKey(loc)}`
    const prev = estDupMap.get(k)
    if (prev) {
      prev.rows.push(excelRow)
    } else {
      estDupMap.set(k, { rows: [excelRow], displayParts: { name, area, loc } })
    }
  })
  const estDupItems: { display: string; rows: number[] }[] = []
  for (const b of estDupMap.values()) {
    if (b.rows.length < 2) continue
    const { name, area, loc } = b.displayParts
    const display = `${name} — ${area} — ${loc}`
    estDupItems.push({
      display,
      rows: [...new Set(b.rows)].sort((a, x) => a - x),
    })
  }
  estDupItems.sort((a, b) => {
    const r0 = (a.rows[0] ?? 0) - (b.rows[0] ?? 0)
    return r0 !== 0 ? r0 : a.display.localeCompare(b.display)
  })
  if (estDupItems.length > 0) {
    return { kind: "phase1EstablishmentDuplicates", items: estDupItems }
  }

  // CHECK 3
  type DupStBucket = { rows: number[]; label: string }
  const stDupMap = new Map<string, DupStBucket>()
  statusHistoryRows.forEach((row, i) => {
    if (!rowHasAnyCellData(row)) return
    const name = trimCell(getMappedCellValue(row, statusHistoryMapping, "establishmentName"))
    if (!name) return
    const y = parseYearCell(getMappedCellValue(row, statusHistoryMapping, "year"))
    if (y === null) return
    const excelRow = i + 2
    const k = `${normalizeNameKey(name)}|${y}`
    const label = `${name} — ${y}`
    const prev = stDupMap.get(k)
    if (prev) {
      prev.rows.push(excelRow)
    } else {
      stDupMap.set(k, { rows: [excelRow], label })
    }
  })
  const stDupItems: { display: string; rows: number[] }[] = []
  for (const b of stDupMap.values()) {
    if (b.rows.length < 2) continue
    stDupItems.push({
      display: b.label,
      rows: [...new Set(b.rows)].sort((a, x) => a - x),
    })
  }
  stDupItems.sort((a, b) => {
    const r0 = (a.rows[0] ?? 0) - (b.rows[0] ?? 0)
    return r0 !== 0 ? r0 : a.display.localeCompare(b.display)
  })
  if (stDupItems.length > 0) {
    return { kind: "phase1StatusHistoryDuplicates", items: stDupItems }
  }

  // CHECK 4
  let activeYears: Set<number>
  try {
    activeYears = await fetchActiveCalendarYears(supabase)
  } catch {
    throw new Error("Could not load active years from the database.")
  }

  const mentionedYears = new Map<
    number,
    { statusHistoryRows: number[]; inspectionsRows: number[] }
  >()

  const touchYearOnStatus = (y: number | null, excelRow: number) => {
    if (y === null) return
    let g = mentionedYears.get(y)
    if (!g) {
      g = { statusHistoryRows: [], inspectionsRows: [] }
      mentionedYears.set(y, g)
    }
    if (!g.statusHistoryRows.includes(excelRow)) g.statusHistoryRows.push(excelRow)
  }

  const touchYearOnInsp = (y: number | null, excelRow: number) => {
    if (y === null) return
    let g = mentionedYears.get(y)
    if (!g) {
      g = { statusHistoryRows: [], inspectionsRows: [] }
      mentionedYears.set(y, g)
    }
    if (!g.inspectionsRows.includes(excelRow)) g.inspectionsRows.push(excelRow)
  }

  statusHistoryRows.forEach((row, i) => {
    if (!rowHasAnyCellData(row)) return
    const name = trimCell(getMappedCellValue(row, statusHistoryMapping, "establishmentName"))
    if (!name) return
    const yRaw = getMappedCellValue(row, statusHistoryMapping, "year")
    touchYearOnStatus(parseYearCell(yRaw), i + 2)
  })

  inspectionsRows.forEach((row, i) => {
    const name = trimCell(getMappedCellValue(row, inspectionsMapping, "establishmentName"))
    if (!name) return
    const rawDate = getMappedCellValue(row, inspectionsMapping, "inspectionDate")
    if (!rawDateProvided(rawDate)) return
    const d = parseExcelDate(rawDate)
    if (!d || Number.isNaN(d.getTime())) return
    touchYearOnInsp(d.getFullYear(), i + 2)
  })

  const inactiveYearItems: {
    year: number
    statusHistoryRows: number[]
    inspectionsRows: number[]
  }[] = []

  for (const [y, locs] of mentionedYears.entries()) {
    if (activeYears.has(y)) continue
    inactiveYearItems.push({
      year: y,
      statusHistoryRows: [...locs.statusHistoryRows].sort((a, b) => a - b),
      inspectionsRows: [...locs.inspectionsRows].sort((a, b) => a - b),
    })
  }
  inactiveYearItems.sort((a, b) => a.year - b.year)
  if (inactiveYearItems.length > 0) {
    return { kind: "phase1YearsInactive", items: inactiveYearItems }
  }

  // CHECK 5
  const today0 = startOfCalendarTodayLocal()
  const futureItems: { establishmentName: string; dateDdMmYyyy: string; row: number }[] = []
  inspectionsRows.forEach((row, i) => {
    const establishmentName = trimCell(getMappedCellValue(row, inspectionsMapping, "establishmentName"))
    if (!establishmentName) return
    const rawDate = getMappedCellValue(row, inspectionsMapping, "inspectionDate")
    if (!rawDateProvided(rawDate)) return
    const d = parseExcelDate(rawDate)
    if (!d || Number.isNaN(d.getTime())) return
    if (isCalendarDayAfterFuture(d, today0)) {
      futureItems.push({
        establishmentName,
        dateDdMmYyyy: formatInspectionDateDdMmYyyy(d),
        row: i + 2,
      })
    }
  })
  futureItems.sort((a, b) => {
    const dr = a.row - b.row
    return dr !== 0 ? dr : a.establishmentName.localeCompare(b.establishmentName)
  })
  if (futureItems.length > 0) {
    return { kind: "phase1InspectionFutureDates", items: futureItems }
  }

  return null
}
