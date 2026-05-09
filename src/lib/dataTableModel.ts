import type {
  Establishment,
  Inspection,
  InspectionRating,
  OperationalStatus,
} from "@/data/rawData"

import { formatInspectionDateDdMmYyyy } from "@/data/establishmentsTable"

export type DataTableSortMode =
  | "name_az"
  | "name_za"
  | "insp_new"
  | "insp_old"
  | "days_recent"
  | "days_stale"
  | "rating_best"
  | "rating_worst"
  | "count_most"
  | "count_least"

const RATING_SCORE: Record<InspectionRating, number> = {
  Excellent: 6,
  "Very Good": 5,
  Good: 4,
  Fair: 3,
  Poor: 2,
  "Very Poor": 1,
}

export type EnrichedEstablishmentRow = {
  establishment: Establishment
  lastInspectionDate: Date | null
  lastInspectionFormatted: string
  /** Calendar days since last inspection (start-of-day); null if unknown. */
  daysAgo: number | null
  inspectionCount: number
  latestRating: InspectionRating | null
  /** From Supabase `areas.name_en` / `area_name_en` (for English PDF, etc.). */
  areaNameEn?: string | null
  /** From Supabase `ratings.name_ar` when resolved (for Arabic UI / exports). */
  latestRatingNameAr?: string | null
  /** From Supabase `ratings.name_en` when resolved (for English UI / exports). */
  latestRatingNameEn?: string | null
}

function inspectionTime(i: Inspection): number {
  return i.inspectionDate?.getTime() ?? Number.NEGATIVE_INFINITY
}

/** Whole days from inspection date to today (local midnights). */
export function computeDaysAgo(lastInspectionDate: Date | null): number | null {
  if (!lastInspectionDate || Number.isNaN(lastInspectionDate.getTime())) {
    return null
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(lastInspectionDate)
  d.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export function enrichEstablishments(
  establishments: Establishment[],
  inspections: Inspection[],
  dateUnknownLabel = "—",
): EnrichedEstablishmentRow[] {
  const byName = new Map<string, Inspection[]>()
  for (const i of inspections) {
    const list = byName.get(i.establishmentName) ?? []
    list.push(i)
    byName.set(i.establishmentName, list)
  }

  return establishments.map((establishment) => {
    const rows = byName.get(establishment.name) ?? []
    const sorted = [...rows].sort((a, b) => inspectionTime(b) - inspectionTime(a))
    const latest = sorted[0]
    const lastDate =
      latest?.inspectionDate &&
      !Number.isNaN(latest.inspectionDate.getTime())
        ? latest.inspectionDate
        : null
    const latestRating = rows.length === 0 ? null : latest!.rating
    const daysAgo = computeDaysAgo(lastDate)

    return {
      establishment,
      lastInspectionDate: lastDate,
      lastInspectionFormatted: formatInspectionDateDdMmYyyy(lastDate, dateUnknownLabel),
      daysAgo,
      inspectionCount: rows.length,
      latestRating,
    }
  })
}

/** `YYYY-MM-DD` from `<input type="date" />`; compares last inspection using local calendar days. */
export function filterByLastInspectionDateRange(
  rows: EnrichedEstablishmentRow[],
  fromYmd: string | null | undefined,
  toYmd: string | null | undefined,
): EnrichedEstablishmentRow[] {
  const from = String(fromYmd ?? "").trim()
  const to = String(toYmd ?? "").trim()
  if (!from && !to) return rows

  const ymdToLocalStart = (ymd: string): number => {
    const parts = ymd.split("-").map((x) => Number.parseInt(x, 10))
    const y = parts[0] ?? 0
    const mo = parts[1] ?? 1
    const d = parts[2] ?? 1
    return new Date(y, mo - 1, d).getTime()
  }

  const fromStart = from ? ymdToLocalStart(from) : null
  const toStart = to ? ymdToLocalStart(to) : null

  return rows.filter((r) => {
    const ld = r.lastInspectionDate
    if (!ld || Number.isNaN(ld.getTime())) return false
    const dayStart = new Date(
      ld.getFullYear(),
      ld.getMonth(),
      ld.getDate(),
    ).getTime()
    if (fromStart != null && dayStart < fromStart) return false
    if (toStart != null && dayStart > toStart) return false
    return true
  })
}

export function sortEnrichedRows(
  rows: EnrichedEstablishmentRow[],
  mode: DataTableSortMode,
): EnrichedEstablishmentRow[] {
  const out = [...rows]
  const ratingVal = (r: InspectionRating | null) =>
    r ? RATING_SCORE[r] : -1
  const nameCmp = (a: EnrichedEstablishmentRow, b: EnrichedEstablishmentRow) =>
    a.establishment.name.localeCompare(b.establishment.name, "ar", {
      sensitivity: "base",
    })
  const time = (d: Date | null) =>
    d && !Number.isNaN(d.getTime()) ? d.getTime() : Number.NEGATIVE_INFINITY

  switch (mode) {
    case "name_az":
      out.sort(nameCmp)
      break
    case "name_za":
      out.sort((a, b) => nameCmp(b, a))
      break
    case "insp_new":
      out.sort(
        (a, b) => time(b.lastInspectionDate) - time(a.lastInspectionDate),
      )
      break
    case "insp_old":
      out.sort(
        (a, b) => time(a.lastInspectionDate) - time(b.lastInspectionDate),
      )
      break
    case "days_recent": {
      out.sort((a, b) => {
        const na = a.daysAgo
        const nb = b.daysAgo
        if (na == null && nb == null) return 0
        if (na == null) return 1
        if (nb == null) return -1
        return na - nb
      })
      break
    }
    case "days_stale": {
      out.sort((a, b) => {
        const na = a.daysAgo
        const nb = b.daysAgo
        if (na == null && nb == null) return 0
        if (na == null) return 1
        if (nb == null) return -1
        return nb - na
      })
      break
    }
    case "rating_best":
      out.sort((a, b) => ratingVal(b.latestRating) - ratingVal(a.latestRating))
      break
    case "rating_worst":
      out.sort((a, b) => ratingVal(a.latestRating) - ratingVal(b.latestRating))
      break
    case "count_most":
      out.sort((a, b) => b.inspectionCount - a.inspectionCount)
      break
    case "count_least":
      out.sort((a, b) => a.inspectionCount - b.inspectionCount)
      break
  }
  return out
}

export function countByStatus(
  establishments: Establishment[],
  status: OperationalStatus,
): number {
  return establishments.filter((e) => e.operationalStatus === status).length
}
