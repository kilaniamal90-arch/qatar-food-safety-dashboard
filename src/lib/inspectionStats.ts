import type {
  Establishment,
  Inspection,
  InspectionRating,
} from "@/data/mockBuilder"

export function filterEstablishments(
  list: Establishment[],
  filters: { area: string; activityType: string },
): Establishment[] {
  return list.filter((e) => {
    if (filters.area !== "all" && e.area !== filters.area) return false
    if (filters.activityType !== "all" && e.activityType !== filters.activityType)
      return false
    return true
  })
}

export function filterInspections(
  inspections: Inspection[],
  est: Establishment[],
  filters: {
    area: string
    activityType: string
    rating: InspectionRating | "all"
  },
): Inspection[] {
  const allowed = new Set(
    filterEstablishments(est, {
      area: filters.area,
      activityType: filters.activityType,
    }).map((e) => e.name),
  )

  return inspections.filter((row) => {
    if (!allowed.has(row.establishmentName)) return false
    if (filters.rating !== "all" && row.rating !== filters.rating) return false
    return true
  })
}

export function countRatings(rows: Inspection[]) {
  const order: InspectionRating[] = [
    "Poor",
    "Fair",
    "Good",
    "Very Good",
    "Excellent",
  ]
  const map = new Map<InspectionRating, number>()
  for (const r of order) map.set(r, 0)
  for (const row of rows) {
    map.set(row.rating, (map.get(row.rating) ?? 0) + 1)
  }
  return order.map((rating) => ({ rating, count: map.get(rating) ?? 0 }))
}

export function goodOrBetterShare(rows: Inspection[]) {
  if (rows.length === 0) return 0
  const good = rows.filter((r) =>
    ["Excellent", "Very Good", "Good"].includes(r.rating),
  ).length
  return Math.round((good / rows.length) * 100)
}
