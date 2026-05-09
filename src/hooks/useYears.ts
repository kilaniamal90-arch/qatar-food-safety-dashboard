import { useCallback, useEffect, useState } from "react"

import type { ManagedYear } from "@/admin/types"
import { supabase } from "@/lib/supabase"

/** Window event: dispatch after admin changes which years are active so dashboards refetch. */
export const ACTIVE_YEARS_CHANGED_EVENT = "qfs:active-years-changed"

export function notifyActiveYearsChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(ACTIVE_YEARS_CHANGED_EVENT))
}

/**
 * Active calendar years only (`years.is_active = true`), ascending — for filters, charts, add-inspection.
 * Subscribes to `notifyActiveYearsChanged` for cross-page refresh.
 */
export function useYears() {
  const [data, setData] = useState<ManagedYear[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: rows, error: err } = await supabase
      .from("years")
      .select("id, year, is_active")
      .eq("is_active", true)
      .order("year", { ascending: true })

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => {
          const row = r as {
            id: unknown
            year?: number | null
            is_active?: boolean | null
          }
          return {
            id: String(row.id),
            year: typeof row.year === "number" ? row.year : 0,
            isActive: true,
          }
        }),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  useEffect(() => {
    const bump = () => setReloadToken((n) => n + 1)
    window.addEventListener(ACTIVE_YEARS_CHANGED_EVENT, bump)
    return () => window.removeEventListener(ACTIVE_YEARS_CHANGED_EVENT, bump)
  }, [])

  const refetch = useCallback(() => setReloadToken((n) => n + 1), [])

  return { data, loading, error, refetch }
}

/**
 * All years (active and inactive) — admin years table only.
 */
export function useManagedYears() {
  const [data, setData] = useState<ManagedYear[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: rows, error: err } = await supabase
      .from("years")
      .select("id, year, is_active")
      .order("year", { ascending: true })

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => {
          const row = r as {
            id: unknown
            year?: number | null
            is_active?: boolean | null
          }
          return {
            id: String(row.id),
            year: typeof row.year === "number" ? row.year : 0,
            isActive: row.is_active !== false,
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
