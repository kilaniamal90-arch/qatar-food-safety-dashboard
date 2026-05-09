import { useCallback, useEffect, useState } from "react"

import type { Establishment } from "@/data/rawData"
import {
  fetchEstablishmentById,
  fetchEstablishmentOperationalStatusForYear,
  fetchInspectionsDetailForEstablishment,
  type EstablishmentInspectionDetail,
} from "@/lib/supabase/remoteDataset"
import { supabase } from "@/lib/supabase"

export type UseEstablishmentDetailsResult = {
  establishment: Establishment | null
  inspections: EstablishmentInspectionDetail[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useEstablishmentDetails(
  establishmentId: string | null,
  /** Increment when inspections may have changed (e.g. after add). */
  externalReloadKey = 0,
): UseEstablishmentDetailsResult {
  const [establishment, setEstablishment] = useState<Establishment | null>(null)
  const [inspections, setInspections] = useState<EstablishmentInspectionDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const refetch = useCallback(() => setReloadToken((n) => n + 1), [])

  useEffect(() => {
    const id = establishmentId?.trim() ?? ""
    if (!id) {
      setEstablishment(null)
      setInspections([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const year = new Date().getFullYear()
        const [est, insp, statusMap] = await Promise.all([
          fetchEstablishmentById(supabase, id),
          fetchInspectionsDetailForEstablishment(supabase, id),
          fetchEstablishmentOperationalStatusForYear(supabase, [id], year),
        ])
        if (cancelled) return
        if (!est) {
          setEstablishment(null)
          setInspections([])
          setError("not_found")
          return
        }
        const st = statusMap.get(id)
        if (st) est.operationalStatus = st
        setEstablishment(est)
        setInspections(insp)
      } catch (e) {
        if (!cancelled) {
          setEstablishment(null)
          setInspections([])
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [establishmentId, reloadToken, externalReloadKey])

  return { establishment, inspections, loading, error, refetch }
}
