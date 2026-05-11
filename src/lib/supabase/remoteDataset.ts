import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  Establishment,
  Inspection,
  InspectionRating,
  OperationalStatus,
} from "@/data/rawData"
import { formatInspectionDateDdMmYyyy } from "@/data/establishmentsTable"
import type { EnrichedEstablishmentRow } from "@/lib/dataTableModel"
import { computeDaysAgo } from "@/lib/dataTableModel"
import { coerceOperationalStatus, coerceRating } from "@/features/data-import/mergePipeline"

/** Flexible reads — adapts to minor schema/view naming differences. */
export function pickFirst(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== "") return v
  }
  return undefined
}

function nestedObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

/** Single related row from PostgREST (object or one-element array). */
export function relationObject(v: unknown): Record<string, unknown> | null {
  const o = nestedObj(v)
  if (o) return o
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0]
    if (first && typeof first === "object" && !Array.isArray(first)) {
      return first as Record<string, unknown>
    }
  }
  return null
}

/** PostgREST `date` / timestamps: YYYY-MM-DD parsed as local calendar day (avoids UTC midnight drift). */
function parseInspectionDateFromApi(dateRaw: unknown): Date | null {
  if (dateRaw == null || dateRaw === "") return null
  if (typeof dateRaw === "string") {
    const s = dateRaw.trim()
    if (!s) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
    if (m) {
      const y = Number(m[1])
      const mo = Number(m[2])
      const d = Number(m[3])
      const dt = new Date(y, mo - 1, d)
      if (
        Number.isNaN(dt.getTime()) ||
        dt.getFullYear() !== y ||
        dt.getMonth() !== mo - 1 ||
        dt.getDate() !== d
      ) {
        return null
      }
      return dt
    }
    const dt = new Date(s)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  if (typeof dateRaw === "number" && Number.isFinite(dateRaw)) {
    const dt = new Date(dateRaw)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  return null
}

export type RatingLookupMaps = {
  byId: Map<
    string,
    { canonical: InspectionRating | null; nameAr: string; nameEn: string }
  >
}

export function buildRatingLookupFromRows(
  rows: readonly Record<string, unknown>[],
): RatingLookupMaps {
  const byId = new Map<
    string,
    { canonical: InspectionRating | null; nameAr: string; nameEn: string }
  >()
  for (const rec of rows) {
    const idRaw = pickFirst(rec, ["id"])
    if (idRaw === undefined || idRaw === null || idRaw === "") continue
    const nameAr = String(pickFirst(rec, ["name_ar", "nameAr"]) ?? "").trim()
    const nameEn = String(pickFirst(rec, ["name_en", "nameEn"]) ?? "").trim()
    const canonical = coerceRating(nameEn) ?? coerceRating(nameAr)
    byId.set(String(idRaw), { canonical, nameAr, nameEn })
  }
  return { byId }
}

const RATING_NEST_KEYS = [
  "ratings",
  "rating",
  "latest_rating",
  "latest_ratings",
  "inspection_ratings",
  "last_inspection_rating",
] as const

const RATING_ID_KEYS = [
  "rating_id",
  "latest_rating_id",
  "last_inspection_rating_id",
  "inspection_rating_id",
  "latest_inspection_rating_id",
  "last_rating_id",
] as const

const RATING_NAME_EN_KEYS = [
  "rating_name_en",
  "latest_rating_name_en",
  "last_rating_name_en",
  "inspection_rating_name_en",
  "latest_inspection_rating_name_en",
  "last_inspection_rating_name_en",
] as const

const RATING_NAME_AR_KEYS = [
  "rating_name_ar",
  "latest_rating_name_ar",
  "last_rating_name_ar",
  "inspection_rating_name_ar",
  "latest_inspection_rating_name_ar",
  "last_inspection_rating_name_ar",
] as const

const OPERATIONAL_STATUS_REL_KEYS = [
  "operational_statuses",
  "operational_status",
] as const

const OPERATIONAL_STATUS_NAME_EN_KEYS = [
  "operational_status_name_en",
  "status_name_en",
] as const

const OPERATIONAL_STATUS_NAME_AR_KEYS = [
  "operational_status_name_ar",
  "status_name_ar",
] as const

function takeNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s !== "" ? s : null
}

function operationalStatusNamesPresentInRow(row: Record<string, unknown>): boolean {
  if (takeNonEmptyString(pickFirst(row, [...OPERATIONAL_STATUS_NAME_EN_KEYS])))
    return true
  if (takeNonEmptyString(pickFirst(row, [...OPERATIONAL_STATUS_NAME_AR_KEYS])))
    return true
  for (const k of OPERATIONAL_STATUS_REL_KEYS) {
    const o = relationObject(row[k])
    if (!o) continue
    if (
      takeNonEmptyString(pickFirst(o, ["name_en", "nameEn"])) ||
      takeNonEmptyString(pickFirst(o, ["name_ar", "nameAr"]))
    )
      return true
  }
  return false
}

function resolveOperationalStatusFromApiRow(
  row: Record<string, unknown>,
): OperationalStatus {
  let nameEn = takeNonEmptyString(
    pickFirst(row, [...OPERATIONAL_STATUS_NAME_EN_KEYS]),
  )
  let nameAr = takeNonEmptyString(
    pickFirst(row, [...OPERATIONAL_STATUS_NAME_AR_KEYS]),
  )

  for (const k of OPERATIONAL_STATUS_REL_KEYS) {
    const o = relationObject(row[k])
    if (!o) continue
    const en = takeNonEmptyString(pickFirst(o, ["name_en", "nameEn"]))
    const ar = takeNonEmptyString(pickFirst(o, ["name_ar", "nameAr"]))
    if (en && !nameEn) nameEn = en
    if (ar && !nameAr) nameAr = ar
  }

  const coerced =
    coerceOperationalStatus(nameEn) ?? coerceOperationalStatus(nameAr)
  return coerced ?? "Open"
}

async function hydrateOperationalStatusOnViewRows(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  const missing = new Set<string>()
  for (const row of rows) {
    if (operationalStatusNamesPresentInRow(row)) continue
    const idRaw = pickFirst(row, ["operational_status_id", "operationalStatusId"])
    if (idRaw != null && String(idRaw).trim() !== "") {
      missing.add(String(idRaw))
    }
  }
  if (missing.size === 0) return

  const { data, error } = await supabase
    .from("operational_statuses")
    .select("id, name_ar, name_en")
    .in("id", [...missing])

  if (error) throw new Error(error.message)

  const byId = new Map<string, Record<string, unknown>>()
  for (const r of data ?? []) {
    const rec = r as Record<string, unknown>
    const id = String(rec.id ?? "")
    if (!id) continue
    byId.set(id, rec)
  }

  for (const row of rows) {
    if (operationalStatusNamesPresentInRow(row)) continue
    const idRaw = pickFirst(row, ["operational_status_id", "operationalStatusId"])
    const id =
      idRaw != null && String(idRaw).trim() !== "" ? String(idRaw) : ""
    if (!id) continue
    const st = byId.get(id)
    if (st) row.operational_statuses = st
  }
}

export function mapEstablishmentApiRow(
  row: Record<string, unknown>,
): Establishment | null {
  const idRaw = pickFirst(row, ["id", "establishment_id"])
  const nameRaw = pickFirst(row, ["name", "establishment_name"])
  if (idRaw === undefined || nameRaw === undefined) return null
  const id = String(idRaw)
  const name = String(nameRaw).trim()
  if (!name) return null

  const nameEnRaw = takeNonEmptyString(pickFirst(row, ["name_en", "nameEn"]))

  const areasObj = nestedObj(row.areas)

  const areaRaw =
    pickFirst(row, ["area_name_ar", "area_ar"]) ??
    areasObj?.name_ar ??
    areasObj?.nameAr ??
    ""

  const areaEnRaw = takeNonEmptyString(
    pickFirst(row, [
      "area_name_en",
      "area_en",
      "main_area_name_en",
    ]) ??
      (areasObj ? pickFirst(areasObj, ["name_en", "nameEn"]) : undefined),
  )

  const operationalStatus = resolveOperationalStatusFromApiRow(row)

  const cr =
    String(pickFirst(row, ["cr_number", "crNumber"]) ?? "").trim() || id.slice(0, 12)

  const location = String(pickFirst(row, ["location"]) ?? "—").trim() || "—"
  const activityType =
    String(pickFirst(row, ["activity_type", "activityType"]) ?? "").trim() ||
    "Restaurant"

  const areaIdRaw = pickFirst(row, ["area_id", "areaId"])
  const operationalStatusIdRaw = pickFirst(row, [
    "operational_status_id",
    "operationalStatusId",
  ])

  const est: Establishment = {
    id,
    name,
    crNumber: cr,
    area: String(areaRaw || "الدوحة"),
    location,
    operationalStatus,
    activityType,
  }

  if (areaIdRaw != null && String(areaIdRaw).trim() !== "") {
    est.areaId = String(areaIdRaw)
  }
  if (
    operationalStatusIdRaw != null &&
    String(operationalStatusIdRaw).trim() !== ""
  ) {
    est.operationalStatusId = String(operationalStatusIdRaw)
  }

  const taskType = pickFirst(row, ["task_type", "taskType"])
  if (taskType) est.taskType = String(taskType)

  const phone = pickFirst(row, ["phone"])
  if (phone) est.phone = String(phone)

  const pic = pickFirst(row, ["person_in_charge", "personInCharge"])
  if (pic) est.personInCharge = String(pic)

  const email = pickFirst(row, ["email"])
  if (email) est.email = String(email)

  const sh = pickFirst(row, ["service_hours", "serviceHours"])
  if (sh) est.serviceHours = String(sh)

  const notes = pickFirst(row, ["notes", "establishment_note"])
  if (notes) est.establishmentNote = String(notes)

  const photoRaw = pickFirst(row, [
    "photo_url",
    "establishment_photo",
    "establishmentPhoto",
    "photo",
  ])
  if (photoRaw != null && String(photoRaw).trim() !== "") {
    est.establishmentPhoto = String(photoRaw).trim()
  }

  const ems = pickFirst(row, ["account_status_in_ems", "accountStatusInEms"])
  if (ems) est.accountStatusInEms = String(ems)

  const ni = pickFirst(row, ["name_in_ems", "nameInEms"])
  if (ni) est.nameInEms = String(ni).trim() || undefined

  const nbRaw = pickFirst(row, ["nb_outlets", "nbOutlets"])
  if (nbRaw != null && nbRaw !== "") {
    const n = typeof nbRaw === "number" ? nbRaw : Number.parseInt(String(nbRaw), 10)
    if (Number.isFinite(n) && n >= 0) est.nbOutlets = n
  }

  if (nameEnRaw) est.nameEn = nameEnRaw
  if (areaEnRaw) est.areaNameEn = areaEnRaw

  return est
}

export function mapInspectionApiRow(
  row: Record<string, unknown>,
  establishmentNameById: Map<string, string>,
): Inspection | null {
  const estId = pickFirst(row, ["establishment_id", "establishmentId"])
  if (estId === undefined) return null
  const establishmentName = establishmentNameById.get(String(estId))
  if (!establishmentName) return null

  const dateRaw = pickFirst(row, ["inspection_date", "inspectionDate"])
  const inspectionDate = parseInspectionDateFromApi(dateRaw)

  const ratingsObj = relationObject(row.ratings)
  const ratingRaw =
    pickFirst(row, ["rating_name_en", "rating_en"]) ??
    ratingsObj?.name_en ??
    ratingsObj?.nameEn

  const rating =
    coerceRating(ratingRaw) ??
    coerceRating(ratingsObj?.name_ar) ??
    null
  if (!rating) return null

  const inspectorsObj = relationObject(row.inspectors)
  const inspector =
    String(
      pickFirst(row, ["inspector_name", "inspector"]) ??
        inspectorsObj?.name ??
        inspectorsObj?.name_ar ??
        inspectorsObj?.name_en ??
        "—",
    ).trim() || "—"

  const refRaw = pickFirst(row, ["reference_number", "referenceNumber"])
  const refTrim =
    refRaw != null && refRaw !== ""
      ? String(refRaw).trim()
      : ""
  const refNumber = refTrim ? refTrim : null

  const noteRaw = pickFirst(row, ["notes", "note"])
  const note =
    noteRaw !== undefined && noteRaw !== null && String(noteRaw).trim() !== ""
      ? String(noteRaw).trim()
      : undefined

  const tt = pickFirst(row, ["task_type", "taskType"])
  const taskType =
    tt != null && String(tt).trim() !== "" ? String(tt).trim() : undefined

  return {
    establishmentName,
    inspectionDate,
    rating,
    inspector,
    refNumber,
    ...(note ? { note } : {}),
    ...(taskType ? { taskType } : {}),
  }
}

function chunks<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Establishments with embedded area (operational status is year-scoped via `establishment_status_history`). */
export async function fetchEstablishmentsRemote(
  supabase: SupabaseClient,
  areaId?: string | null,
): Promise<Establishment[]> {
  let q = supabase.from("establishments").select(`
      *,
      areas(name_ar, name_en)
    `)

  if (areaId) q = q.eq("area_id", areaId)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const out: Establishment[] = []
  for (const row of data ?? []) {
    const est = mapEstablishmentApiRow(row as Record<string, unknown>)
    if (est) out.push(est)
  }
  return out
}

export async function fetchYearIdForCalendarYear(
  supabase: SupabaseClient,
  calendarYear: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("years")
    .select("id")
    .eq("year", calendarYear)
    .eq("is_active", true)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const idRaw = (data as { id?: unknown } | null)?.id
  return idRaw != null && String(idRaw) !== "" ? String(idRaw) : null
}

/**
 * Status for each establishment as stored in `establishment_status_history` for `calendarYear`.
 * Missing DB row → `null` (dashboard: غير محدد). Unknown year → all `null`.
 */
export async function fetchEstablishmentOperationalStatusForYear(
  supabase: SupabaseClient,
  establishmentIds: readonly string[],
  calendarYear: number,
): Promise<Map<string, OperationalStatus | null>> {
  const map = new Map<string, OperationalStatus | null>()
  const ids = [...new Set(establishmentIds)].filter(Boolean)
  for (const id of ids) map.set(id, null)

  if (ids.length === 0) return map

  const yearId = await fetchYearIdForCalendarYear(supabase, calendarYear)
  if (!yearId) return map

  const historySelect = `
        establishment_id,
        operational_statuses(name_ar, name_en)
      `

  for (const batch of chunks(ids, 120)) {
    const { data, error } = await supabase
      .from("establishment_status_history")
      .select(historySelect)
      .eq("year_id", yearId)
      .in("establishment_id", batch)

    if (error) throw new Error(error.message)

    for (const row of data ?? []) {
      const r = row as Record<string, unknown>
      const estId = String(pickFirst(r, ["establishment_id"]) ?? "")
      if (!estId) continue

      const stObj = relationObject(r.operational_statuses)
      const nameEn = String(
        pickFirst(r, [
          "operational_status_name_en",
          "status_name_en",
          "status_en",
        ]) ??
          stObj?.name_en ??
          stObj?.nameEn ??
          "",
      ).trim()
      const nameAr = String(
        pickFirst(r, ["operational_status_name_ar", "status_name_ar"]) ??
          stObj?.name_ar ??
          stObj?.nameAr ??
          "",
      ).trim()

      const resolved =
        coerceOperationalStatus(nameEn) ?? coerceOperationalStatus(nameAr)

      map.set(estId, resolved)
    }
  }

  return map
}

/** Inspections dated within [minYear, maxYear] (inclusive) plus rows with null dates. */
export async function fetchInspectionsForEstablishmentsForYearSpan(
  supabase: SupabaseClient,
  establishmentIds: string[],
  minYearInclusive: number,
  maxYearInclusive: number,
): Promise<Inspection[]> {
  if (establishmentIds.length === 0) return []

  const start = `${minYearInclusive}-01-01`
  const end = `${maxYearInclusive}-12-31`

  const nameById = new Map<string, string>()
  for (const batch of chunks(establishmentIds, 200)) {
    const { data: estRows, error: eErr } = await supabase
      .from("establishments")
      .select("id, name")
      .in("id", batch)
    if (eErr) throw new Error(eErr.message)
    for (const er of estRows ?? []) {
      const r = er as { id?: string; name?: string }
      if (r.id && r.name) nameById.set(String(r.id), String(r.name))
    }
  }

  const rowsOut: Inspection[] = []

  const inspSelect = `
        id,
        establishment_id,
        inspection_date,
        reference_number,
        notes,
        task_type,
        ratings(id, name_ar, name_en, color),
        inspectors(name_ar, name_en)
      `

  for (const batch of chunks(establishmentIds, 120)) {
    const { data: datedRows, error: errDated } = await supabase
      .from("inspections")
      .select(inspSelect)
      .in("establishment_id", batch)
      .gte("inspection_date", start)
      .lte("inspection_date", end)

    const { data: undatedRows, error: errUndated } = await supabase
      .from("inspections")
      .select(inspSelect)
      .in("establishment_id", batch)
      .is("inspection_date", null)

    if (errDated) throw new Error(errDated.message)
    if (errUndated) throw new Error(errUndated.message)

    for (const row of [...(datedRows ?? []), ...(undatedRows ?? [])]) {
      const insp = mapInspectionApiRow(row as Record<string, unknown>, nameById)
      if (insp) rowsOut.push(insp)
    }
  }

  return rowsOut
}

/** All dated inspections plus null-date rows per establishment IDs (dashboard overdue table uses full history). */
export async function fetchInspectionsForEstablishmentsAll(
  supabase: SupabaseClient,
  establishmentIds: string[],
): Promise<Inspection[]> {
  if (establishmentIds.length === 0) return []

  const nameById = new Map<string, string>()
  for (const batch of chunks(establishmentIds, 200)) {
    const { data: estRows, error: eErr } = await supabase
      .from("establishments")
      .select("id, name")
      .in("id", batch)
    if (eErr) throw new Error(eErr.message)
    for (const er of estRows ?? []) {
      const r = er as { id?: string; name?: string }
      if (r.id && r.name) nameById.set(String(r.id), String(r.name))
    }
  }

  const rowsOut: Inspection[] = []

  const inspSelect = `
        id,
        establishment_id,
        inspection_date,
        reference_number,
        notes,
        task_type,
        ratings(id, name_ar, name_en, color),
        inspectors(name_ar, name_en)
      `

  for (const batch of chunks(establishmentIds, 120)) {
    const { data: datedRows, error: errDated } = await supabase
      .from("inspections")
      .select(inspSelect)
      .in("establishment_id", batch)
      .not("inspection_date", "is", null)

    const { data: undatedRows, error: errUndated } = await supabase
      .from("inspections")
      .select(inspSelect)
      .in("establishment_id", batch)
      .is("inspection_date", null)

    if (errDated) throw new Error(errDated.message)
    if (errUndated) throw new Error(errUndated.message)

    for (const row of [...(datedRows ?? []), ...(undatedRows ?? [])]) {
      const insp = mapInspectionApiRow(row as Record<string, unknown>, nameById)
      if (insp) rowsOut.push(insp)
    }
  }

  return rowsOut
}

/** One inspection row for establishment detail UI (sorted client-side). */
export type EstablishmentInspectionDetail = {
  id: string
  establishmentId: string
  inspectionDate: Date | null
  rating: InspectionRating
  ratingNameAr: string
  ratingNameEn: string
  ratingColor: string | null
  /** Supabase `ratings.id` when available. */
  ratingId: string
  inspectorNameAr: string
  inspectorNameEn: string
  /** Supabase `inspectors.id` when available. */
  inspectorId: string
  refNumber: string | null
  note?: string
  taskType?: string
}

/** Inspector column / tooltip: Arabic vs English from joined `inspectors` names. */
export function inspectorDisplayName(
  ins: Pick<EstablishmentInspectionDetail, "inspectorNameAr" | "inspectorNameEn">,
  preferArabic: boolean,
): string {
  const ar = ins.inspectorNameAr.trim()
  const en = ins.inspectorNameEn.trim()
  if (preferArabic) {
    if (ar && ar !== "—") return ar
    if (en && en !== "—") return en
  } else {
    if (en && en !== "—") return en
    if (ar && ar !== "—") return ar
  }
  return "—"
}

export function mapInspectionDetailApiRow(
  row: Record<string, unknown>,
  establishmentNameById: Map<string, string>,
): EstablishmentInspectionDetail | null {
  const idRaw = pickFirst(row, ["id"])
  const estId = pickFirst(row, ["establishment_id", "establishmentId"])
  if (idRaw == null || estId == null) return null
  const establishmentName = establishmentNameById.get(String(estId))
  if (!establishmentName) return null

  const dateRaw = pickFirst(row, ["inspection_date", "inspectionDate"])
  const inspectionDate = parseInspectionDateFromApi(dateRaw)

  const ratingsObj = relationObject(row.ratings)
  const nameEn = String(
    ratingsObj?.name_en ?? ratingsObj?.nameEn ?? pickFirst(row, ["rating_name_en"]) ?? "",
  ).trim()
  const nameAr = String(
    ratingsObj?.name_ar ?? ratingsObj?.nameAr ?? pickFirst(row, ["rating_name_ar"]) ?? "",
  ).trim()
  const colorRaw = pickFirst(ratingsObj ?? {}, ["color"])
  const ratingColor =
    colorRaw != null && String(colorRaw).trim() !== ""
      ? String(colorRaw).trim()
      : null

  const rating =
    coerceRating(nameEn) ?? coerceRating(nameAr) ?? null

  if (!rating) return null

  const inspectorsObj = relationObject(row.inspectors)
  const legacyInspector = String(
    pickFirst(row, ["inspector_name", "inspector"]) ??
      inspectorsObj?.name ??
      "",
  ).trim()
  const nameArDb = String(
    pickFirst(inspectorsObj ?? {}, ["name_ar", "nameAr"]) ?? "",
  ).trim()
  const nameEnDb = String(
    pickFirst(inspectorsObj ?? {}, ["name_en", "nameEn"]) ?? "",
  ).trim()
  const inspectorNameAr =
    (nameArDb || legacyInspector || nameEnDb || "—").trim() || "—"
  const inspectorNameEn =
    (nameEnDb || legacyInspector || nameArDb || "—").trim() || "—"

  const ratingIdRaw =
    pickFirst(row, ["rating_id", "ratingId"]) ??
    pickFirst(ratingsObj ?? {}, ["id"])
  const ratingId =
    ratingIdRaw != null && String(ratingIdRaw).trim() !== ""
      ? String(ratingIdRaw)
      : ""

  const inspectorIdRaw =
    pickFirst(row, ["inspector_id", "inspectorId"]) ??
    pickFirst(inspectorsObj ?? {}, ["id"])
  const inspectorId =
    inspectorIdRaw != null && String(inspectorIdRaw).trim() !== ""
      ? String(inspectorIdRaw)
      : ""

  const refRaw = pickFirst(row, ["reference_number", "referenceNumber"])
  const refTrim =
    refRaw != null && refRaw !== "" ? String(refRaw).trim() : ""
  const refNumber = refTrim ? refTrim : null

  const noteRaw = pickFirst(row, ["notes", "note"])
  const note =
    noteRaw !== undefined && noteRaw !== null && String(noteRaw).trim() !== ""
      ? String(noteRaw).trim()
      : undefined

  const tt = pickFirst(row, ["task_type", "taskType"])
  const taskType =
    tt != null && String(tt).trim() !== "" ? String(tt).trim() : undefined

  return {
    id: String(idRaw),
    establishmentId: String(estId),
    inspectionDate,
    rating,
    ratingNameAr: nameAr,
    ratingNameEn: nameEn,
    ratingColor,
    ratingId,
    inspectorNameAr,
    inspectorNameEn,
    inspectorId,
    refNumber,
    ...(note ? { note } : {}),
    ...(taskType ? { taskType } : {}),
  }
}

/** All inspections for one establishment (newest first). */
export async function fetchInspectionsDetailForEstablishment(
  supabase: SupabaseClient,
  establishmentId: string,
): Promise<EstablishmentInspectionDetail[]> {
  const estId = establishmentId.trim()
  if (!estId) return []

  const { data: estRows, error: eErr } = await supabase
    .from("establishments")
    .select("id, name")
    .eq("id", estId)
    .maybeSingle()
  if (eErr) throw new Error(eErr.message)
  const er = estRows as { id?: string; name?: string } | null
  if (!er?.id || !er?.name) return []

  const nameById = new Map<string, string>([[String(er.id), String(er.name)]])

  const inspSelect = `
        id,
        establishment_id,
        inspection_date,
        reference_number,
        notes,
        task_type,
        rating_id,
        inspector_id,
        ratings(id, name_ar, name_en, color),
        inspectors(id, name_ar, name_en)
      `

  const { data: datedRows, error: errDated } = await supabase
    .from("inspections")
    .select(inspSelect)
    .eq("establishment_id", estId)
    .not("inspection_date", "is", null)

  const { data: undatedRows, error: errUndated } = await supabase
    .from("inspections")
    .select(inspSelect)
    .eq("establishment_id", estId)
    .is("inspection_date", null)

  if (errDated) throw new Error(errDated.message)
  if (errUndated) throw new Error(errUndated.message)

  const out: EstablishmentInspectionDetail[] = []
  for (const row of [...(datedRows ?? []), ...(undatedRows ?? [])]) {
    const d = mapInspectionDetailApiRow(row as Record<string, unknown>, nameById)
    if (d) out.push(d)
  }

  out.sort((a, b) => {
    const ta = a.inspectionDate?.getTime() ?? Number.NEGATIVE_INFINITY
    const tb = b.inspectionDate?.getTime() ?? Number.NEGATIVE_INFINITY
    return tb - ta
  })

  return out
}

export async function fetchEstablishmentById(
  supabase: SupabaseClient,
  establishmentId: string,
): Promise<Establishment | null> {
  const id = establishmentId.trim()
  if (!id) return null
  const { data, error } = await supabase
    .from("establishments")
    .select(`*, areas(name_ar, name_en)`)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return mapEstablishmentApiRow(data as Record<string, unknown>)
}

export async function fetchInspectionsForEstablishmentsAndYear(
  supabase: SupabaseClient,
  establishmentIds: string[],
  calendarYear: number,
): Promise<Inspection[]> {
  return fetchInspectionsForEstablishmentsForYearSpan(
    supabase,
    establishmentIds,
    calendarYear,
    calendarYear,
  )
}

export type EstablishmentsViewFilters = {
  search?: string
  areaId?: string | null
  statusEn?: OperationalStatus | "all"
  ratingEn?: InspectionRating | "all"
}

export function mapSortToViewColumns(
  mode: import("@/lib/dataTableModel").DataTableSortMode,
): { column: string; ascending: boolean } {
  switch (mode) {
    case "name_az":
      return { column: "name", ascending: true }
    case "name_za":
      return { column: "name", ascending: false }
    case "insp_new":
    case "days_recent":
      return { column: "inspection_date", ascending: false }
    case "insp_old":
    case "days_stale":
      return { column: "inspection_date", ascending: true }
    default:
      return { column: "name", ascending: true }
  }
}

/** Resolve filter label to FK: `establishments_with_latest_inspection` uses `operational_status_id`; names may be hydrated via `operational_statuses`. */
async function fetchOperationalStatusIdByNameEn(
  supabase: SupabaseClient,
  nameEn: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("operational_statuses")
    .select("id")
    .eq("name_en", nameEn)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const idRaw = (data as { id?: unknown } | null)?.id
  return idRaw != null && String(idRaw).trim() !== "" ? String(idRaw) : null
}

export async function fetchEstablishmentsViewFiltered(
  supabase: SupabaseClient,
  filters: EstablishmentsViewFilters,
  maxRows = 8000,
): Promise<Record<string, unknown>[]> {
  let q = supabase
    .from("establishments_with_latest_inspection")
    .select("*")
    .limit(maxRows)

  const { search, areaId, statusEn, ratingEn } = filters

  if (search?.trim()) {
    q = q.ilike("name", `%${search.trim()}%`)
  }
  if (areaId) q = q.eq("area_id", areaId)

  if (statusEn && statusEn !== "all") {
    const statusId = await fetchOperationalStatusIdByNameEn(supabase, statusEn)
    if (!statusId) return []
    q = q.eq("operational_status_id", statusId)
  }

  if (ratingEn && ratingEn !== "all") {
    q = q.eq("rating_name_en", ratingEn)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Record<string, unknown>[]
  await hydrateOperationalStatusOnViewRows(supabase, rows)
  return rows
}

export function mapEstablishmentsViewRow(
  row: Record<string, unknown>,
  ratingLookup?: RatingLookupMaps | null,
): {
  establishment: Establishment
  lastInspectionDate: Date | null
  inspectionCount: number
  latestRating: InspectionRating | null
  latestRatingNameAr: string | null
  latestRatingNameEn: string | null
  areaNameEn: string | null
} | null {
  const establishment = mapEstablishmentApiRow(row)
  if (!establishment) return null

  const areasObj = nestedObj(row.areas)
  const areaNameEn = takeNonEmptyString(
    pickFirst(row, ["area_name_en", "area_en", "main_area_name_en"]) ??
      (areasObj ? pickFirst(areasObj, ["name_en", "nameEn"]) : undefined),
  )

  const dateRaw = pickFirst(row, [
    "inspection_date",
    "latest_inspection_date",
    "last_inspection_date",
  ])
  let lastInspectionDate: Date | null = null
  if (typeof dateRaw === "string" && dateRaw) {
    const d = new Date(dateRaw)
    lastInspectionDate = Number.isNaN(d.getTime()) ? null : d
  }

  let nameEn = takeNonEmptyString(pickFirst(row, [...RATING_NAME_EN_KEYS]))
  let nameAr = takeNonEmptyString(pickFirst(row, [...RATING_NAME_AR_KEYS]))

  for (const k of RATING_NEST_KEYS) {
    const o = relationObject(row[k])
    if (!o) continue
    const en = takeNonEmptyString(pickFirst(o, ["name_en", "nameEn"]))
    const ar = takeNonEmptyString(pickFirst(o, ["name_ar", "nameAr"]))
    if (en && !nameEn) nameEn = en
    if (ar && !nameAr) nameAr = ar
  }

  let latestRating = coerceRating(nameEn) ?? coerceRating(nameAr) ?? null

  const ratingIdRaw = pickFirst(row, [...RATING_ID_KEYS])
  if (ratingIdRaw != null && ratingIdRaw !== "" && ratingLookup) {
    const hit = ratingLookup.byId.get(String(ratingIdRaw))
    if (hit) {
      if (!latestRating && hit.canonical) latestRating = hit.canonical
      if (!nameAr && hit.nameAr) nameAr = hit.nameAr
      if (!nameEn && hit.nameEn) nameEn = hit.nameEn
    }
  }

  if (!latestRating) {
    latestRating = coerceRating(nameEn) ?? coerceRating(nameAr) ?? null
  }

  const cntRaw = pickFirst(row, ["inspection_count", "total_inspections", "visit_count"])
  const inspectionCount =
    typeof cntRaw === "number"
      ? cntRaw
      : Number.parseInt(String(cntRaw ?? "0"), 10) || 0

  return {
    establishment,
    lastInspectionDate,
    inspectionCount,
    latestRating,
    latestRatingNameAr: nameAr,
    latestRatingNameEn: nameEn,
    areaNameEn,
  }
}

export function viewRowsToEnriched(
  rows: Record<string, unknown>[],
  ratingLookup?: RatingLookupMaps | null,
  dateUnknownLabel = "—",
): EnrichedEstablishmentRow[] {
  const out: EnrichedEstablishmentRow[] = []
  for (const row of rows) {
    const m = mapEstablishmentsViewRow(row, ratingLookup)
    if (!m) continue
    const {
      establishment,
      lastInspectionDate,
      inspectionCount,
      latestRating,
      latestRatingNameAr,
      latestRatingNameEn,
      areaNameEn,
    } = m
    out.push({
      establishment,
      lastInspectionDate,
      lastInspectionFormatted: formatInspectionDateDdMmYyyy(
        lastInspectionDate,
        dateUnknownLabel,
      ),
      daysAgo: computeDaysAgo(lastInspectionDate),
      inspectionCount,
      latestRating,
      areaNameEn: areaNameEn ?? undefined,
      latestRatingNameAr: latestRatingNameAr ?? undefined,
      latestRatingNameEn: latestRatingNameEn ?? undefined,
    })
  }
  return out
}

const STATUS_COUNT_ORDER: OperationalStatus[] = [
  "Open",
  "Closed",
  "Temporary Closed",
  "Open Soon",
]

export async function fetchEstablishmentStatusTotals(
  supabase: SupabaseClient,
): Promise<{
  total: number
  byStatus: Record<OperationalStatus, number>
}> {
  const { data, error } = await supabase
    .from("establishments")
    .select("operational_statuses(name_en)")
  if (error) throw new Error(error.message)

  const byStatus = Object.fromEntries(STATUS_COUNT_ORDER.map((s) => [s, 0])) as Record<
    OperationalStatus,
    number
  >

  let total = 0
  for (const row of data ?? []) {
    total += 1
    const stObj = nestedObj(
      (row as Record<string, unknown>).operational_statuses,
    )
    const raw = stObj?.name_en ?? stObj?.nameEn
    const st = coerceOperationalStatus(String(raw ?? ""))
    if (st) {
      byStatus[st] = (byStatus[st] ?? 0) + 1
    }
  }

  return { total, byStatus }
}
