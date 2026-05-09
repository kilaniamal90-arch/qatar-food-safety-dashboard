import { useCallback, useEffect, useState } from "react"

import type { Inspector } from "@/admin/types"
import { supabase } from "@/lib/supabase"

export function useInspectors() {
  const [data, setData] = useState<Inspector[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: rows, error: err } = await supabase
      .from("inspectors")
      .select("id, name_ar, name_en, is_active")
      .order("name_ar", { ascending: true })

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
            is_active?: boolean | null
          }
          const ar = String(row.name_ar ?? "").trim()
          const en = String(row.name_en ?? "").trim()
          const label = ar && en ? `${ar} (${en})` : ar || en || "—"
          return {
            id: String(row.id),
            nameAr: ar,
            nameEn: en,
            name: label,
            isActive: row.is_active !== false,
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
