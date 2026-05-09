import { useCallback, useEffect, useState } from "react"

import type { ManagedRating } from "@/admin/types"
import { supabase } from "@/lib/supabase"

export function useRatings() {
  const [data, setData] = useState<ManagedRating[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: rows, error: err }, periodsRes] = await Promise.all([
      supabase
        .from("ratings")
        .select("id, name_ar, name_en, color, sort_order")
        .order("sort_order", { ascending: true }),
      supabase.from("reinspection_periods").select("rating_id, days"),
    ])

    const periodRows = periodsRes.data as
      | { rating_id?: string | null; days?: number | null }[]
      | null
      | undefined
    const periodsByRatingId = new Map<string, number>()
    for (const p of periodRows ?? []) {
      const rid =
        p.rating_id != null && String(p.rating_id) !== ""
          ? String(p.rating_id)
          : null
      if (!rid || typeof p.days !== "number" || !Number.isFinite(p.days)) continue
      periodsByRatingId.set(rid, p.days)
    }

    const periodErrMsg = periodsRes.error?.message

    if (err) {
      setError(err.message)
      setData([])
    } else if (periodErrMsg) {
      setError(periodErrMsg)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => {
          const row = r as {
            id: unknown
            name_ar?: string | null
            name_en?: string | null
            color?: string | null
            sort_order?: number | null
          }
          const id = String(row.id)
          return {
            id,
            nameAr: String(row.name_ar ?? ""),
            nameEn: String(row.name_en ?? ""),
            color: String(row.color ?? "#64748b"),
            order: typeof row.sort_order === "number" ? row.sort_order : 0,
            reinspectionDays: periodsByRatingId.get(id) ?? null,
          }
        }),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, error, refetch: load }
}
