import type { SupabaseClient } from "@supabase/supabase-js"

import type { Establishment, Inspection, OperationalStatus } from "@/data/rawData"
import {
  coerceOperationalStatus,
  normalizeNameKey,
  type EstablishmentStatusHistoryRow,
} from "@/features/data-import/mergePipeline"
import type {
  Phase2DataEstablishmentConflict,
  Phase2DbEstablishment,
  Phase2DbInspector,
  Phase2DbStatusHistoryRow,
  Phase2DetectionResult,
  Phase2FieldMismatch,
  Phase2InspectionEstablishmentConflict,
  Phase2InspectorFuzzyConflict,
  Phase2CaseEstablishmentConflict,
  Phase2StatusHistoryConflict,
} from "@/features/data-import/phase2ImportTypes"
import { relationObject } from "@/lib/supabase/remoteDataset"

const PAGE = 1000

/** Match `saveImportedDataset` `normKey`. */
export function estNormKey(raw: string): string {
  return normalizeNameKey(raw).toLowerCase()
}

/** Normalized key for `location` / `area` comparison (aligned with `establishmentFieldMismatches`). */
function locNormKey(raw: string): string {
  return normalizeNameKey(String(raw ?? "")).toLowerCase()
}

type Phase2FileEstablishmentLookupEntry = {
  name: string
  location: string
  area: string
  crNumber: string
}

/** One entry per sheet row; duplicate normalized names yield multiple array elements. */
function buildFileEstablishmentLookupMap(
  fileEstablishments: Establishment[],
): Map<string, Phase2FileEstablishmentLookupEntry[]> {
  const m = new Map<string, Phase2FileEstablishmentLookupEntry[]>()
  for (const e of fileEstablishments) {
    const entry: Phase2FileEstablishmentLookupEntry = {
      name: e.name,
      location: nz(e.location),
      area: nz(String(e.area ?? "")),
      crNumber: nz(e.crNumber),
    }
    const k = estNormKey(e.name)
    const arr = m.get(k)
    if (arr) arr.push(entry)
    else m.set(k, [entry])
  }
  return m
}

export function levenshtein(a: string, b: string): number {
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

function nz(v: unknown): string {
  if (v === null || v === undefined) return ""
  const s = String(v).trim()
  return s
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number" && Number.isFinite(v)) return v
  const n = Number.parseInt(String(v).trim(), 10)
  return Number.isFinite(n) ? n : null
}

function pickAreaLabel(areaRel: Record<string, unknown> | null): string {
  if (!areaRel) return ""
  const ar = nz(areaRel.name_ar ?? areaRel.nameAr)
  const en = nz(areaRel.name_en ?? areaRel.nameEn)
  return ar || en
}

/** Fetch all establishments (+ area labels) for conflict detection. */
export async function fetchPhase2Establishments(
  supabase: SupabaseClient,
): Promise<Phase2DbEstablishment[]> {
  const out: Phase2DbEstablishment[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from("establishments")
      .select(
        "id,name,cr_number,location,phone,email,person_in_charge,service_hours,notes,activity_type,task_type,name_in_ems,nb_outlets,account_status_in_ems,areas(name_ar,name_en)",
      )
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = data ?? []
    for (const row of chunk) {
      const r = row as Record<string, unknown>
      const areas = (r.areas ?? null) as Record<string, unknown> | null
      const crRaw = nz(r.cr_number ?? r.crNumber)
      const nb = numOrNull(r.nb_outlets ?? r.nbOutlets)
      out.push({
        id: String(r.id ?? ""),
        name: nz(r.name),
        crNumber: crRaw,
        trimCr: crRaw,
        location: nz(r.location),
        phone: nz(r.phone),
        email: nz(r.email),
        personInCharge: nz(r.person_in_charge ?? r.personInCharge),
        serviceHours: nz(r.service_hours ?? r.serviceHours),
        activityType: nz(r.activity_type ?? r.activityType),
        notes: nz(r.notes),
        taskType: nz(r.task_type ?? r.taskType),
        nameInEms: nz(r.name_in_ems ?? r.nameInEms),
        nbOutlets: nb,
        accountStatusInEms: nz(r.account_status_in_ems ?? r.accountStatusInEms),
        areaLabelPrimary: pickAreaLabel(areas),
      })
    }
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return out
}

export async function fetchPhase2Inspectors(
  supabase: SupabaseClient,
): Promise<Phase2DbInspector[]> {
  const { data, error } = await supabase
    .from("inspectors")
    .select("id, name_ar, name_en, is_active")

  if (error) throw new Error(error.message)
  const out: Phase2DbInspector[] = []
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>
    if (r.is_active === false) continue
    const en = nz(r.name_en ?? r.nameEn)
    const ar = nz(r.name_ar ?? r.nameAr)
    const labels = [en, ar].filter(Boolean)
    const displayName = en || ar || "—"
    out.push({
      id: String(r.id ?? ""),
      labels,
      displayName,
    })
  }
  return out
}

export async function fetchPhase2StatusHistory(
  supabase: SupabaseClient,
  establishmentIds: string[],
): Promise<Phase2DbStatusHistoryRow[]> {
  const unique = [...new Set(establishmentIds)].filter(Boolean)
  const out: Phase2DbStatusHistoryRow[] = []
  for (let i = 0; i < unique.length; i += PAGE) {
    const batch = unique.slice(i, i + PAGE)
    const { data, error } = await supabase
      .from("establishment_status_history")
      .select(
        "establishment_id, years(year), operational_statuses(name_ar, name_en)",
      )
      .in("establishment_id", batch)
    if (error) throw new Error(error.message)

    for (const row of data ?? []) {
      const r = row as Record<string, unknown>
      const estId = String(r.establishment_id ?? "")
      if (!estId) continue
      const yearsRel = relationObject(r.years)
      const yrRaw = yearsRel?.year
      let yr: number | null =
        typeof yrRaw === "number" && Number.isFinite(yrRaw)
          ? yrRaw
          : null
      if (yr === null && yrRaw != null && yrRaw !== "") {
        const n = Number.parseInt(String(yrRaw).trim(), 10)
        if (Number.isFinite(n)) yr = n
      }
      if (yr === null) continue
      const st = relationObject(r.operational_statuses)
      const merged =
        coerceOperationalStatus(st?.name_en ?? st?.nameEn) ??
        coerceOperationalStatus(st?.name_ar ?? st?.nameAr)
      if (!merged) continue
      out.push({
        establishmentId: estId,
        calendarYear: yr,
        operationalStatus: merged,
      })
    }
  }
  return out
}

function fileEffectiveCrRaw(est: Establishment): string {
  return String(est.crNumber ?? "").trim() || String(est.id)
}

function dbEffectiveCrRaw(db: Phase2DbEstablishment): string {
  return nz(db.crNumber || db.trimCr)
}

/** Map norm(effective CR) → DB establishments sharing that CR (locations may differ). */
function dbByCr(dbRows: Phase2DbEstablishment[]): Map<string, Phase2DbEstablishment[]> {
  const m = new Map<string, Phase2DbEstablishment[]>()
  for (const row of dbRows) {
    const nk = estNormKey(dbEffectiveCrRaw(row))
    if (!nk) continue
    const b = m.get(nk)
    if (b) b.push(row)
    else m.set(nk, [row])
  }
  return m
}

/** Map norm(name) → first DB establishment (name-only index). */
function dbByNameNorm(dbRows: Phase2DbEstablishment[]): Map<string, Phase2DbEstablishment[]> {
  const m = new Map<string, Phase2DbEstablishment[]>()
  for (const row of dbRows) {
    const nk = estNormKey(row.name)
    if (!nk) continue
    const b = m.get(nk)
    if (b) b.push(row)
    else m.set(nk, [row])
  }
  return m
}

function areaMatchesFile(fileArea: string, dbPrimary: string): boolean {
  const fa = normalizeNameKey(String(fileArea ?? "")).toLowerCase()
  const d1 = normalizeNameKey(dbPrimary).toLowerCase()
  return fa === d1
}

/** Same identity as import save composite key: name + area + location + effective CR. */
function establishmentIdentityMatch(est: Establishment, db: Phase2DbEstablishment): boolean {
  if (estNormKey(est.name) !== estNormKey(db.name)) return false
  if (!areaMatchesFile(String(est.area ?? ""), db.areaLabelPrimary)) return false
  if (locNormKey(est.location) !== locNormKey(db.location)) return false
  return estNormKey(fileEffectiveCrRaw(est)) === estNormKey(dbEffectiveCrRaw(db))
}

/**
 * When several DB rows share the same normalized establishment name, pick the one whose
 * `location` (and on tie, `area`) best matches the file row.
 */
function pickDbEstablishmentByLocation(
  fileEst: Establishment,
  candidates: Phase2DbEstablishment[],
): Phase2DbEstablishment {
  if (candidates.length === 1) return candidates[0]!
  const fileLoc = nz(fileEst.location)
  const fileLocNorm = locNormKey(fileEst.location)

  if (!fileLoc) {
    return candidates[0]!
  }

  const exact = candidates.filter(
    (c) => nz(c.location).toLowerCase() === fileLoc.toLowerCase(),
  )
  if (exact.length === 1) return exact[0]!
  if (exact.length > 1) {
    return pickByLocationDistanceThenArea(fileEst, exact)
  }

  if (fileLocNorm) {
    const normHits = candidates.filter((c) => locNormKey(c.location) === fileLocNorm)
    if (normHits.length === 1) return normHits[0]!
    if (normHits.length > 1) {
      return pickByLocationDistanceThenArea(fileEst, normHits)
    }
  }

  return pickByLocationDistanceThenArea(fileEst, candidates)
}

function pickByLocationDistanceThenArea(
  fileEst: Establishment,
  pool: Phase2DbEstablishment[],
): Phase2DbEstablishment {
  const fileLoc = nz(fileEst.location)
  let best = pool[0]!
  let bestD = levenshtein(fileLoc, nz(best.location))
  for (let i = 1; i < pool.length; i++) {
    const c = pool[i]!
    const d = levenshtein(fileLoc, nz(c.location))
    if (d < bestD) {
      best = c
      bestD = d
      continue
    }
    if (d > bestD) continue
    const cArea = areaMatchesFile(String(fileEst.area ?? ""), c.areaLabelPrimary)
    const bestArea = areaMatchesFile(String(fileEst.area ?? ""), best.areaLabelPrimary)
    if (cArea && !bestArea) {
      best = c
      bestD = d
    } else if (cArea === bestArea && c.id.localeCompare(best.id) < 0) {
      best = c
    }
  }
  return best
}

function resolveDbEstablishmentForFile(
  est: Establishment,
  byCr: Map<string, Phase2DbEstablishment[]>,
  byName: Map<string, Phase2DbEstablishment[]>,
): Phase2DbEstablishment | undefined {
  const crNk = estNormKey(fileEffectiveCrRaw(est))
  if (crNk) {
    for (const db of byCr.get(crNk) ?? []) {
      if (establishmentIdentityMatch(est, db)) return db
    }
  }
  const nk = estNormKey(est.name)
  const list = byName.get(nk)
  if (!list?.length) return undefined
  const fullMatches = list.filter((db) => establishmentIdentityMatch(est, db))
  if (fullMatches.length === 1) return fullMatches[0]
  if (fullMatches.length > 1) return pickDbEstablishmentByLocation(est, fullMatches)
  return pickDbEstablishmentByLocation(est, list)
}

/** Same rule as `establishmentFieldMismatches` (`synthCr`). */
function hasReliableCommercialRegistration(e: Establishment): boolean {
  const cr = nz(e.crNumber)
  if (!cr) return false
  return nz(e.crNumber) !== nz(e.id)
}

/**
 * Maps a status-history row (name only) to the file establishment row it most likely
 * refers to, then resolves the DB establishment. Avoids a single norm-key → id map
 * when multiple file establishments share a normalized name.
 */
function sheetIndexForFileEstablishment(
  fileByNormName: Map<string, Phase2FileEstablishmentLookupEntry[]>,
  normH: string,
  e: Establishment,
): number {
  const rows = fileByNormName.get(normH)
  if (!rows?.length) return 0
  const i = rows.findIndex(
    (r) =>
      r.name === e.name &&
      r.location === nz(e.location) &&
      r.area === nz(String(e.area ?? "")),
  )
  return i === -1 ? 9999 : i
}

/**
 * Maps a status-history row (name only) to the file establishment row it most likely
 * refers to, then resolves the DB establishment. Avoids a single norm-key → id map
 * when multiple file establishments share a normalized name.
 */
function resolveDbEstablishmentForStatusHistoryRow(
  h: EstablishmentStatusHistoryRow,
  fileEstablishments: Establishment[],
  fileByNormName: Map<string, Phase2FileEstablishmentLookupEntry[]>,
  byCr: Map<string, Phase2DbEstablishment[]>,
  byName: Map<string, Phase2DbEstablishment[]>,
): {
  db: Phase2DbEstablishment | undefined
  candidatesDebug: Array<{
    name: string
    cr: string
    resolvedId: string | undefined
    levenshtein: number
    hasReliableCr: boolean
    exactName: boolean
  }>
} {
  const trimmedH = h.establishmentName.trim()
  const normH = estNormKey(h.establishmentName)

  const exactMatches = fileEstablishments.filter(
    (e) => e.name.trim().toLowerCase() === trimmedH.toLowerCase(),
  )
  const normMatches = fileEstablishments.filter((e) => estNormKey(e.name) === normH)

  const pool = exactMatches.length > 0 ? exactMatches : normMatches

  const buildDebug = (e: Establishment) => {
    const rdb = resolveDbEstablishmentForFile(e, byCr, byName)
    return {
      name: e.name,
      cr: nz(e.crNumber),
      resolvedId: rdb?.id,
      levenshtein: levenshtein(e.name.trim(), trimmedH),
      hasReliableCr: hasReliableCommercialRegistration(e),
      exactName: e.name.trim().toLowerCase() === trimmedH.toLowerCase(),
    }
  }

  if (pool.length === 0) {
    return { db: undefined, candidatesDebug: [] }
  }

  const sorted = [...pool].sort((a, b) => {
    const acr = hasReliableCommercialRegistration(a) ? 0 : 1
    const bcr = hasReliableCommercialRegistration(b) ? 0 : 1
    if (acr !== bcr) return acr - bcr
    const ae = a.name.trim().toLowerCase() === trimmedH.toLowerCase() ? 0 : 1
    const be = b.name.trim().toLowerCase() === trimmedH.toLowerCase() ? 0 : 1
    if (ae !== be) return ae - be
    const ld =
      levenshtein(a.name.trim(), trimmedH) - levenshtein(b.name.trim(), trimmedH)
    if (ld !== 0) return ld
    const ca = levenshtein(
      trimmedH,
      `${a.name.trim()} ${nz(a.location)}`.trim(),
    )
    const cb = levenshtein(
      trimmedH,
      `${b.name.trim()} ${nz(b.location)}`.trim(),
    )
    if (ca !== cb) return ca - cb
    const ia = sheetIndexForFileEstablishment(fileByNormName, normH, a)
    const ib = sheetIndexForFileEstablishment(fileByNormName, normH, b)
    if (ia !== ib) return ia - ib
    return a.name.localeCompare(b.name)
  })

  const picked = sorted[0]!
  const db = resolveDbEstablishmentForFile(picked, byCr, byName)
  return { db, candidatesDebug: pool.map(buildDebug) }
}

export function establishmentFieldMismatches(
  fileEst: Establishment,
  db: Phase2DbEstablishment,
): Phase2FieldMismatch[] {
  const m: Phase2FieldMismatch[] = []
  if (!areaMatchesFile(String(fileEst.area), db.areaLabelPrimary)) {
    m.push({
      fieldKey: "area",
      fileValue: String(fileEst.area ?? ""),
      dbValue: db.areaLabelPrimary || "—",
    })
  }
  const locF = normalizeNameKey(String(fileEst.location ?? "")).toLowerCase()
  const locD = normalizeNameKey(db.location).toLowerCase()
  if (locF !== locD) {
    m.push({ fieldKey: "location", fileValue: fileEst.location, dbValue: db.location || "—" })
  }
  const synthCr =
    !nz(fileEst.crNumber) || nz(fileEst.crNumber) === nz(fileEst.id)
  const pairs: [Phase2FieldMismatch["fieldKey"], string, string][] = [
    ["phone", nz(fileEst.phone), db.phone],
    ["email", nz(fileEst.email), db.email],
    ["personInCharge", nz(fileEst.personInCharge), db.personInCharge],
    ["serviceHours", nz(fileEst.serviceHours), db.serviceHours],
    ["activityType", nz(fileEst.activityType), db.activityType],
    ["notes", nz(fileEst.establishmentNote), db.notes],
    ["taskType", nz(fileEst.taskType), db.taskType],
    ["nameInEms", nz(fileEst.nameInEms), db.nameInEms],
    ["accountStatusEms", nz(fileEst.accountStatusInEms), db.accountStatusInEms],
    ...(synthCr
      ? ([] as [Phase2FieldMismatch["fieldKey"], string, string][])
      : ([
          ["crNumber", nz(fileEst.crNumber), db.crNumber],
        ] as [Phase2FieldMismatch["fieldKey"], string, string][])),
  ]
  for (const [k, f, d] of pairs) {
    if (normalizeNameKey(f).toLowerCase() !== normalizeNameKey(d).toLowerCase()) {
      m.push({ fieldKey: k, fileValue: f || "—", dbValue: d || "—" })
    }
  }
  const fnb = fileEst.nbOutlets
  const dnb = db.nbOutlets
  if ((fnb ?? null) !== (dnb ?? null)) {
    m.push({
      fieldKey: "nbOutlets",
      fileValue: fnb == null ? "—" : String(fnb),
      dbValue: dnb == null ? "—" : String(dnb),
    })
  }
  return m
}

function statusMapFromDb(rows: Phase2DbStatusHistoryRow[]): Map<string, OperationalStatus> {
  const m = new Map<string, OperationalStatus>()
  for (const r of rows) {
    m.set(`${r.establishmentId}|${r.calendarYear}`, r.operationalStatus)
  }
  return m
}

function findBestFuzzyEstablishment(
  inspectionName: string,
  fileEstablishments: Establishment[],
): { est: Establishment; dist: number } | null {
  const ink = normalizeNameKey(inspectionName).toLowerCase()
  if (!ink) return null
  let best: { est: Establishment; dist: number; distCombined: number } | null = null
  for (const e of fileEstablishments) {
    const nk = normalizeNameKey(e.name).toLowerCase()
    if (!nk) continue
    const d = levenshtein(ink, nk)
    if (d === 0) continue
    if (d > 3) continue
    const combinedStr = `${e.name} ${nz(e.location)}`.trim()
    const distCombined = levenshtein(
      inspectionName.trim().toLowerCase(),
      combinedStr.toLowerCase(),
    )
    if (
      !best ||
      d < best.dist ||
      (d === best.dist && distCombined < best.distCombined) ||
      (d === best.dist &&
        distCombined === best.distCombined &&
        e.name < best.est.name)
    ) {
      best = { est: e, dist: d, distCombined }
    }
  }
  return best
}

function inspectionEstablishmentMergeKey(est: Establishment): string {
  return `${estNormKey(est.name)}|${locNormKey(est.location)}`
}

/**
 * Load remote rows + detect conflicts 1–5 (inspectors unknown is fatal).
 */
export async function loadPhase2SnapshotAndDetect(opts: {
  supabase: SupabaseClient
  fileEstablishments: Establishment[]
  fileStatusHistory: EstablishmentStatusHistoryRow[]
  inspections: Inspection[]
}): Promise<Phase2DetectionResult> {
  const { supabase, fileEstablishments, fileStatusHistory, inspections } = opts

  const [dbEstablishments, dbInspectors] = await Promise.all([
    fetchPhase2Establishments(supabase),
    fetchPhase2Inspectors(supabase),
  ])

  const byCr = dbByCr(dbEstablishments)
  const byName = dbByNameNorm(dbEstablishments)

  const fileEstablishmentByNormName = buildFileEstablishmentLookupMap(fileEstablishments)

  const referencedDbIds = new Set<string>()
  for (const e of fileEstablishments) {
    const db = resolveDbEstablishmentForFile(e, byCr, byName)
    if (db) referencedDbIds.add(db.id)
  }

  const statusRows = await fetchPhase2StatusHistory(supabase, [...referencedDbIds])
  const stMap = statusMapFromDb(statusRows)

  const establishmentCaseConflicts: Phase2CaseEstablishmentConflict[] = []
  const establishmentDataConflicts: Phase2DataEstablishmentConflict[] = []

  for (const e of fileEstablishments) {
    const db = resolveDbEstablishmentForFile(e, byCr, byName)
    if (!db) continue
    const mismatches = establishmentFieldMismatches(e, db)
    const caseDiffOnly =
      e.name.trim() !== db.name.trim() && mismatches.length === 0 && estNormKey(e.name) === estNormKey(db.name)
    const hasDataDiff =
      mismatches.length > 0 ||
      (e.name.trim() === db.name.trim() && mismatches.length > 0) ||
      (e.name.trim() !== db.name.trim() && mismatches.length > 0)

    if (caseDiffOnly) {
      establishmentCaseConflicts.push({
        normKey: estNormKey(e.name),
        fileDisplayName: e.name.trim(),
        dbDisplayName: db.name.trim(),
        dbEstablishmentId: db.id,
      })
      continue
    }
    if (hasDataDiff) {
      establishmentDataConflicts.push({
        normKey: estNormKey(e.name),
        establishmentName: e.name.trim(),
        dbEstablishmentId: db.id,
        mismatches,
      })
    }
  }

  const statusHistoryConflicts: Phase2StatusHistoryConflict[] = []
  for (const h of fileStatusHistory) {
    const { db: resolvedDb, candidatesDebug } = resolveDbEstablishmentForStatusHistoryRow(
      h,
      fileEstablishments,
      fileEstablishmentByNormName,
      byCr,
      byName,
    )
    const dbId = resolvedDb?.id
    const existing = dbId !== undefined ? stMap.get(`${dbId}|${h.year}`) : undefined

    if (import.meta.env.DEV) {
      const conflict =
        dbId !== undefined && existing !== undefined && existing !== h.operationalStatus
      /* eslint-disable no-console -- dev-only Phase 2 status row resolution trace */
      console.log(`[phase2 status history] Resolving: ${h.establishmentName.trim()}`)
      console.log("[phase2 status history] Candidates found:", candidatesDebug)
      console.log("[phase2 status history] Selected ID:", dbId ?? "—")
      console.log("[phase2 status history] DB status:", existing ?? "—")
      console.log("[phase2 status history] File status:", h.operationalStatus)
      console.log("[phase2 status history] Conflict:", conflict)
      /* eslint-enable no-console */
    }

    if (!dbId) continue
    if (existing === undefined) continue
    if (existing !== h.operationalStatus) {
      statusHistoryConflicts.push({
        establishmentNameNormKey: estNormKey(h.establishmentName),
        establishmentName: h.establishmentName.trim(),
        calendarYear: h.year,
        dbEstablishmentId: dbId,
        dbStatus: existing,
        fileStatus: h.operationalStatus,
      })
    }
  }

  const inspectorNkToExcelRows = new Map<string, number[]>()
  const inspectorNkToOriginal = new Map<string, string>()
  for (const raw of inspections) {
    const t = String(raw.inspector ?? "").trim()
    if (!t || t === "—" || t === "-") continue
    const nk = normalizeNameKey(t).toLowerCase()
    if (raw.importRowOrdinal == null) continue
    const excelRow = raw.importRowOrdinal + 2
    const pr = inspectorNkToExcelRows.get(nk)
    if (pr) {
      pr.push(excelRow)
    } else {
      inspectorNkToExcelRows.set(nk, [excelRow])
    }
    if (!inspectorNkToOriginal.has(nk)) inspectorNkToOriginal.set(nk, t)
  }

  const inspectorLabelKeys: { nk: string; label: string; dist: number; insp: Phase2DbInspector }[] =
    []

  const unknownInspectorsAgg = new Map<string, number[]>()

  for (const nk of inspectorNkToExcelRows.keys()) {
    let bestExact: Phase2DbInspector | null = null
    for (const insp of dbInspectors) {
      for (const lb of insp.labels) {
        if (!lb) continue
        if (normalizeNameKey(lb).toLowerCase() === nk) {
          bestExact = insp
          break
        }
      }
      if (bestExact) break
    }
    if (bestExact) continue

    let bestF: { insp: Phase2DbInspector; dist: number } | null = null
    for (const insp of dbInspectors) {
      for (const lb of insp.labels) {
        const key = normalizeNameKey(lb).toLowerCase()
        if (!key) continue
        const d = levenshtein(nk, key)
        if (d === 0) {
          bestF = { insp, dist: 0 }
          break
        }
        if (d >= 1 && d <= 3) {
          if (!bestF || d < bestF.dist) bestF = { insp, dist: d }
        }
      }
      if (bestF?.dist === 0) break
    }

    if (!bestF) {
      unknownInspectorsAgg.set(inspectorNkToOriginal.get(nk) ?? nk, [
        ...new Set(inspectorNkToExcelRows.get(nk) ?? []),
      ].sort((a, b) => a - b))
      continue
    }
    inspectorLabelKeys.push({
      nk,
      label: inspectorNkToOriginal.get(nk) ?? nk,
      dist: bestF.dist,
      insp: bestF.insp,
    })
  }

  let unknownInspectors: Phase2DetectionResult["unknownInspectors"] = null
  if (unknownInspectorsAgg.size > 0) {
    unknownInspectors = {
      items: [...unknownInspectorsAgg.entries()].map(([inspectorName, rows]) => ({
        inspectorName,
        rows,
      })),
    }
  }

  const inspectorSeen = new Set<string>()
  const inspectorFuzzyConflicts: Phase2InspectorFuzzyConflict[] = []
  for (const item of inspectorLabelKeys) {
    if (item.dist === 0) continue
    if (inspectorSeen.has(item.nk)) continue
    inspectorSeen.add(item.nk)
    const rows = [...new Set(inspectorNkToExcelRows.get(item.nk) ?? [])].sort((a, b) => a - b)
    inspectorFuzzyConflicts.push({
      key: item.nk,
      fileLabels: [item.label],
      inspectionExcelRows: rows,
      dbInspectorId: item.insp.id,
      canonicalInspectorName: item.insp.displayName,
    })
  }

  /** Merge inspection-sheet name variants into one conflict per fuzzy target. */
  const fileNkSet = new Set(fileEstablishments.map((e) => estNormKey(e.name)))
  const inspectionEstablishmentConflicts: Phase2InspectionEstablishmentConflict[] = []
  const inspEstMerge = new Map<
    string,
    { excelRows: number[]; suggested: Establishment; displayNames: string[] }
  >()

  for (const row of inspections) {
    const rawName = row.establishmentName.trim()
    if (!rawName) continue
    const ink = estNormKey(rawName)
    if (fileNkSet.has(ink)) continue
    const fuzz = findBestFuzzyEstablishment(rawName, fileEstablishments)
    if (!fuzz) continue
    const estKey = inspectionEstablishmentMergeKey(fuzz.est)
    const excelRow =
      row.importRowOrdinal != null ? row.importRowOrdinal + 2 : null
    const prev = inspEstMerge.get(estKey)
    if (prev) {
      prev.displayNames.push(rawName)
      if (excelRow != null && !prev.excelRows.includes(excelRow)) prev.excelRows.push(excelRow)
      prev.displayNames.sort()
      prev.excelRows.sort((a, b) => a - b)
    } else {
      inspEstMerge.set(estKey, {
        excelRows: excelRow != null ? [excelRow] : [],
        suggested: fuzz.est,
        displayNames: [rawName],
      })
    }
  }

  for (const [, v] of inspEstMerge.entries()) {
    const uniqueNames = [...new Set(v.displayNames)]
    const sorted = uniqueNames.sort((a, b) => a.localeCompare(b))
    const variantKeys = sorted.map((n) => normalizeNameKey(n).toLowerCase()).filter(Boolean)
    inspectionEstablishmentConflicts.push({
      inspectionNameVariantsNormKeys: variantKeys,
      inspectionExcelRows: v.excelRows,
      inspectionsSheetDisplayName: sorted.join(" / "),
      suggestedEstablishment: v.suggested,
    })
  }

  inspectionEstablishmentConflicts.sort((a, b) => {
    const r0 =
      (a.inspectionExcelRows[0] ?? 0) - (b.inspectionExcelRows[0] ?? 0)
    return r0 !== 0
      ? r0
      : a.inspectionsSheetDisplayName.localeCompare(b.inspectionsSheetDisplayName)
  })

  return {
    unknownInspectors,
    establishmentCaseConflicts,
    establishmentDataConflicts,
    statusHistoryConflicts,
    inspectorFuzzyConflicts,
    inspectionEstablishmentConflicts,
  }
}
