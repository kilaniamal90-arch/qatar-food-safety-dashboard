import { useCallback, useEffect, useState } from "react"

import type { ManagedStatus } from "@/admin/types"
import { supabase } from "@/lib/supabase"

export function useStatuses() {
  const [data, setData] = useState<ManagedStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: rows, error: err } = await supabase
      .from("operational_statuses")
      .select("id, name_ar, name_en, sort_order")
      .order("sort_order", { ascending: true })

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => {
          const row = r as {
            id: unknown
            name_ar?: string | null
            name_en?: string | null
            sort_order?: number | null
          }
          return {
            id: String(row.id),
            nameAr: String(row.name_ar ?? ""),
            nameEn: String(row.name_en ?? ""),
            order: typeof row.sort_order === "number" ? row.sort_order : 0,
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
