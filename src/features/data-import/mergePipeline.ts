import type {
  AreaAr,
  Establishment,
  Inspection,
  InspectionRating,
  OperationalStatus,
} from "@/data/rawData"
import { AREAS_AR } from "@/data/rawData"

import type { ColumnMapping } from "@/features/data-import/columnMap"
import {
  parseExcelDate,
  rawDateProvided,
} from "@/features/data-import/parseExcelDate"

export function normalizeNameKey(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, " ")
}

const RATING_ALIASES: Record<string, InspectionRating> = {
  excellent: "Excellent",
  "very good": "Very Good",
  good: "Good",
  fair: "Fair",
  acceptable: "Fair",
  average: "Fair",
  poor: "Poor",
  "very poor": "Very Poor",
  ممتاز: "Excellent",
  "جيد جداً": "Very Good",
  "جيد جدا": "Very Good",
  جيد: "Good",
  متوسط: "Fair",
  مقبول: "Fair",
  ضعيف: "Poor",
  "ضعيف جداً": "Very Poor",
  "ضعيف جدا": "Very Poor",
}

export function coerceRating(raw: unknown): InspectionRating | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  const directKey = normalizeNameKey(s)
  const key = s.toLowerCase()

  const canonical: InspectionRating[] = [
    "Excellent",
    "Very Good",
    "Good",
    "Fair",
    "Poor",
    "Very Poor",
  ]
  if (canonical.includes(s as InspectionRating)) return s as InspectionRating

  return RATING_ALIASES[directKey] ?? RATING_ALIASES[key] ?? null
}

const OPS_ALIASES: Record<string, OperationalStatus> = {
  open: "Open",
  closed: "Closed",
  "under review": "Temporary Closed",
  "temporary closed": "Temporary Closed",
  "temporary close": "Temporary Closed",
  "open soon": "Open Soon",
  مغلقة: "Closed",
  مفتوح: "Open",
  مفتوحة: "Open",
  "قريبا": "Open Soon",
  "قريباً": "Open Soon",
  "مغلقة مؤقتا": "Temporary Closed",
  "مغلقة مؤقتاً": "Temporary Closed",
}

export function coerceOperationalStatus(raw: unknown): OperationalStatus | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  const key = s.toLowerCase()
  const nk = normalizeNameKey(s)
  if (["Open", "Closed", "Temporary Closed", "Open Soon"].includes(s)) {
    return s as OperationalStatus
  }
  return OPS_ALIASES[nk] ?? OPS_ALIASES[key] ?? null
}

/** Value from the parsed row for the workbook column mapped to `field` — shared with import validation. */
export function getMappedCellValue(
  row: Record<string, unknown>,
  mapping: ColumnMapping[],
  field: string,
): unknown {
  return cell(row, mapping, field)
}

function cell(row: Record<string, unknown>, mapping: ColumnMapping[], field: string): unknown {
  const m = mapping.find((x) => x.systemField === field)
  if (!m) return undefined
  return row[m.fileColumn]
}

const LATIN_AREA_HINTS: Record<string, AreaAr> = {
  doha: "الدوحة",
  katara: "الدوحة",
  "west bay": "الدوحة",
  lusail: "الدوحة",
  pearl: "الدوحة",
  rayyan: "الريان",
  arrayyan: "الريان",
  "al rayyan": "الريان",
  wakrah: "الوكرة",
  "al wakrah": "الوكرة",
  "umm salal": "أم صلال",
  "um salal": "أم صلال",
  khor: "الخور",
  "al khor": "الخور",
  shamal: "الشمال",
  "al shamal": "الشمال",
  dukhan: "الشمال",
}

export function coerceArea(raw: unknown): AreaAr {
  const s = String(raw ?? "").trim()
  if (!s) return AREAS_AR[0]!
  if (AREAS_AR.includes(s as AreaAr)) return s as AreaAr
  const key = normalizeNameKey(s).toLowerCase()
  const latin = LATIN_AREA_HINTS[key]
  return latin ?? AREAS_AR[0]!
}

function trimOpt(row: Record<string, unknown>, mapping: ColumnMapping[], field: string) {
  const v = cell(row, mapping, field)
  if (v == null || v === "") return undefined
  const s = String(v).trim()
  return s === "" ? undefined : s
}

function mergeOpt(prev: string | undefined, inc: string | undefined) {
  const t = inc?.trim()
  if (t) return t
  return prev
}

export type EstablishmentStatusHistoryRow = {
  establishmentName: string
  year: number
  operationalStatus: OperationalStatus
}

export function parseYearCell(raw: unknown): number | null {
  if (raw == null || raw === "") return null
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw)
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.getFullYear()
  const p = Number.parseInt(String(raw).trim(), 10)
  return Number.isFinite(p) ? p : null
}

export function rowsToStatusHistory(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping[],
): EstablishmentStatusHistoryRow[] {
  const list: EstablishmentStatusHistoryRow[] = []
  for (const row of rows) {
    const establishmentName = String(
      cell(row, mapping, "establishmentName") ?? "",
    ).trim()
    if (!establishmentName) continue
    const year = parseYearCell(cell(row, mapping, "year"))
    if (year === null) continue
    const operationalStatus = coerceOperationalStatus(
      cell(row, mapping, "operationalStatus"),
    )
    if (!operationalStatus) continue
    list.push({ establishmentName, year, operationalStatus })
  }
  return list
}

/** Overwrite `operationalStatus` with the status from the latest calendar year per establishment. */
export function applyStatusHistoryToEstablishments(
  establishments: Establishment[],
  history: EstablishmentStatusHistoryRow[],
) {
  const latest = new Map<string, { year: number; status: OperationalStatus }>()
  for (const h of history) {
    const k = normalizeNameKey(h.establishmentName)
    const prev = latest.get(k)
    if (!prev || h.year > prev.year) latest.set(k, { year: h.year, status: h.operationalStatus })
  }
  for (const e of establishments) {
    const hit = latest.get(normalizeNameKey(e.name))
    if (hit) e.operationalStatus = hit.status
  }
}

export function dedupeStatusHistoryByEstablishmentAndYearPreserveOrder(
  rows: EstablishmentStatusHistoryRow[],
): { deduped: EstablishmentStatusHistoryRow[]; removedCount: number } {
  const seen = new Set<string>()
  const deduped: EstablishmentStatusHistoryRow[] = []
  for (const r of rows) {
    const k = `${normalizeNameKey(r.establishmentName)}_${r.year}`
    if (seen.has(k)) continue
    seen.add(k)
    deduped.push(r)
  }
  return { deduped, removedCount: rows.length - deduped.length }
}

export function rowsToEstablishments(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping[],
): Establishment[] {
  let maxSyntheticId = 9_999_998
  const list: Establishment[] = []

  for (const row of rows) {
    const name = String(cell(row, mapping, "establishmentName") ?? "").trim()
    if (!name) continue
    const operationalStatus: OperationalStatus = "Open"
    maxSyntheticId += 1

    const rawArea = String(cell(row, mapping, "area") ?? "").trim()
    const est: Establishment = {
      id: String(maxSyntheticId),
      name,
      crNumber:
        String(cell(row, mapping, "crNumber") ?? "").trim() ||
        String(maxSyntheticId),
      area: rawArea !== "" ? rawArea : coerceArea(cell(row, mapping, "area")),
      location: String(cell(row, mapping, "location") ?? "").trim() || "—",
      operationalStatus,
      activityType: trimOpt(row, mapping, "activityType") || "Restaurant",
    }

    const nameInEms = trimOpt(row, mapping, "nameInEms")
    if (nameInEms) est.nameInEms = nameInEms

    const nbRaw = cell(row, mapping, "nbOutlets")
    if (nbRaw !== undefined && nbRaw !== null && nbRaw !== "") {
      const n = typeof nbRaw === "number" ? nbRaw : Number.parseInt(String(nbRaw), 10)
      if (Number.isFinite(n) && n >= 0) est.nbOutlets = n
    }

    const ems = trimOpt(row, mapping, "accountStatusEms")
    if (ems) est.accountStatusInEms = ems

    const phone = trimOpt(row, mapping, "phone")
    if (phone) est.phone = phone

    const personInCharge = trimOpt(row, mapping, "personInCharge")
    if (personInCharge) est.personInCharge = personInCharge

    const email = trimOpt(row, mapping, "email")
    if (email) est.email = email

    const serviceHours = trimOpt(row, mapping, "serviceHours")
    if (serviceHours) est.serviceHours = serviceHours

    const estNote = trimOpt(row, mapping, "establishmentNote")
    if (estNote) est.establishmentNote = estNote

    const photo = trimOpt(row, mapping, "establishmentPhoto")
    if (photo) est.establishmentPhoto = photo

    list.push(est)
  }

  return list
}

export function mergeEstablishments(
  baseline: Establishment[],
  imported: Establishment[],
): Establishment[] {
  const next = [...baseline]
  let maxId = Math.max(
    0,
    ...next.map((e) => {
      const n = Number(e.id)
      return Number.isFinite(n) ? n : 0
    }),
  )

  const byNorm = new Map<string, Establishment>()
  for (const e of next) byNorm.set(normalizeNameKey(e.name), e)

  for (const inc of imported) {
    const key = normalizeNameKey(inc.name)
    const prev = byNorm.get(key)
    if (prev) {
      prev.crNumber = inc.crNumber || prev.crNumber
      prev.area = inc.area ?? prev.area
      prev.location = inc.location || prev.location
      prev.operationalStatus = inc.operationalStatus
      prev.activityType = inc.activityType || prev.activityType
      prev.accountStatusInEms = mergeOpt(prev.accountStatusInEms, inc.accountStatusInEms)
      prev.phone = mergeOpt(prev.phone, inc.phone)
      prev.personInCharge = mergeOpt(prev.personInCharge, inc.personInCharge)
      prev.email = mergeOpt(prev.email, inc.email)
      prev.serviceHours = mergeOpt(prev.serviceHours, inc.serviceHours)
      prev.establishmentNote = mergeOpt(prev.establishmentNote, inc.establishmentNote)
      prev.establishmentPhoto = mergeOpt(prev.establishmentPhoto, inc.establishmentPhoto)
      prev.nameInEms = mergeOpt(prev.nameInEms, inc.nameInEms)
      if (inc.nbOutlets != null && Number.isFinite(inc.nbOutlets)) {
        prev.nbOutlets = inc.nbOutlets
      }
    } else {
      maxId += 1
      const created = { ...inc, id: String(maxId) }
      next.push(created)
      byNorm.set(key, created)
    }
  }

  return next
}

export function rowsToInspections(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping[],
): { inspections: Inspection[]; skippedUnparseableDates: number } {
  const list: Inspection[] = []
  let importRowOrdinal = 0
  let skippedUnparseableDates = 0

  for (const row of rows) {
    const establishmentName = String(
      cell(row, mapping, "establishmentName") ?? "",
    ).trim()
    if (!establishmentName) continue

    const rawDate = cell(row, mapping, "inspectionDate")
    let inspectionDate = parseExcelDate(rawDate)

    if (rawDateProvided(rawDate) && !inspectionDate) {
      skippedUnparseableDates += 1
      inspectionDate = null
    }

    const rating = coerceRating(cell(row, mapping, "rating"))
    if (!rating) continue

    const inspector =
      String(cell(row, mapping, "inspector") ?? "").trim() || "—"
    const refTrim = String(cell(row, mapping, "referenceNumber") ?? "").trim()
    const refNumber = refTrim ? refTrim : null
    const noteRaw = cell(row, mapping, "notes")
    const note =
      noteRaw !== undefined &&
      noteRaw !== null &&
      noteRaw !== "" &&
      String(noteRaw).trim() !== ""
        ? String(noteRaw).trim()
        : undefined

    const taskType = trimOpt(row, mapping, "taskType")

    list.push({
      establishmentName,
      inspectionDate,
      rating,
      inspector,
      refNumber,
      importRowOrdinal: importRowOrdinal++,
      ...(note ? { note } : {}),
      ...(taskType ? { taskType } : {}),
    })
  }

  return { inspections: list, skippedUnparseableDates }
}

/** Excel sheet row numbers: row 1 = header, first body row = 2. */
export type InspectionStrictValidationFailure = {
  dateProblemExcelRows: number[]
  ratingProblemExcelRows: number[]
}

/**
 * Inspection sheet gate: ignores accidental name-only rows; blocks import on partial inspections.
 *
 * Per row with a non-empty establishment name:
 * - Date empty (= no cell value per `rawDateProvided`) AND rating empty (`coerceRating` null): skip silently — not treated as an inspection.
 * - Otherwise: ERROR missing/bad date if the date cell is absent, unparsable, or out-of-range (`!dateOk`) while `(ratingPresent || dateProvided)`.
 * - ERROR missing rating only when the date parses successfully (`dateOk`) but there is no recognized rating tier.
 *
 * Rows with establishment name omitted are unchanged (skipped like the rest of the pipeline).
 */
export function validateInspectionRowsStrictForImport(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping[],
): InspectionStrictValidationFailure | null {
  const dateProblemExcelRows: number[] = []
  const ratingProblemExcelRows: number[] = []

  rows.forEach((row, rowIndexInSheetBody) => {
    const excelRowNumber = rowIndexInSheetBody + 2
    const establishmentName = String(
      cell(row, mapping, "establishmentName") ?? "",
    ).trim()
    if (!establishmentName) return

    const rawDate = cell(row, mapping, "inspectionDate")
    const ratingRaw = cell(row, mapping, "rating")

    const dateProvided = rawDateProvided(rawDate)
    const parsed = dateProvided ? parseExcelDate(rawDate) : null
    const dateOk =
      parsed != null && !Number.isNaN(parsed.getTime())

    const ratingPresent = coerceRating(ratingRaw) !== null

    if (!dateProvided && !ratingPresent) return

    const missingOrBadDate = !dateOk && (ratingPresent || dateProvided)
    const missingRating = dateOk && !ratingPresent

    if (missingOrBadDate) dateProblemExcelRows.push(excelRowNumber)
    if (missingRating) ratingProblemExcelRows.push(excelRowNumber)
  })

  if (
    dateProblemExcelRows.length === 0 &&
    ratingProblemExcelRows.length === 0
  )
    return null

  return { dateProblemExcelRows, ratingProblemExcelRows }
}

export function formatInspectionValidationRowList(rows: readonly number[]): string {
  const uniqueSorted = [...new Set(rows)].sort((a, b) => a - b)
  const maxShown = 50
  if (uniqueSorted.length <= maxShown) return uniqueSorted.join(", ")
  return `${uniqueSorted.slice(0, maxShown).join(", ")} …`
}

export type DuplicateInspection = {
  incomingIndex: number
  establishmentName: string
  inspectionDate: Date | null
  existing: Inspection
  incoming: Inspection
}

export function sameInspectionDay(a: Date | null, b: Date | null) {
  if (!a || !b) return false
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function normalizeRefForDuplicate(r: string | null | undefined): string | null {
  if (r == null) return null
  const t = String(r).trim()
  return t === "" ? null : t
}

/** Treat blank / placeholder inspector cells as “no inspector”. */
function normalizeInspectorLabelForDuplicate(
  inspector: string | undefined,
): string | null {
  const t = String(inspector ?? "").trim()
  if (!t || t === "—" || t === "-") return null
  return normalizeNameKey(t)
}

/** Same concrete calendar day, or both dates missing / invalid (aligned for duplicate grouping). */
function duplicateSameCalendarDateBucket(
  a: Date | null | undefined,
  b: Date | null | undefined,
): boolean {
  const aBad = !a || Number.isNaN(a.getTime())
  const bBad = !b || Number.isNaN(b.getTime())
  if (aBad && bBad) return true
  if (aBad !== bBad) return false
  return sameInspectionDay(a!, b!)
}

/**
 * True duplicate iff same establishment, calendar date (or both undated), rating,
 * reference number (null/empty = same bucket), and inspector label (null/empty = same bucket).
 */
export function sameInspectionDuplicateKey(a: Inspection, b: Inspection): boolean {
  return (
    normalizeNameKey(a.establishmentName) === normalizeNameKey(b.establishmentName) &&
    a.rating === b.rating &&
    duplicateSameCalendarDateBucket(a.inspectionDate, b.inspectionDate) &&
    normalizeRefForDuplicate(a.refNumber) === normalizeRefForDuplicate(b.refNumber) &&
    normalizeInspectorLabelForDuplicate(a.inspector) ===
      normalizeInspectorLabelForDuplicate(b.inspector)
  )
}

/**
 * Finds rows duplicated within the uploaded list only (“true” duplicates: establishment + date +
 * rating + inspector + reference all match). First occurrence stays `existing`; later rows are `incoming`.
 */
export function detectDuplicateInspectionsWithinFile(incoming: Inspection[]): DuplicateInspection[] {
  const keyToIndices = new Map<string, number[]>()

  incoming.forEach((insp, i) => {
    const k = inspectionEstablishmentDayKey(insp)
    const bucket = keyToIndices.get(k)
    if (bucket) bucket.push(i)
    else keyToIndices.set(k, [i])
  })

  const dups: DuplicateInspection[] = []
  for (const indices of keyToIndices.values()) {
    if (indices.length < 2) continue

    const sorted = [...indices].sort((a, b) => a - b)
    const firstIdx = sorted[0]!
    const existing = incoming[firstIdx]!

    for (let n = 1; n < sorted.length; n++) {
      const j = sorted[n]!
      const inc = incoming[j]!
      dups.push({
        incomingIndex: j,
        establishmentName: inc.establishmentName,
        inspectionDate: inc.inspectionDate,
        existing,
        incoming: inc,
      })
    }
  }

  return dups.sort((a, b) => a.incomingIndex - b.incomingIndex)
}

/** Legacy: compare incoming workbook rows against baseline (dashboard / LocalStorage). */
export function detectDuplicateInspections(
  existingInspections: readonly Inspection[],
  incoming: Inspection[],
): DuplicateInspection[] {
  const dups: DuplicateInspection[] = []
  incoming.forEach((inc, incomingIndex) => {
    const ex = existingInspections.find((e) => sameInspectionDuplicateKey(e, inc))
    if (ex) {
      dups.push({
        incomingIndex,
        establishmentName: inc.establishmentName,
        inspectionDate: inc.inspectionDate,
        existing: ex,
        incoming: inc,
      })
    }
  })
  return dups
}

export type DuplicateAction = "update" | "delete_old" | "delete_new" | "skip"

/** Dedupe key = full “true duplicate” identity (establishment + date bucket + rating + ref + inspector). */
export function inspectionEstablishmentDayKey(row: Inspection): string {
  const nameKey = normalizeNameKey(row.establishmentName)
  const rating = row.rating
  const refSeg = normalizeRefForDuplicate(row.refNumber) ?? "∅"
  const insSeg = normalizeInspectorLabelForDuplicate(row.inspector) ?? "∅"
  const d = row.inspectionDate
  if (!d || Number.isNaN(d.getTime())) {
    return `${nameKey}|∅date|${rating}|${refSeg}|${insSeg}`
  }
  return `${nameKey}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${rating}|${refSeg}|${insSeg}`
}

/** Keep first row per true-duplicate group — preview/save counts stay consistent. */
export function dedupeInspectionsByEstablishmentAndDayPreserveOrder(rows: Inspection[]): Inspection[] {
  const seen = new Set<string>()
  const out: Inspection[] = []
  for (const row of rows) {
    const k = inspectionEstablishmentDayKey(row)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(row)
  }
  return out
}

export function mergeInspectionImport({
  baseline,
  incomingInspections,
  duplicates,
  decisionForIndex,
}: {
  baseline: Inspection[]
  incomingInspections: Inspection[]
  duplicates: DuplicateInspection[]
  decisionForIndex: Map<number, DuplicateAction>
}) {
  const dupIncomingIdx = new Set(duplicates.map((d) => d.incomingIndex))
  const working = [...baseline]

  for (let i = 0; i < incomingInspections.length; i++) {
    if (!dupIncomingIdx.has(i)) working.push(incomingInspections[i]!)
  }

  for (const d of duplicates) {
    const action = decisionForIndex.get(d.incomingIndex) ?? "skip"
    if (action === "skip" || action === "delete_new") continue

    for (let idx = working.length - 1; idx >= 0; idx--) {
      const insp = working[idx]!
      if (sameInspectionDuplicateKey(insp, d.incoming)) {
        working.splice(idx, 1)
      }
    }

    if (action === "update") {
      working.push({
        ...d.incoming,
        refNumber: d.incoming.refNumber ?? d.existing.refNumber,
        inspector: d.incoming.inspector || d.existing.inspector,
        taskType: d.incoming.taskType ?? d.existing.taskType,
      })
    } else if (action === "delete_old") {
      working.push({ ...d.incoming })
    }
  }

  return working
}
