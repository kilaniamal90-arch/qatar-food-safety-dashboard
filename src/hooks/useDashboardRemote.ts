import { useCallback, useEffect, useMemo, useState } from "react"

import type { ManagedArea } from "@/admin/types"
import type {
  AreaFilter,
  Establishment,
  Inspection,
  OperationalStatus,
  YearFilter,
} from "@/data/rawData"
import { buildReinspectionDaysByInspectionRating } from "@/data/reinspectionThresholds"
import {
  calculateInspectionsTrendPctFromSlices,
  processDataFromSlices,
  type ProcessedData,
} from "@/data/processData"
import type { TableRow } from "@/data/establishmentsTable"
import { prepareStatusFollowUpTableDataFromSlices } from "@/data/establishmentsTable"
import {
  fetchEstablishmentOperationalStatusForYear,
  fetchEstablishmentsRemote,
  fetchInspectionsForEstablishmentsAll,
  fetchInspectionsForEstablishmentsForYearSpan,
} from "@/lib/supabase/remoteDataset"
import { supabase } from "@/lib/supabase"

export function useDashboardRemote(
  year: YearFilter,
  area: AreaFilter,
  areas: ManagedArea[],
  areasLoading: boolean,
  dateUnknownLabel: string,
) {
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [inspectionsAll, setInspectionsAll] = useState<Inspection[]>([])
  const [
    operationalStatusForYearByEstId,
    setOperationalStatusForYearByEstId,
  ] = useState<ReadonlyMap<string, OperationalStatus | null> | null>(null)
  const [
    operationalStatusCurrentYearByEstId,
    setOperationalStatusCurrentYearByEstId,
  ] = useState<ReadonlyMap<string, OperationalStatus | null> | null>(null)
  const [
    reinspectionSeed,
    setReinspectionSeed,
  ] = useState<{
    ratings: { id: string; nameAr: string; nameEn: string }[]
    periods: { rating_id: string; days: number | null }[]
  }>({ ratings: [], periods: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const areaId = useMemo(() => {
    if (area === "all") return null
    const hit = areas.find((a) => a.nameAr === area || a.nameEn === area)
    return hit?.id ?? null
  }, [area, areas])

  const load = useCallback(async () => {
    if (area !== "all" && (areasLoading || areas.length === 0)) {
      return
    }
    if (area !== "all" && !areaId) {
      setEstablishments([])
      setInspections([])
      setInspectionsAll([])
      setOperationalStatusForYearByEstId(null)
      setOperationalStatusCurrentYearByEstId(null)
      setReinspectionSeed({ ratings: [], periods: [] })
      setLoading(false)
      setError(null)
      return
    }

    const calendarYear = Number.parseInt(String(year).trim(), 10)
    if (!Number.isFinite(calendarYear) || calendarYear < 1900 || calendarYear > 2100) {
      setEstablishments([])
      setInspections([])
      setInspectionsAll([])
      setOperationalStatusForYearByEstId(null)
      setOperationalStatusCurrentYearByEstId(null)
      setReinspectionSeed({ ratings: [], periods: [] })
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const est = await fetchEstablishmentsRemote(
        supabase,
        area === "all" ? undefined : areaId ?? undefined,
      )
      const ids = est.map((e) => e.id)
      const y = calendarYear
      const statusYearNow = new Date().getFullYear()

      const [
        insp,
        inspAll,
        statusMap,
        statusMapNow,
        { data: ratingsData, error: ratingsErr },
        { data: periodsData, error: periodsErr },
      ] = await Promise.all([
        fetchInspectionsForEstablishmentsForYearSpan(supabase, ids, y - 1, y),
        fetchInspectionsForEstablishmentsAll(supabase, ids),
        fetchEstablishmentOperationalStatusForYear(supabase, ids, y),
        fetchEstablishmentOperationalStatusForYear(supabase, ids, statusYearNow),
        supabase
          .from("ratings")
          .select("id, name_ar, name_en")
          .order("sort_order", { ascending: true }),
        supabase.from("reinspection_periods").select("rating_id, days"),
      ])

      if (ratingsErr) throw new Error(ratingsErr.message)
      if (periodsErr) throw new Error(periodsErr.message)

      const ratingsParsed = (ratingsData ?? []).map((raw) => {
        const row = raw as {
          id: unknown
          name_ar?: string | null
          name_en?: string | null
        }
        return {
          id: String(row.id),
          nameAr: String(row.name_ar ?? ""),
          nameEn: String(row.name_en ?? ""),
        }
      })

      const periodsParsed = (periodsData ?? []).map((raw) => {
        const row = raw as {
          rating_id?: unknown
          days?: unknown
        }
        return {
          rating_id:
            row.rating_id != null ? String(row.rating_id) : "",
          days:
            typeof row.days === "number" && Number.isFinite(row.days)
              ? row.days
              : null,
        }
      })

      setEstablishments(est)
      setInspections(insp)
      setInspectionsAll(inspAll)
      setOperationalStatusForYearByEstId(statusMap)
      setOperationalStatusCurrentYearByEstId(statusMapNow)
      setReinspectionSeed({
        ratings: ratingsParsed,
        periods: periodsParsed,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEstablishments([])
      setInspections([])
      setInspectionsAll([])
      setOperationalStatusForYearByEstId(null)
      setOperationalStatusCurrentYearByEstId(null)
      setReinspectionSeed({ ratings: [], periods: [] })
    } finally {
      setLoading(false)
    }
  }, [area, areaId, areas, areasLoading, year])

  useEffect(() => {
    void load()
  }, [load])

  const processedData: ProcessedData = useMemo(
    () =>
      processDataFromSlices(
        establishments,
        inspections,
        Number(year),
        area,
        operationalStatusForYearByEstId,
      ),
    [
      establishments,
      inspections,
      year,
      area,
      operationalStatusForYearByEstId,
    ],
  )

  const inspectionsTrendPct = useMemo(
    () =>
      calculateInspectionsTrendPctFromSlices(
        establishments,
        inspections,
        year,
        area,
      ),
    [establishments, inspections, year, area],
  )

  const daysByInspectionRating = useMemo(
    () =>
      buildReinspectionDaysByInspectionRating(
        reinspectionSeed.ratings,
        reinspectionSeed.periods,
      ),
    [reinspectionSeed],
  )

  const tableRows: TableRow[] = useMemo(
    () =>
      prepareStatusFollowUpTableDataFromSlices(
        establishments,
        inspectionsAll,
        area,
        daysByInspectionRating,
        operationalStatusCurrentYearByEstId,
        dateUnknownLabel,
      ),
    [
      establishments,
      inspectionsAll,
      area,
      daysByInspectionRating,
      operationalStatusCurrentYearByEstId,
      dateUnknownLabel,
    ],
  )

  return {
    loading: loading || (area !== "all" && areasLoading && areas.length === 0),
    error,
    processedData,
    inspectionsTrendPct,
    tableRows,
    establishments,
    inspectionsAll,
    refetch: load,
  }
}
