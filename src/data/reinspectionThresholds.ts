import { coerceRating } from "@/features/data-import/mergePipeline"
import type { InspectionRating } from "@/data/rawData"

export type RatingLookupRow = { id: string; nameAr: string; nameEn: string }

export type ReinspectionPeriodRow = { rating_id: string; days: number | null }

/** Maps canonical inspection rating → allowed days until re-inspection (from `reinspection_periods`). */
export function buildReinspectionDaysByInspectionRating(
  ratings: RatingLookupRow[],
  periodRows: readonly ReinspectionPeriodRow[],
): Map<InspectionRating, number> {
  const byRatingId = new Map<string, number>()
  for (const p of periodRows) {
    const id = String(p.rating_id)
    const n = typeof p.days === "number" ? p.days : Number.NaN
    if (!Number.isFinite(n) || n <= 0) continue
    byRatingId.set(id, n)
  }

  const out = new Map<InspectionRating, number>()
  for (const r of ratings) {
    const canonical = coerceRating(r.nameEn) ?? coerceRating(r.nameAr)
    if (!canonical) continue
    const d = byRatingId.get(String(r.id))
    if (typeof d === "number" && d > 0) out.set(canonical, d)
  }
  return out
}
