import type { Establishment, Inspection, InspectionRating } from "@/data/rawData"

/** Canonical rating order for trend lines (matches admin ratings sort_order expectations). */
export const RATINGS_TREND_ORDER: readonly InspectionRating[] = [
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Poor",
  "Very Poor",
]

export type RatingsTrendSeries = {
  years: number[]
  /** Calendar year → rating → count of distinct establishments (latest inspection that year). */
  counts: Map<number, Map<InspectionRating, number>>
}

/**
 * For each establishment and calendar year, keep the latest dated inspection in that year and bucket by rating.
 * Semantics match a `latest_inspections`-style view (one row per establishment per calendar year: most recent inspection date in that year).
 */
export function aggregateLatestInspectionRatingsByYear(
  establishments: Establishment[],
  inspections: Inspection[],
  activeCalendarYears: readonly number[],
): RatingsTrendSeries {
  const sortedYears = [...activeCalendarYears].sort((a, b) => a - b)
  const yearSet = new Set(sortedYears)

  const counts = new Map<number, Map<InspectionRating, number>>()
  for (const y of sortedYears) {
    counts.set(y, new Map())
  }

  if (yearSet.size === 0) {
    return { years: sortedYears, counts }
  }

  const nameSet = new Set(
    establishments.map((e) => e.name.trim()).filter((n) => n !== ""),
  )
  if (nameSet.size === 0) {
    return { years: sortedYears, counts }
  }

  type Best = { t: number; rating: InspectionRating; year: number }
  const best = new Map<string, Best>()

  for (const insp of inspections) {
    const n = insp.establishmentName?.trim()
    if (!n || !nameSet.has(n)) continue
    const d = insp.inspectionDate
    if (!d || Number.isNaN(d.getTime())) continue
    const y = d.getFullYear()
    if (!yearSet.has(y)) continue

    const k = `${n}\t${y}`
    const t = d.getTime()
    const prev = best.get(k)
    if (!prev || t > prev.t) {
      best.set(k, { t, rating: insp.rating, year: y })
    }
  }

  for (const v of best.values()) {
    const m = counts.get(v.year)
    if (!m) continue
    m.set(v.rating, (m.get(v.rating) ?? 0) + 1)
  }

  return { years: sortedYears, counts }
}

export type RatingsTrendChartRows = {
  rows: Array<Record<string, string | number>>
  totalsByYear: Map<number, number>
  countByYearRating: Map<number, Map<InspectionRating, number>>
}

export function seriesToChartRows(
  series: RatingsTrendSeries,
  ratingsInOrder: readonly InspectionRating[],
  mode: "count" | "percentage",
): RatingsTrendChartRows {
  const totalsByYear = new Map<number, number>()
  const countByYearRating = new Map<number, Map<InspectionRating, number>>()

  const rows: Array<Record<string, string | number>> = []

  for (const y of series.years) {
    const src = series.counts.get(y) ?? new Map()
    const copy = new Map<InspectionRating, number>()
    let total = 0
    for (const r of ratingsInOrder) {
      const c = src.get(r) ?? 0
      copy.set(r, c)
      total += c
    }
    totalsByYear.set(y, total)
    countByYearRating.set(y, copy)

    const row: Record<string, string | number> = { year: String(y) }
    for (const r of ratingsInOrder) {
      const c = copy.get(r) ?? 0
      row[r] =
        mode === "count"
          ? c
          : total > 0
            ? Math.round((c / total) * 1000) / 10
            : 0
    }
    rows.push(row)
  }

  return { rows, totalsByYear, countByYearRating }
}

/**
 * Max Y value for percentage mode so small values aren’t compressed against a 0–100 scale.
 * Uses observed max across all years and rating series (display values, one decimal).
 */
export function percentageChartDomainMax(
  rows: ReadonlyArray<Record<string, string | number>>,
  ratingKeys: readonly InspectionRating[],
): number {
  let max = 0
  for (const row of rows) {
    for (const k of ratingKeys) {
      const v = row[k]
      if (typeof v === "number" && Number.isFinite(v) && v > max) max = v
    }
  }
  if (max <= 10) return 15
  if (max <= 25) return 30
  if (max <= 50) return 60
  if (max <= 75) return 80
  return 100
}
