import { useCallback, useEffect, useMemo, useState } from "react"

import type { DataTableSortMode, EnrichedEstablishmentRow } from "@/lib/dataTableModel"
import {
  filterByLastInspectionDateRange,
  sortEnrichedRows,
} from "@/lib/dataTableModel"
import type { EstablishmentsViewFilters } from "@/lib/supabase/remoteDataset"
import {
  fetchEstablishmentsViewFiltered,
  fetchEstablishmentStatusTotals,
  buildRatingLookupFromRows,
  viewRowsToEnriched,
} from "@/lib/supabase/remoteDataset"
import { supabase } from "@/lib/supabase"

export type UseEstablishmentsFilters = EstablishmentsViewFilters & {
  sortMode: DataTableSortMode
  page: number
  pageSize: number
  dateUnknownLabel?: string
  /** Local date `YYYY-MM-DD`; optional lower bound on last inspection date (inclusive). */
  lastInspectionFrom?: string | null
  /** Local date `YYYY-MM-DD`; optional upper bound on last inspection date (inclusive). */
  lastInspectionTo?: string | null
}

export function useEstablishments(filters: UseEstablishmentsFilters) {
  const [rawRows, setRawRows] = useState<EnrichedEstablishmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const filterKey = JSON.stringify({
    search: filters.search ?? "",
    areaId: filters.areaId ?? "",
    areaIds: filters.areaIds ?? null,
    statusEn: filters.statusEn ?? "",
    ratingEn: filters.ratingEn ?? "",
    dateUnknownLabel: filters.dateUnknownLabel ?? "—",
  })

  const refetch = useCallback(() => setReloadToken((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const [flat, ratingsRes] = await Promise.all([
          fetchEstablishmentsViewFiltered(supabase, {
            search: filters.search,
            areaId: filters.areaId,
            areaIds: filters.areaIds,
            statusEn: filters.statusEn,
            ratingEn: filters.ratingEn,
          }),
          supabase.from("ratings").select("id, name_ar, name_en"),
        ])
        if (cancelled) return
        if (ratingsRes.error) {
          console.warn("ratings lookup:", ratingsRes.error.message)
        }
        const ratingLookup =
          !ratingsRes.error && ratingsRes.data
            ? buildRatingLookupFromRows(ratingsRes.data as Record<string, unknown>[])
            : null
        setRawRows(viewRowsToEnriched(flat, ratingLookup, filters.dateUnknownLabel ?? "—"))
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setRawRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filterKey, reloadToken])

  const sortedAll = useMemo(() => {
    const scoped = filterByLastInspectionDateRange(
      rawRows,
      filters.lastInspectionFrom,
      filters.lastInspectionTo,
    )
    return sortEnrichedRows(scoped, filters.sortMode)
  }, [
    rawRows,
    filters.sortMode,
    filters.lastInspectionFrom,
    filters.lastInspectionTo,
  ])

  const totalFiltered = sortedAll.length

  const pageSlice = useMemo(() => {
    const start = Math.max(0, (filters.page - 1) * filters.pageSize)
    return sortedAll.slice(start, start + filters.pageSize)
  }, [sortedAll, filters.page, filters.pageSize])

  return {
    rows: pageSlice,
    sortedAll,
    loading,
    error,
    totalFiltered,
    refetch,
  }
}

export type StatusTotals = {
  total: number
  open: number
  closed: number
  temporaryClosed: number
}

export function useEstablishmentStatusTotals() {
  const [totals, setTotals] = useState<StatusTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const refetch = useCallback(() => setReloadToken((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const { total, byStatus } = await fetchEstablishmentStatusTotals(supabase)
        if (!cancelled) {
          setTotals({
            total,
            open: byStatus["Open"] ?? 0,
            closed: byStatus["Closed"] ?? 0,
            temporaryClosed: byStatus["Temporary Closed"] ?? 0,
          })
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setTotals(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  return { totals, loading, error, refetch }
}
