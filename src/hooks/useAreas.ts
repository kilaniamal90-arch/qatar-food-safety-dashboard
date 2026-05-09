import { useCallback, useEffect, useState } from "react"

import type { ManagedArea } from "@/admin/types"
import { supabase } from "@/lib/supabase"

export function useAreas() {
  const [data, setData] = useState<ManagedArea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: rows, error: err } = await supabase
      .from("areas")
      .select("id, name_ar, name_en")
      .order("name_ar", { ascending: true })

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => {
          const row = r as { id: unknown; name_ar?: string | null; name_en?: string | null }
          return {
            id: String(row.id),
            nameAr: String(row.name_ar ?? ""),
            nameEn: String(row.name_en ?? ""),
          }
        }),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  const refetch = useCallback(() => setReloadToken((n) => n + 1), [])

  return { data, loading, error, refetch }
}
