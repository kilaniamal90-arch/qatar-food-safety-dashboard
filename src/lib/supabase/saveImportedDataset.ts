import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  Establishment,
  Inspection,
  InspectionRating,
  OperationalStatus,
} from "@/data/rawData"
import {
  normalizeNameKey,
  type EstablishmentStatusHistoryRow,
} from "@/features/data-import/mergePipeline"
import type { ImportSavePhase2Artifacts } from "@/features/data-import/phase2ImportTypes"

import {
  ImportSaveAbortError,
  runImportSaveDbOp,
  toImportSaveAbortError,
} from "@/lib/supabase/importSaveAbort"

const CHUNK = 120

/** Tracked INSERT ids for rollback (only rows created during this session). */
export type ImportSaveSessionInsertedIds = {
  establishments: string[]
  inspections: string[]
  statusHistory: string[]
}

export type ImportSaveProgressSnapshot = {
  phase: "loading" | "establishments" | "statusHistory" | "inspections"
  establishments: { done: number; total: number | null }
  statusHistory: { done: number; total: number | null }
  inspections: { done: number; total: number | null }
}

async function rollbackImportSessionInserts(
  supabase: SupabaseClient,
  ids: ImportSaveSessionInsertedIds,
): Promise<void> {
  const est = [...new Set(ids.establishments)]
  const hist = [...new Set(ids.statusHistory)]
  const insp = [...new Set(ids.inspections)]

  for (const batch of chunks(insp, CHUNK)) {
    if (!batch.length) continue
    const { error } = await runImportSaveDbOp(() =>
      supabase.from("inspections").delete().in("id", batch),
    )
    if (error) throw new ImportSaveAbortError("supabase", `rollback inspections: ${error.message}`)
  }
  for (const batch of chunks(hist, CHUNK)) {
    if (!batch.length) continue
    const { error } = await runImportSaveDbOp(() =>
      supabase.from("establishment_status_history").delete().in("id", batch),
    )
    if (error) throw new ImportSaveAbortError("supabase", `rollback status history: ${error.message}`)
  }
  for (const batch of chunks(est, CHUNK)) {
    if (!batch.length) continue
    const { error } = await runImportSaveDbOp(() =>
      supabase.from("establishments").delete().in("id", batch),
    )
    if (error) throw new ImportSaveAbortError("supabase", `rollback establishments: ${error.message}`)
  }
}

export type SaveImportedDatasetResult = {
  ok: boolean
  establishmentsInserted: number
  establishmentsSkippedExisting: number
  establishmentsSkippedInvalid: number
  inspectionsInserted: number
  inspectionsSkippedExisting: number
  inspectionsSkippedInvalid: number
  statusHistoryInserted: number
  statusHistorySkippedExisting: number
  statusHistorySkippedInvalid: number
  /** Inspections saved with null inspection_date */
  inspectionsUnknownDateCount: number
  /**
   * Unique inspector labels from the import (first-seen spelling) that required
   * the default inspector; order matches first appearance in the file.
   */
  inspectorFallbackNames: string[]
  /** Inspections matched to an inspector via fuzzy (approximate) spelling */
  inspectorFuzzyMatchCount: number
  /** Inspections saved with null / empty reference_number */
  inspectionsWithoutReferenceCount: number
  warnings: string[]
  errors: string[]
}

function normKey(s: string): string {
  return normalizeNameKey(s).toLowerCase()
}

/** Import `cr_number` sentinel — must match `compositeEstablishmentKeyFromDbRow` / insert payload. */
function effectiveEstablishmentCrRaw(e: Establishment): string {
  return String(e.crNumber ?? "").trim() || String(e.id)
}

/**
 * Full dedupe identity: name + location + area_id + CR (same rules as Phase 2 establishment match).
 * CR is never sufficient on its own — always part of this composite key.
 */
function compositeEstablishmentKey(e: Establishment, areaId: string): string {
  return `${normKey(e.name)}|${normKey(String(e.location ?? ""))}|${areaId}|${normKey(effectiveEstablishmentCrRaw(e))}`
}

function compositeEstablishmentKeyFromDbRow(r: {
  name?: string
  location?: string
  area_id?: unknown
  cr_number?: string | null
}): string {
  const aid = r.area_id != null ? String(r.area_id) : ""
  const cr = String(r.cr_number ?? "").trim()
  return `${normKey(String(r.name ?? ""))}|${normKey(String(r.location ?? ""))}|${aid}|${normKey(cr)}`
}

/** Existing rows keyed by compositeEstablishmentKey (name + location + area + CR). */
async function fetchExistingEstablishmentCompositeMap(
  supabase: SupabaseClient,
  areaIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(areaIds)].filter(Boolean)
  for (const batch of chunks(ids, CHUNK)) {
    if (batch.length === 0) continue
    const { data, error } = await runImportSaveDbOp(() =>
      supabase
        .from("establishments")
        .select("id, name, location, area_id, cr_number")
        .in("area_id", batch),
    )
    if (error)
      throw new ImportSaveAbortError("supabase", `establishments fetch (composite): ${error.message}`)
    for (const row of data ?? []) {
      const r = row as {
        id: unknown
        name?: string
        location?: string
        area_id?: string
        cr_number?: string | null
      }
      const id = String(r.id)
      const aid = r.area_id != null ? String(r.area_id) : ""
      if (!aid) continue
      const k = compositeEstablishmentKeyFromDbRow(r)
      if (!out.has(k)) out.set(k, id)
    }
  }
  return out
}

function chunks<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function stringsFromRow(row: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(row)) {
    if (k === "id") continue
    if (typeof v === "string" && v.trim()) out.push(v.trim())
  }
  return out
}

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** DB + import use the same sentinel for missing calendar date on an inspection row. */
const INSPECTION_DATE_NULL_KEY = "__DATE_NULL__"

const nullSafeEqual = (a: unknown, b: unknown): boolean =>
  (a === null || a === undefined) && (b === null || b === undefined)
    ? true
    : a === b

/** Optional text / FK columns from DB / import: absent, null, "", or whitespace-only == same bucket. */
function canonicalOptionalText(value: unknown): string | null {
  if (nullSafeEqual(value, null)) return null
  if (value === "") return null
  const s = String(value).trim()
  return s === "" ? null : s
}

function referenceSegmentForDedupe(canonicalNullable: string | null): string {
  return nullSafeEqual(canonicalNullable, null)
    ? "__REF_NULL__"
    : `ref:${canonicalNullable as string}`
}

function inspectorSegmentForDedupe(canonicalNullable: string | null): string {
  return nullSafeEqual(canonicalNullable, null)
    ? "__INSP_NULL__"
    : `insp:${canonicalNullable as string}`
}

/**
 * Calendar-only YYYY-MM-DD for duplicate identity; missing / invalid ↔ null bucket (aligned with inserts).
 */
function canonicalInspectionCalendarDateIso(value: unknown): string | null {
  if (
    nullSafeEqual(value, null) ||
    value === "" ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null
  }
  // Prefer literal leading calendar date when DB returns DATE or timestamptz as string (avoids TZ drift).
  if (typeof value === "string") {
    const s = value.trim()
    const head = /^(\d{4}-\d{2}-\d{2})/.exec(s)?.[1]
    if (head) return head
    const parsed = Date.parse(s)
    if (!Number.isNaN(parsed)) return toIsoDateLocal(new Date(parsed))
    return null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDateLocal(value)
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : toIsoDateLocal(d)
  }
  return null
}

function inspectionDuplicateCompositeKey(parts: {
  establishmentId: string
  inspectionDateIsoOrNull: string | null
  ratingId: string
  inspectorId: string | null
  referenceNormalized: string | null
}): string {
  const ds = nullSafeEqual(parts.inspectionDateIsoOrNull, null)
    ? INSPECTION_DATE_NULL_KEY
    : (parts.inspectionDateIsoOrNull as string)
  return `${parts.establishmentId}|${ds}|${parts.ratingId}|${inspectorSegmentForDedupe(parts.inspectorId)}|${referenceSegmentForDedupe(parts.referenceNormalized)}`
}

function inspectionDedupeKeyFromStoredRow(row: Record<string, unknown>): string | null {
  const est = row.establishment_id ?? row.establishmentId
  const rid = row.rating_id ?? row.ratingId
  if (est === null || est === undefined || rid === null || rid === undefined) return null

  const dateIso = canonicalInspectionCalendarDateIso(
    row.inspection_date ?? row.inspectionDate,
  )

  const refRaw = row.reference_number ?? row.referenceNumber
  const referenceNormalized = canonicalOptionalText(refRaw)

  const insRaw = row.inspector_id ?? row.inspectorId
  const inspectorId = canonicalOptionalText(insRaw)

  return inspectionDuplicateCompositeKey({
    establishmentId: String(est),
    inspectionDateIsoOrNull: dateIso,
    ratingId: String(rid),
    inspectorId,
    referenceNormalized,
  })
}

const INSPECTIONS_DEDUPE_PAGE = 1000

async function fetchExistingInspectionDedupeKeys(
  supabase: SupabaseClient,
  establishmentIds: string[],
): Promise<{ keys: Set<string>; rowsFetched: number }> {
  const existing = new Set<string>()
  let rowsFetched = 0
  const uniqueIds = [...new Set(establishmentIds)].filter(Boolean)
  for (const batch of chunks(uniqueIds, CHUNK)) {
    if (batch.length === 0) continue

    let offset = 0
    for (;;) {
      const { data, error } = await runImportSaveDbOp(() =>
        supabase
          .from("inspections")
          .select("establishment_id, inspection_date, rating_id, inspector_id, reference_number")
          .in("establishment_id", batch)
          .order("id", { ascending: true })
          .range(offset, offset + INSPECTIONS_DEDUPE_PAGE - 1),
      )

      if (error) throw new ImportSaveAbortError("supabase", `inspections fetch (dedupe): ${error.message}`)

      const page = data ?? []
      rowsFetched += page.length
      for (const row of page) {
        const k = inspectionDedupeKeyFromStoredRow(row as Record<string, unknown>)
        if (k) existing.add(k)
      }

      if (page.length < INSPECTIONS_DEDUPE_PAGE) break
      offset += INSPECTIONS_DEDUPE_PAGE
    }
  }
  return { keys: existing, rowsFetched }
}

function deterministicFallbackInspectorId(
  inspectorRows: Record<string, unknown>[],
): string | null {
  const ids = inspectorRows
    .map((r) => r.id)
    .filter((id) => id !== undefined && id !== null && String(id).trim() !== "")
    .map((id) => String(id))
  ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return ids[0] ?? null
}

function buildLabelMap(rows: Record<string, unknown>[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const row of rows) {
    const id = row.id
    if (id === undefined || id === null) continue
    const sid = String(id)
    for (const lb of stringsFromRow(row)) {
      const k = normKey(lb)
      if (!k) continue
      if (!m.has(k)) m.set(k, sid)
    }
  }
  return m
}

function buildRatingMap(rows: Record<string, unknown>[]): Map<InspectionRating, string> {
  const byLabel = buildLabelMap(rows)
  const out = new Map<InspectionRating, string>()
  const canonical: InspectionRating[] = [
    "Excellent",
    "Very Good",
    "Good",
    "Fair",
    "Poor",
    "Very Poor",
  ]
  for (const r of canonical) {
    const id = byLabel.get(normKey(r))
    if (id) out.set(r, id)
  }
  return out
}

function buildStatusMap(rows: Record<string, unknown>[]): Map<OperationalStatus, string> {
  const byLabel = buildLabelMap(rows)
  const out = new Map<OperationalStatus, string>()
  const canonical: OperationalStatus[] = [
    "Open",
    "Closed",
    "Temporary Closed",
    "Open Soon",
  ]
  for (const s of canonical) {
    const id = byLabel.get(normKey(s))
    if (id) out.set(s, id)
  }
  const aliases: [OperationalStatus, string][] = [
    ["Open", normKey("مفتوحة")],
    ["Closed", normKey("مغلقة")],
    ["Temporary Closed", normKey("مغلقة مؤقتاً")],
    ["Temporary Closed", normKey("مغلقة مؤقتا")],
    ["Open Soon", normKey("قريباً")],
    ["Open Soon", normKey("قريبا")],
  ]
  for (const [st, key] of aliases) {
    const id = byLabel.get(key)
    if (id && !out.has(st)) out.set(st, id)
  }
  return out
}

/** Levenshtein distance; used for 1–2 character fuzzy inspector matching. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const al = a.length
  const bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al
  const v0 = new Array<number>(bl + 1)
  const v1 = new Array<number>(bl + 1)
  for (let j = 0; j <= bl; j++) v0[j] = j
  for (let i = 0; i < al; i++) {
    v1[0] = i + 1
    for (let j = 0; j < bl; j++) {
      const cost = a[i] === b[j] ? 0 : 1
      v1[j + 1] = Math.min(v1[j]! + 1, v0[j + 1]! + 1, v0[j]! + cost)
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j]!
  }
  return v1[bl]!
}

type InspectorRowMatch =
  | { kind: "exact" | "fuzzy"; id: string }
  | { kind: "none" }

function matchInspectorRow(
  inspectorLabelMap: Map<string, string>,
  rawInspector: string,
): InspectorRowMatch {
  const t = rawInspector.trim()
  if (!t || t === "—" || t === "-") return { kind: "none" }
  const nk = normKey(t)
  if (!nk) return { kind: "none" }

  const exactId = inspectorLabelMap.get(nk)
  if (exactId) return { kind: "exact", id: exactId }

  let bestKey: string | null = null
  let bestDist = Infinity
  for (const key of inspectorLabelMap.keys()) {
    const d = levenshtein(nk, key)
    if (d === 0 || d > 2) continue
    if (d < bestDist || (d === bestDist && bestKey !== null && key < bestKey)) {
      bestDist = d
      bestKey = key
    }
  }
  if (bestKey !== null) {
    const id = inspectorLabelMap.get(bestKey)
    if (id) return { kind: "fuzzy", id }
  }
  return { kind: "none" }
}

async function fetchAllRows(
  supabase: SupabaseClient,
  table: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await runImportSaveDbOp(() => supabase.from(table).select("*"))
  if (error) throw new ImportSaveAbortError("supabase", `${table}: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

function inspectionRefForLog(insp: Inspection): string {
  const r = insp.refNumber?.trim()
  if (r) return r
  if (insp.importRowOrdinal != null) return `#${insp.importRowOrdinal + 1}`
  return insp.establishmentName.slice(0, 28)
}

/** Record unique fallback inspector display labels in first-seen order (dedupe by normalized name). */
function createFallbackInspectorTracker(normKeyFn: (s: string) => string) {
  const ordered: string[] = []
  const seenNorm = new Set<string>()
  return {
    add(raw: string) {
      const label = raw.trim()
      if (!label || label === "—" || label === "-") return
      const nk = normKeyFn(label)
      if (seenNorm.has(nk)) return
      seenNorm.add(nk)
      ordered.push(label)
    },
    names(): string[] {
      return ordered
    },
  }
}

async function fetchExistingStatusHistoryKeys(
  supabase: SupabaseClient,
  establishmentIds: string[],
): Promise<Set<string>> {
  const existing = new Set<string>()
  const uniqueIds = [...new Set(establishmentIds)].filter(Boolean)
  for (const batch of chunks(uniqueIds, CHUNK)) {
    if (batch.length === 0) continue
    const { data, error } = await runImportSaveDbOp(() =>
      supabase
        .from("establishment_status_history")
        .select("establishment_id, year_id")
        .in("establishment_id", batch),
    )
    if (error)
      throw new ImportSaveAbortError("supabase", `establishment_status_history fetch: ${error.message}`)
    for (const row of data ?? []) {
      const r = row as { establishment_id?: string; year_id?: string }
      if (r.establishment_id && r.year_id) {
        existing.add(`${r.establishment_id}|${r.year_id}`)
      }
    }
  }
  return existing
}

/**
 * Persists merged establishments and inspections from the import wizard to Supabase.
 * Skips establishments already matched when the same normalized name, location, area_id, and
 * effective CR (same rules as inserts) match an existing row; skips inspections
 * that match an existing row by establishment_id + inspection_date + rating_id + inspector_id +
 * reference_number (optional fields treated null-safe, including date/ref/inspector).
 */
export async function saveImportedDatasetToSupabase(
  supabase: SupabaseClient,
  input: {
    establishments: Establishment[]
    inspections: Inspection[]
    statusHistory?: EstablishmentStatusHistoryRow[]
    phase2?: ImportSavePhase2Artifacts | null
    onProgress?: (p: ImportSaveProgressSnapshot) => void
  },
): Promise<SaveImportedDatasetResult> {
  const warnings: string[] = []
  const errors: string[] = []

  const inserted: ImportSaveSessionInsertedIds = {
    establishments: [],
    inspections: [],
    statusHistory: [],
  }

  let establishmentsInserted = 0
  let establishmentsSkippedExisting = 0
  let establishmentsSkippedInvalid = 0
  let inspectionsInserted = 0
  let inspectionsSkippedExisting = 0
  let inspectionsSkippedInvalid = 0
  let statusHistoryInserted = 0
  let statusHistorySkippedExisting = 0
  let statusHistorySkippedInvalid = 0

  const prog: ImportSaveProgressSnapshot = {
    phase: "loading",
    establishments: { done: 0, total: null },
    statusHistory: { done: 0, total: null },
    inspections: { done: 0, total: null },
  }
  const emitProgress = () => {
    input.onProgress?.({
      phase: prog.phase,
      establishments: { ...prog.establishments },
      statusHistory: { ...prog.statusHistory },
      inspections: { ...prog.inspections },
    })
  }
  emitProgress()

  async function rollbackSessionOrThrow(cause: unknown): Promise<void> {
    const hasInserts =
      inserted.establishments.length > 0 ||
      inserted.inspections.length > 0 ||
      inserted.statusHistory.length > 0
    if (!hasInserts) return
    try {
      await rollbackImportSessionInserts(supabase, inserted)
    } catch (rbErr) {
      const extra = rbErr instanceof Error ? rbErr.message : String(rbErr)
      const base = cause instanceof Error ? cause.message : String(cause)
      throw new ImportSaveAbortError("supabase", `${base}\nRollback failed: ${extra}`)
    }
    inserted.establishments.length = 0
    inserted.inspections.length = 0
    inserted.statusHistory.length = 0
  }

  try {
    const [areaRows, ratingRows, statusRows, inspectorRows, yearRows] = await Promise.all([
      fetchAllRows(supabase, "areas"),
      fetchAllRows(supabase, "ratings"),
      fetchAllRows(supabase, "operational_statuses"),
      fetchAllRows(supabase, "inspectors"),
      fetchAllRows(supabase, "years"),
    ])

    const areaByLabel = buildLabelMap(areaRows)
    const ratingByRating = buildRatingMap(ratingRows)
    const statusByOperational = buildStatusMap(statusRows)
    const inspectorByLabel = buildLabelMap(inspectorRows)

    const fallbackInspectorId = deterministicFallbackInspectorId(inspectorRows)

    const yearIdByNumber = new Map<number, string>()
    for (const row of yearRows) {
      const y = row.year
      const id = row.id
      if (typeof y === "number" && id !== undefined && id !== null) {
        yearIdByNumber.set(y, String(id))
      }
    }

    const estList = input.establishments
    const inspList = input.inspections
    const importStatusHistoryRows: EstablishmentStatusHistoryRow[] = input.statusHistory ?? []
    prog.statusHistory.total =
      (input.phase2?.statusHistoryUpserts ?? []).length + importStatusHistoryRows.length
    emitProgress()

    const uniqueAreaIdsFromFile = new Set<string>()
    for (const e of estList) {
      const aid = areaByLabel.get(normKey(String(e.area ?? "").trim()))
      if (aid) uniqueAreaIdsFromFile.add(aid)
    }
    const compositeKeyToId = await fetchExistingEstablishmentCompositeMap(
      supabase,
      [...uniqueAreaIdsFromFile],
    )

    const p2 = input.phase2
    if (p2?.omitNameDedupeNormKeys?.length) {
      for (const nk of p2.omitNameDedupeNormKeys) {
        for (const key of [...compositeKeyToId.keys()]) {
          if (key.startsWith(`${nk}|`)) compositeKeyToId.delete(key)
        }
      }
    }

    for (const u of p2?.establishmentUpdates ?? []) {
      const e = u.fileEstablishment
      const areaId = areaByLabel.get(normKey(String(e.area ?? "").trim()))
      if (!areaId) {
        warnings.push(`phase2 update "${e.name}": unknown area "${e.area}" — skipped`)
        continue
      }
      const statusId = statusByOperational.get(e.operationalStatus)
      if (!statusId) {
        warnings.push(
          `phase2 update "${e.name}": unknown operational status "${e.operationalStatus}" — skipped`,
        )
        continue
      }
      const patch = {
        name: e.name,
        name_in_ems: e.nameInEms ?? null,
        nb_outlets: e.nbOutlets ?? null,
        cr_number: String(e.crNumber ?? "").trim() || String(e.id),
        area_id: areaId,
        operational_status_id: statusId,
        activity_type: e.activityType,
        task_type: e.taskType ?? null,
        location: e.location,
        account_status_in_ems: e.accountStatusInEms ?? null,
        phone: e.phone ?? null,
        person_in_charge: e.personInCharge ?? null,
        email: e.email ?? null,
        service_hours: e.serviceHours ?? null,
        notes: e.establishmentNote ?? null,
      }
      const { error: upErr } = await runImportSaveDbOp(() =>
        supabase.from("establishments").update(patch).eq("id", u.dbEstablishmentId),
      )
      if (upErr) {
        await rollbackSessionOrThrow(upErr)
        throw new ImportSaveAbortError("supabase", `phase2 establishment update: ${upErr.message}`)
      }
      compositeKeyToId.set(compositeEstablishmentKey(e, areaId), u.dbEstablishmentId)
    }

    const nameKeyToDbId = new Map<string, string>()

    function rememberEstablishment(nameKey: string, id: string) {
      if (!nameKeyToDbId.has(nameKey)) nameKeyToDbId.set(nameKey, id)
    }

    for (const e of estList) {
      const nk = normKey(e.name)
      const areaId = areaByLabel.get(normKey(String(e.area ?? "").trim()))
      const id = areaId ? compositeKeyToId.get(compositeEstablishmentKey(e, areaId)) : undefined
      if (id) rememberEstablishment(nk, id)
    }

    const statusHistoryPairKeysFromPhase2 = new Set<string>()
    for (const s of p2?.statusHistoryUpserts ?? []) {
      const yearId = yearIdByNumber.get(s.calendarYear) ?? null
      if (!yearId) {
        warnings.push(`phase2 status: year ${s.calendarYear} not in years table`)
        prog.statusHistory.done += 1
        emitProgress()
        continue
      }
      const stId = statusByOperational.get(s.operationalStatus)
      if (!stId) {
        warnings.push(
          `phase2 status: unknown operational status "${s.operationalStatus}"`,
        )
        prog.statusHistory.done += 1
        emitProgress()
        continue
      }
      const rowPayload = {
        establishment_id: s.dbEstablishmentId,
        year_id: yearId,
        operational_status_id: stId,
      }
      const { data: updData, error: upErr } = await runImportSaveDbOp(() =>
        supabase
          .from("establishment_status_history")
          .update({ operational_status_id: stId })
          .eq("establishment_id", s.dbEstablishmentId)
          .eq("year_id", yearId)
          .select("establishment_id"),
      )
      if (upErr) {
        await rollbackSessionOrThrow(upErr)
        throw new ImportSaveAbortError("supabase", `phase2 status history update: ${upErr.message}`)
      }
      if (updData && updData.length > 0) {
        statusHistoryPairKeysFromPhase2.add(`${s.dbEstablishmentId}|${yearId}`)
        prog.statusHistory.done += 1
        emitProgress()
        continue
      }
      const { data: insData, error: insErr } = await runImportSaveDbOp(() =>
        supabase.from("establishment_status_history").insert([rowPayload]).select("id"),
      )
      if (insErr) {
        await rollbackSessionOrThrow(insErr)
        throw new ImportSaveAbortError("supabase", `phase2 status history insert: ${insErr.message}`)
      }
      const newId = (insData?.[0] as { id?: unknown } | undefined)?.id
      if (newId != null) inserted.statusHistory.push(String(newId))
      statusHistoryInserted += 1
      statusHistoryPairKeysFromPhase2.add(`${s.dbEstablishmentId}|${yearId}`)
      prog.statusHistory.done += 1
      emitProgress()
    }

    const toInsert: Record<string, unknown>[] = []
    const insertOrder: Establishment[] = []

    for (const e of estList) {
      const nk = normKey(e.name)
      const areaId = areaByLabel.get(normKey(String(e.area ?? "").trim()))
      let existingId = areaId
        ? compositeKeyToId.get(compositeEstablishmentKey(e, areaId))
        : undefined

      if (existingId) {
        establishmentsSkippedExisting += 1
        rememberEstablishment(nk, existingId)
        continue
      }

      if (!areaId) {
        warnings.push(`establishment "${e.name}": unknown area "${e.area}" — skipped`)
        establishmentsSkippedInvalid += 1
        continue
      }

      const statusId = statusByOperational.get(e.operationalStatus)
      if (!statusId) {
        warnings.push(
          `establishment "${e.name}": unknown operational status "${e.operationalStatus}" — skipped`,
        )
        establishmentsSkippedInvalid += 1
        continue
      }

      insertOrder.push(e)
      toInsert.push({
        name: e.name,
        name_in_ems: e.nameInEms ?? null,
        nb_outlets: e.nbOutlets ?? null,
        cr_number: String(e.crNumber ?? "").trim() || String(e.id),
        area_id: areaId,
        operational_status_id: statusId,
        activity_type: e.activityType,
        task_type: e.taskType ?? null,
        location: e.location,
        account_status_in_ems: e.accountStatusInEms ?? null,
        phone: e.phone ?? null,
        person_in_charge: e.personInCharge ?? null,
        email: e.email ?? null,
        service_hours: e.serviceHours ?? null,
        notes: e.establishmentNote ?? null,
        photo_url: null,
      })
    }

    prog.establishments.total = toInsert.length
    prog.phase = "establishments"
    emitProgress()

    let estOffset = 0
    for (const batch of chunks(toInsert, 40)) {
      if (batch.length === 0) continue
      const { data, error } = await runImportSaveDbOp(() =>
        supabase.from("establishments").insert(batch).select("id, name"),
      )

      if (error) {
        await rollbackSessionOrThrow(error)
        throw new ImportSaveAbortError("supabase", `establishments batch: ${error.message}`)
      }
      const rows = data ?? []
      if (rows.length !== batch.length) {
        await rollbackSessionOrThrow(
          new Error(`establishments: returned ${rows.length}/${batch.length} rows`),
        )
        throw new ImportSaveAbortError(
          "supabase",
          `establishments batch: expected ${batch.length} inserted rows, got ${rows.length}`,
        )
      }
      establishmentsInserted += rows.length
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as { id: unknown; name?: string }
        const est = insertOrder[estOffset + i]
        if (!est) continue
        const id = String(row.id)
        inserted.establishments.push(id)
        const nk = normKey(est?.name ?? String(row.name ?? ""))
        rememberEstablishment(nk, id)
        const aid = areaByLabel.get(normKey(String(est.area ?? "").trim()))
        if (aid) compositeKeyToId.set(compositeEstablishmentKey(est, aid), id)
      }
      estOffset += batch.length
      prog.establishments.done = estOffset
      emitProgress()
    }

    prog.phase = "statusHistory"
    emitProgress()
    if (importStatusHistoryRows.length > 0) {
      const estIdsForHistory = [
        ...new Set(
          importStatusHistoryRows
            .map((h) => nameKeyToDbId.get(normKey(h.establishmentName)))
            .filter((id): id is string => Boolean(id)),
        ),
      ]
      const existingStatusPairs =
        estIdsForHistory.length > 0
          ? await fetchExistingStatusHistoryKeys(supabase, estIdsForHistory)
          : new Set<string>()
      for (const k of statusHistoryPairKeysFromPhase2) existingStatusPairs.add(k)

      const statusPayload: Record<string, unknown>[] = []
      for (const h of importStatusHistoryRows) {
        const estId = nameKeyToDbId.get(normKey(h.establishmentName))
        if (!estId) {
          statusHistorySkippedInvalid += 1
          warnings.push(
            `status history (${h.year}): unknown establishment "${h.establishmentName}"`,
          )
          prog.statusHistory.done += 1
          emitProgress()
          continue
        }
        const yearId = yearIdByNumber.get(h.year) ?? null
        if (!yearId) {
          statusHistorySkippedInvalid += 1
          warnings.push(
            `status history "${h.establishmentName}": year ${h.year} not found in years table`,
          )
          prog.statusHistory.done += 1
          emitProgress()
          continue
        }
        const stId = statusByOperational.get(h.operationalStatus)
        if (!stId) {
          statusHistorySkippedInvalid += 1
          warnings.push(
            `status history "${h.establishmentName}": unknown operational status "${h.operationalStatus}"`,
          )
          prog.statusHistory.done += 1
          emitProgress()
          continue
        }
        const pairKey = `${estId}|${yearId}`
        if (existingStatusPairs.has(pairKey)) {
          statusHistorySkippedExisting += 1
          prog.statusHistory.done += 1
          emitProgress()
          continue
        }
        existingStatusPairs.add(pairKey)
        statusPayload.push({
          establishment_id: estId,
          year_id: yearId,
          operational_status_id: stId,
        })
      }

      for (const batch of chunks(statusPayload, 60)) {
        if (batch.length === 0) continue
        const { data: stRows, error } = await runImportSaveDbOp(() =>
          supabase.from("establishment_status_history").insert(batch).select("id"),
        )
        if (error) {
          await rollbackSessionOrThrow(error)
          throw new ImportSaveAbortError("supabase", `establishment_status_history batch: ${error.message}`)
        }
        const insertedRows = stRows ?? []
        if (insertedRows.length !== batch.length) {
          await rollbackSessionOrThrow(
            new Error(`status history: returned ${insertedRows.length}/${batch.length} rows`),
          )
          throw new ImportSaveAbortError(
            "supabase",
            `establishment_status_history batch: expected ${batch.length} rows, got ${insertedRows.length}`,
          )
        }
        for (const r of insertedRows) {
          const id = (r as { id?: unknown }).id
          if (id != null) inserted.statusHistory.push(String(id))
        }
        statusHistoryInserted += batch.length
        prog.statusHistory.done += batch.length
        emitProgress()
      }
    }

    const estIdsForInspectionDedupe = [
      ...new Set(
        inspList
          .map((i) => nameKeyToDbId.get(normKey(i.establishmentName)))
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    const {
      keys: existingInspectionKeys,
      rowsFetched: inspectionDedupeRowsFetchedTotal,
    } =
      estIdsForInspectionDedupe.length > 0
        ? await fetchExistingInspectionDedupeKeys(supabase, estIdsForInspectionDedupe)
        : { keys: new Set<string>(), rowsFetched: 0 }

    let inspectorFuzzyMatchCount = 0
    let inspectionsUnknownDateCount = 0
    let inspectionsWithoutReferenceCount = 0
    const fallbackInspectorTracker = createFallbackInspectorTracker(normKey)

    const inspPayload: Record<string, unknown>[] = []
    for (const insp of inspList) {
      const referenceNormalizedIncoming = canonicalOptionalText(insp.refNumber)
      const hasReference = referenceNormalizedIncoming != null

      const logRef = inspectionRefForLog(insp)

      const estId = nameKeyToDbId.get(normKey(insp.establishmentName))
      if (!estId) {
        warnings.push(
          `inspection ${logRef}: unknown establishment "${insp.establishmentName}"`,
        )
        inspectionsSkippedInvalid += 1
        continue
      }

      const ratingId = ratingByRating.get(insp.rating)
      if (!ratingId) {
        warnings.push(`inspection ${logRef}: unknown rating "${insp.rating}"`)
        inspectionsSkippedInvalid += 1
        continue
      }

      const hasValidDate =
        insp.inspectionDate != null && !Number.isNaN(insp.inspectionDate.getTime())

      if (!hasValidDate) {
        inspectionsUnknownDateCount += 1
      }

      if (!hasReference) {
        inspectionsWithoutReferenceCount += 1
      }

      const matchedInspector = matchInspectorRow(inspectorByLabel, insp.inspector)
      let inspectorId: string | null = null
      if (matchedInspector.kind !== "none") {
        inspectorId = matchedInspector.id
        if (matchedInspector.kind === "fuzzy") inspectorFuzzyMatchCount += 1
      }

      if (!inspectorId) {
        if (fallbackInspectorId) {
          inspectorId = fallbackInspectorId
          fallbackInspectorTracker.add(insp.inspector)
        } else {
          warnings.push(`inspection ${logRef}: no inspector match and no fallback`)
          inspectionsSkippedInvalid += 1
          continue
        }
      }

      const y = hasValidDate ? insp.inspectionDate!.getFullYear() : null
      const yearId = y != null ? yearIdByNumber.get(y) ?? null : null

      const inspectorForDedupeKey = canonicalOptionalText(inspectorId)
      const inspectionDateIsoForDedupe = canonicalInspectionCalendarDateIso(
        hasValidDate ? insp.inspectionDate : null,
      )

      const dedupeKey = inspectionDuplicateCompositeKey({
        establishmentId: estId,
        inspectionDateIsoOrNull: inspectionDateIsoForDedupe,
        ratingId,
        inspectorId: inspectorForDedupeKey,
        referenceNormalized: referenceNormalizedIncoming,
      })
      if (existingInspectionKeys.has(dedupeKey)) {
        inspectionsSkippedExisting += 1
        continue
      }
      existingInspectionKeys.add(dedupeKey)

      inspPayload.push({
        establishment_id: estId,
        inspection_date: hasValidDate ? toIsoDateLocal(insp.inspectionDate!) : null,
        rating_id: ratingId,
        inspector_id: inspectorId,
        reference_number: referenceNormalizedIncoming,
        notes: insp.note ?? null,
        task_type: insp.taskType ?? null,
        heatmap_url: null,
        ...(yearId ? { year_id: yearId } : {}),
      })
    }

    prog.phase = "inspections"
    prog.inspections.total = inspPayload.length
    prog.inspections.done = 0
    emitProgress()

    let inspOffset = 0
    for (const batch of chunks(inspPayload, 50)) {
      if (batch.length === 0) continue
      const { data: insData, error } = await runImportSaveDbOp(() =>
        supabase.from("inspections").insert(batch).select("id"),
      )
      if (error) {
        await rollbackSessionOrThrow(error)
        throw new ImportSaveAbortError("supabase", `inspections batch: ${error.message}`)
      }
      const rows = insData ?? []
      if (rows.length !== batch.length) {
        await rollbackSessionOrThrow(
          new Error(`inspections: returned ${rows.length}/${batch.length} rows`),
        )
        throw new ImportSaveAbortError(
          "supabase",
          `inspections batch: expected ${batch.length} rows, got ${rows.length}`,
        )
      }
      for (const r of rows) {
        const id = (r as { id?: unknown }).id
        if (id != null) inserted.inspections.push(String(id))
      }
      inspectionsInserted += batch.length
      inspOffset += batch.length
      prog.inspections.done = inspOffset
      emitProgress()
    }

    if (import.meta.env.DEV) {
      console.log("[saveImportedDataset] inspection duplicate check", {
        existingInspectionRowsFetchedFromSupabase: inspectionDedupeRowsFetchedTotal,
        matchedAsDuplicatesSkipped: inspectionsSkippedExisting,
        savedAsNew: inspectionsInserted,
      })
    }

    return {
      ok: true,
      establishmentsInserted,
      establishmentsSkippedExisting,
      establishmentsSkippedInvalid,
      inspectionsInserted,
      inspectionsSkippedExisting,
      inspectionsSkippedInvalid,
      statusHistoryInserted,
      statusHistorySkippedExisting,
      statusHistorySkippedInvalid,
      inspectionsUnknownDateCount,
      inspectorFallbackNames: fallbackInspectorTracker.names(),
      inspectorFuzzyMatchCount,
      inspectionsWithoutReferenceCount,
      warnings,
      errors,
    }
  } catch (e) {
    if (!(e instanceof ImportSaveAbortError)) {
      await rollbackSessionOrThrow(e)
    }
    if (e instanceof ImportSaveAbortError) throw e
    throw toImportSaveAbortError(e)
  }
}
